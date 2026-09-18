'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { CustomField, Tag } from '@/types';
import { cn } from '@/lib/utils';

type AudienceType = 'all' | 'tags' | 'custom_field';
type CustomFieldOperator = 'is' | 'is_not' | 'contains';

interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  excludeTagIds?: string[];
  customField?: {
    fieldId: string;
    operator: CustomFieldOperator;
    value: string;
  };
}

interface ContactSegmentRow {
  id: string;
  name: string;
  description?: string | null;
  config: AudienceConfig;
  created_at: string;
}

const DEFAULT_CONFIG: AudienceConfig = { type: 'all' };

export function SegmentsPage() {
  const t = useTranslations('Segments');
  const { accountId } = useAuth();
  const [segments, setSegments] = useState<ContactSegmentRow[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<AudienceConfig>(DEFAULT_CONFIG);

  const selectedTags = config.tagIds ?? [];
  const excludedTags = config.excludeTagIds ?? [];

  const tagById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags]
  );
  const customFieldById = useMemo(
    () => new Map(customFields.map((field) => [field.id, field])),
    [customFields]
  );

  const estimateAudience = useCallback(
    async (audience: AudienceConfig) => {
      const supabase = createClient();
      let baseIds: Set<string> | null = null;

      if (audience.type === 'tags' && audience.tagIds?.length) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.tagIds);
        baseIds = new Set((data ?? []).map((row) => row.contact_id));
      } else if (
        audience.type === 'custom_field' &&
        audience.customField?.fieldId &&
        audience.customField.value
      ) {
        const { fieldId, operator, value } = audience.customField;
        let query = supabase
          .from('contact_custom_values')
          .select('contact_id')
          .eq('custom_field_id', fieldId);
        if (operator === 'is') query = query.eq('value', value);
        else if (operator === 'is_not') query = query.neq('value', value);
        else query = query.ilike('value', `%${value}%`);
        const { data } = await query;
        baseIds = new Set((data ?? []).map((row) => row.contact_id));
      } else if (audience.type !== 'all') {
        return 0;
      }

      let excluded: Set<string> | null = null;
      if (audience.excludeTagIds?.length) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.excludeTagIds);
        excluded = new Set((data ?? []).map((row) => row.contact_id));
      }

      if (baseIds) {
        return [...baseIds].filter((id) => !excluded?.has(id)).length;
      }

      const { count } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true });
      return Math.max(0, (count ?? 0) - (excluded?.size ?? 0));
    },
    []
  );

  const fetchSegments = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const [segmentsRes, tagsRes, fieldsRes] = await Promise.all([
        supabase
          .from('contact_segments')
          .select('id, name, description, config, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
        supabase.from('tags').select('*').eq('account_id', accountId).order('name'),
        supabase
          .from('custom_fields')
          .select('*')
          .eq('account_id', accountId)
          .order('field_name'),
      ]);

      if (segmentsRes.error) throw segmentsRes.error;
      setSegments((segmentsRes.data ?? []) as ContactSegmentRow[]);
      setTags(tagsRes.data ?? []);
      setCustomFields(fieldsRes.data ?? []);

      const nextCounts: Record<string, number | null> = {};
      await Promise.all(
        ((segmentsRes.data ?? []) as ContactSegmentRow[]).map(async (item) => {
          try {
            nextCounts[item.id] = await estimateAudience(item.config);
          } catch {
            nextCounts[item.id] = null;
          }
        })
      );
      setCounts(nextCounts);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('toastLoadFailed');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [accountId, estimateAudience, t]);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  function toggleTag(tagId: string, mode: 'include' | 'exclude') {
    const key = mode === 'include' ? 'tagIds' : 'excludeTagIds';
    const current = config[key] ?? [];
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    setConfig({ ...config, [key]: next });
  }

  async function saveSegment() {
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error(t('toastNameRequired'));
      return;
    }
    if (!accountId) {
      toast.error(t('toastNoAccount'));
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error(t('toastNotSignedIn'));

      const { error } = await supabase.from('contact_segments').insert({
        account_id: accountId,
        user_id: user.id,
        name: cleanName,
        description: description.trim() || null,
        config,
      });
      if (error) throw error;
      toast.success(t('toastCreated'));
      setName('');
      setDescription('');
      setConfig(DEFAULT_CONFIG);
      fetchSegments();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('toastSaveFailed');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSegment(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('contact_segments').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t('toastDeleted'));
    fetchSegments();
  }

  function describeSegment(item: ContactSegmentRow) {
    if (item.config.type === 'all') return t('typeAll');
    if (item.config.type === 'tags') {
      const names = (item.config.tagIds ?? [])
        .map((id) => tagById.get(id)?.name)
        .filter(Boolean)
        .join(', ');
      return names ? t('typeTagsWithNames', { names }) : t('typeTags');
    }
    const field = item.config.customField?.fieldId
      ? customFieldById.get(item.config.customField.fieldId)?.field_name
      : null;
    return field
      ? t('typeFieldWithName', { name: field })
      : t('typeCustomField');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('desc')}</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="border-border bg-card/70">
          <CardHeader>
            <CardTitle>{t('builderTitle')}</CardTitle>
            <CardDescription>{t('builderDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('namePlaceholder')}
            />
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('descriptionPlaceholder')}
            />

            <div className="grid gap-2 sm:grid-cols-3">
              {(['all', 'tags', 'custom_field'] as AudienceType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setConfig({ ...DEFAULT_CONFIG, type })}
                  className={cn(
                    'border-border bg-muted/40 text-muted-foreground rounded-xl border px-3 py-2 text-left text-sm transition',
                    config.type === type &&
                      'border-primary/50 bg-primary/10 text-primary'
                  )}
                >
                  {t(`types.${type}`)}
                </button>
              ))}
            </div>

            {config.type === 'tags' && (
              <TagPicker
                title={t('includeTags')}
                tags={tags}
                selected={selectedTags}
                onToggle={(tagId) => toggleTag(tagId, 'include')}
              />
            )}

            {config.type === 'custom_field' && (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)]">
                <select
                  value={config.customField?.fieldId ?? ''}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      customField: {
                        fieldId: event.target.value,
                        operator: config.customField?.operator ?? 'is',
                        value: config.customField?.value ?? '',
                      },
                    })
                  }
                  className="border-input bg-background rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">{t('selectField')}</option>
                  {customFields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.field_name}
                    </option>
                  ))}
                </select>
                <select
                  value={config.customField?.operator ?? 'is'}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      customField: {
                        fieldId: config.customField?.fieldId ?? '',
                        operator: event.target.value as CustomFieldOperator,
                        value: config.customField?.value ?? '',
                      },
                    })
                  }
                  className="border-input bg-background rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="is">{t('operatorIs')}</option>
                  <option value="is_not">{t('operatorIsNot')}</option>
                  <option value="contains">{t('operatorContains')}</option>
                </select>
                <Input
                  value={config.customField?.value ?? ''}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      customField: {
                        fieldId: config.customField?.fieldId ?? '',
                        operator: config.customField?.operator ?? 'is',
                        value: event.target.value,
                      },
                    })
                  }
                  placeholder={t('valuePlaceholder')}
                />
              </div>
            )}

            <TagPicker
              title={t('excludeTags')}
              tags={tags}
              selected={excludedTags}
              onToggle={(tagId) => toggleTag(tagId, 'exclude')}
              danger
            />

            <Button onClick={saveSegment} disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {t('save')}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/70">
          <CardHeader>
            <CardTitle>{t('listTitle')}</CardTitle>
            <CardDescription>{t('listDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="text-primary size-4 animate-spin" />
                {t('loading')}
              </div>
            ) : segments.length === 0 ? (
              <div className="border-border bg-muted/35 rounded-xl border p-6 text-center">
                <Bookmark className="text-muted-foreground mx-auto size-7" />
                <p className="text-foreground mt-2 text-sm font-medium">
                  {t('emptyTitle')}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('emptyDesc')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {segments.map((item) => (
                  <div
                    key={item.id}
                    className="border-border bg-background/45 rounded-xl border p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-foreground truncate text-sm font-semibold">
                          {item.name}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {describeSegment(item)}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteSegment(item.id)}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {item.description && (
                      <p className="text-muted-foreground mt-3 text-sm">
                        {item.description}
                      </p>
                    )}
                    <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
                      <Users className="size-3.5" />
                      {counts[item.id] == null
                        ? t('unknownCount')
                        : t('estimatedCount', {
                            count: counts[item.id] ?? 0,
                          })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TagPicker({
  title,
  tags,
  selected,
  onToggle,
  danger,
}: {
  title: string;
  tags: Tag[];
  selected: string[];
  onToggle: (tagId: string) => void;
  danger?: boolean;
}) {
  if (tags.length === 0) return null;

  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const active = selected.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggle(tag.id)}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition',
                active
                  ? danger
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              <span
                className="mr-1.5 size-2 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
