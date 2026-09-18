'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Camera,
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Repeat2,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type SocialPlatform = 'instagram' | 'whatsapp';
type SocialPostType =
  | 'instagram_feed'
  | 'instagram_reel'
  | 'instagram_story'
  | 'whatsapp_campaign'
  | 'whatsapp_status_reminder';
type SocialPostStatus =
  | 'draft'
  | 'scheduled'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled';

type ContactSegment = {
  id: string;
  name: string;
  description: string | null;
};

type SocialPost = {
  id: string;
  account_id: string;
  created_by: string | null;
  platform: SocialPlatform;
  post_type: SocialPostType;
  status: SocialPostStatus;
  title: string;
  caption: string;
  media_url: string | null;
  cover_url: string | null;
  hashtags: string[];
  scheduled_at: string | null;
  published_at: string | null;
  target_segment_id: string | null;
  provider_post_id: string | null;
  provider_payload: Record<string, unknown>;
  last_error: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  segment?: ContactSegment | null;
};

const POST_TYPES: Array<{
  value: SocialPostType;
  platform: SocialPlatform;
  label: string;
  helper: string;
}> = [
  {
    value: 'instagram_feed',
    platform: 'instagram',
    label: 'Instagram Feed',
    helper: 'Post normal no feed.',
  },
  {
    value: 'instagram_reel',
    platform: 'instagram',
    label: 'Instagram Reel',
    helper: 'Vídeo curto para Reels.',
  },
  {
    value: 'instagram_story',
    platform: 'instagram',
    label: 'Instagram Story',
    helper: 'Story publicado pela API oficial da Meta.',
  },
  {
    value: 'whatsapp_campaign',
    platform: 'whatsapp',
    label: 'WhatsApp Campanha',
    helper: 'Agenda o conteúdo para disparo/campanha no CRM.',
  },
  {
    value: 'whatsapp_status_reminder',
    platform: 'whatsapp',
    label: 'WhatsApp Status preparado',
    helper: 'Lembrete com texto/mídia prontos para publicar manualmente.',
  },
];

const STATUS_LABELS: Record<SocialPostStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  ready: 'Pronto',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

const STATUS_BADGES: Record<SocialPostStatus, string> = {
  draft: 'border-muted bg-muted text-muted-foreground',
  scheduled: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  ready: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  publishing: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  published: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  failed: 'border-red-500/30 bg-red-500/10 text-red-400',
  cancelled: 'border-muted bg-muted text-muted-foreground',
};

function datetimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value: string | null) {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function hashtagArray(value: string) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim().replace(/^#/, ''))
    .filter(Boolean);
}

function hashtagText(tags: string[]) {
  return tags.map((tag) => `#${tag}`).join(' ');
}

function platformForType(type: SocialPostType): SocialPlatform {
  return (
    POST_TYPES.find((item) => item.value === type)?.platform ?? 'instagram'
  );
}

function nextDefaultDate() {
  return datetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

export function SocialPlannerPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, profile } = useAuth();
  const canSend = useCan('send-messages');

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [segments, setSegments] = useState<ContactSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [postType, setPostType] = useState<SocialPostType>('instagram_reel');
  const [status, setStatus] = useState<SocialPostStatus>('scheduled');
  const [title, setTitle] = useState('Promoção da semana');
  const [caption, setCaption] = useState(
    'Nova campanha pronta para os clientes. Reserve já o seu horário.'
  );
  const [mediaUrl, setMediaUrl] = useState('');
  const [hashtags, setHashtags] = useState('massagem bemestar relaxamento');
  const [scheduledAt, setScheduledAt] = useState(nextDefaultDate);
  const [targetSegmentId, setTargetSegmentId] = useState('');
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [postsResult, segmentsResult] = await Promise.all([
      supabase
        .from('social_scheduled_posts')
        .select('*, segment:contact_segments(id, name, description)')
        .eq('account_id', accountId)
        .order('scheduled_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('contact_segments')
        .select('id, name, description')
        .eq('account_id', accountId)
        .order('name', { ascending: true }),
    ]);

    if (postsResult.error) {
      toast.error(
        `Não foi possível carregar publicações: ${postsResult.error.message}`
      );
    } else {
      setPosts((postsResult.data ?? []) as SocialPost[]);
    }

    if (segmentsResult.error) {
      toast.error(
        `Não foi possível carregar segmentos: ${segmentsResult.error.message}`
      );
    } else {
      setSegments((segmentsResult.data ?? []) as ContactSegment[]);
    }
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // Loading follows the authenticated account becoming available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  async function createPost() {
    if (!accountId || !profile?.id || !canSend) return;
    if (!title.trim()) return toast.error('Dê um título à publicação.');
    if (!caption.trim()) return toast.error('Escreva a legenda ou mensagem.');

    const plannedDate = scheduledAt ? new Date(scheduledAt) : null;
    if (status !== 'draft') {
      if (!plannedDate || Number.isNaN(plannedDate.getTime())) {
        return toast.error('Informe uma data/hora válida.');
      }
      if (plannedDate.getTime() <= Date.now()) {
        return toast.error('Escolha uma data/hora no futuro.');
      }
    }

    setSaving(true);
    const platform = platformForType(postType);
    const { error } = await supabase.from('social_scheduled_posts').insert({
      account_id: accountId,
      created_by: profile.id,
      platform,
      post_type: postType,
      status,
      title: title.trim(),
      caption: caption.trim(),
      media_url: mediaUrl.trim() || null,
      hashtags: hashtagArray(hashtags),
      scheduled_at: plannedDate?.toISOString() ?? null,
      target_segment_id:
        platform === 'whatsapp' && targetSegmentId ? targetSegmentId : null,
      notes: notes.trim() || null,
      provider_payload: {
        source: 'crm_social_planner',
        official_whatsapp_status_auto_publish: false,
      },
    });
    setSaving(false);

    if (error) return toast.error(error.message);

    toast.success('Publicação guardada no calendário.');
    setTitle('');
    setCaption('');
    setMediaUrl('');
    setNotes('');
    setScheduledAt(nextDefaultDate());
    await loadData();
  }

  async function updatePostStatus(
    post: SocialPost,
    nextStatus: SocialPostStatus
  ) {
    if (!canSend) return;
    const patch: Partial<SocialPost> = {
      status: nextStatus,
      published_at:
        nextStatus === 'published'
          ? new Date().toISOString()
          : post.published_at,
    };
    const { error } = await supabase
      .from('social_scheduled_posts')
      .update(patch)
      .eq('id', post.id)
      .eq('account_id', accountId);

    if (error) return toast.error(error.message);
    toast.success(
      `Publicação marcada como ${STATUS_LABELS[nextStatus].toLowerCase()}.`
    );
    await loadData();
  }

  async function duplicatePost(post: SocialPost) {
    if (!accountId || !profile?.id || !canSend) return;
    const nextDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('social_scheduled_posts').insert({
      account_id: accountId,
      created_by: profile.id,
      platform: post.platform,
      post_type: post.post_type,
      status: 'draft',
      title: `${post.title} (cópia)`,
      caption: post.caption,
      media_url: post.media_url,
      cover_url: post.cover_url,
      hashtags: post.hashtags,
      scheduled_at: nextDate,
      target_segment_id: post.target_segment_id,
      notes: post.notes,
      provider_payload: {
        duplicated_from: post.id,
        source: 'crm_social_planner',
      },
    });

    if (error) return toast.error(error.message);
    toast.success('Publicação duplicada como rascunho.');
    await loadData();
  }

  async function copyPost(post: SocialPost) {
    const text = [post.caption, hashtagText(post.hashtags)]
      .filter(Boolean)
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    toast.success('Legenda copiada.');
  }

  const scheduledPosts = posts.filter((post) =>
    ['draft', 'scheduled', 'ready', 'publishing'].includes(post.status)
  );
  const historyPosts = posts.filter((post) =>
    ['published', 'failed', 'cancelled'].includes(post.status)
  );
  const instagramCount = scheduledPosts.filter(
    (post) => post.platform === 'instagram'
  ).length;
  const whatsappCount = scheduledPosts.filter(
    (post) => post.platform === 'whatsapp'
  ).length;
  const selectedType = POST_TYPES.find((item) => item.value === postType);
  const selectedPlatform = platformForType(postType);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="text-primary size-6" />
            Publicações programadas
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Planeie Stories, Reels, posts e campanhas num calendário único de
            marketing.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Próximos conteúdos"
          value={scheduledPosts.length}
          icon={CalendarClock}
        />
        <MetricCard
          label="Instagram em fila"
          value={instagramCount}
          icon={Camera}
        />
        <MetricCard
          label="WhatsApp preparado"
          value={whatsappCount}
          icon={MessageCircle}
        />
      </div>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-400" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-amber-300">
              Regra de segurança do módulo
            </p>
            <p className="text-muted-foreground">
              Instagram Feed/Reels/Stories fica preparado para a API oficial da
              Meta. WhatsApp Status não tem publicação automática oficial; por
              isso o CRM agenda o conteúdo e deixa tudo pronto para
              copiar/publicar com segurança.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,430px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Nova publicação</CardTitle>
            <CardDescription>
              Crie o conteúdo uma vez e acompanhe pelo calendário de marketing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Tipo de conteúdo
              </label>
              <select
                value={postType}
                onChange={(event) => {
                  const nextType = event.target.value as SocialPostType;
                  setPostType(nextType);
                  if (platformForType(nextType) === 'instagram') {
                    setTargetSegmentId('');
                  }
                }}
                disabled={!canSend || saving}
                className="border-input bg-background ring-offset-background w-full rounded-md border px-3 py-2 text-sm"
              >
                {POST_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground mt-1 text-xs">
                {selectedType?.helper}
              </p>
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Estado inicial
              </label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as SocialPostStatus)
                }
                disabled={!canSend || saving}
                className="border-input bg-background ring-offset-background w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="scheduled">Agendado</option>
                <option value="draft">Rascunho</option>
                <option value="ready">Pronto para publicar</option>
              </select>
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Título interno
              </label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex: Reel drenagem linfática"
                disabled={!canSend || saving}
              />
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Data/hora
              </label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                min={datetimeLocalValue()}
                onChange={(event) => setScheduledAt(event.target.value)}
                disabled={!canSend || saving}
              />
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                URL da mídia
              </label>
              <Input
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="https://... vídeo ou imagem"
                disabled={!canSend || saving}
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Upload direto pode entrar na próxima camada; agora aceita link
                público.
              </p>
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Legenda / mensagem
              </label>
              <Textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                rows={6}
                disabled={!canSend || saving}
              />
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Hashtags
              </label>
              <Input
                value={hashtags}
                onChange={(event) => setHashtags(event.target.value)}
                placeholder="massagem bemestar relaxamento"
                disabled={!canSend || saving}
              />
            </div>

            {selectedPlatform === 'whatsapp' ? (
              <div>
                <label className="text-foreground mb-1.5 block text-sm font-medium">
                  Segmento alvo
                </label>
                <select
                  value={targetSegmentId}
                  onChange={(event) => setTargetSegmentId(event.target.value)}
                  disabled={!canSend || saving}
                  className="border-input bg-background ring-offset-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Sem segmento definido</option>
                  {segments.map((segment) => (
                    <option key={segment.id} value={segment.id}>
                      {segment.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Notas internas
              </label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Ideia, objetivo, CTA, observações da campanha..."
                disabled={!canSend || saving}
              />
            </div>

            <Button
              onClick={createPost}
              disabled={saving || !canSend || !title.trim() || !caption.trim()}
              className="w-full"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              Guardar no calendário
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <PostList
            title="Calendário de publicações"
            description="Conteúdos que ainda vão entrar em ação."
            posts={scheduledPosts}
            loading={loading}
            empty="Ainda não há publicações programadas."
            onCopy={copyPost}
            onDuplicate={duplicatePost}
            onStatus={updatePostStatus}
          />
          <PostList
            title="Histórico"
            description="Conteúdos publicados, cancelados ou com falha."
            posts={historyPosts}
            loading={loading}
            empty="Ainda não há histórico de publicações."
            onCopy={copyPost}
            onDuplicate={duplicatePost}
            onStatus={updatePostStatus}
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof CalendarClock;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="text-foreground text-2xl font-bold">{value}</p>
        </div>
        <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function PostList({
  title,
  description,
  posts,
  loading,
  empty,
  onCopy,
  onDuplicate,
  onStatus,
}: {
  title: string;
  description: string;
  posts: SocialPost[];
  loading: boolean;
  empty: string;
  onCopy: (post: SocialPost) => void;
  onDuplicate: (post: SocialPost) => void;
  onStatus: (post: SocialPost, status: SocialPostStatus) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="text-primary size-6 animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="border-border bg-muted/20 flex h-32 flex-col items-center justify-center rounded-lg border border-dashed text-center">
            <CalendarClock className="text-muted-foreground mb-2 size-7" />
            <p className="text-muted-foreground text-sm">{empty}</p>
          </div>
        ) : (
          <div className="divide-border divide-y">
            {posts.map((post) => (
              <article key={post.id} className="space-y-3 py-4 first:pt-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {post.platform === 'instagram' ? (
                        <Camera className="size-4 text-pink-400" />
                      ) : (
                        <MessageCircle className="size-4 text-emerald-400" />
                      )}
                      <h3 className="text-foreground font-semibold">
                        {post.title}
                      </h3>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {formatPostType(post.post_type)} ·{' '}
                      {formatDateTime(post.scheduled_at)}
                    </p>
                  </div>
                  <Badge className={cn('border', STATUS_BADGES[post.status])}>
                    {post.status === 'published' ? (
                      <CheckCircle2 className="mr-1 size-3" />
                    ) : post.status === 'failed' ? (
                      <XCircle className="mr-1 size-3" />
                    ) : null}
                    {STATUS_LABELS[post.status]}
                  </Badge>
                </div>

                <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-wrap">
                  {post.caption}
                </p>
                {post.hashtags.length > 0 ? (
                  <p className="text-primary text-xs">
                    {hashtagText(post.hashtags)}
                  </p>
                ) : null}
                {post.media_url ? (
                  <a
                    href={post.media_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary text-xs underline-offset-4 hover:underline"
                  >
                    Abrir mídia
                  </a>
                ) : null}
                {post.segment?.name ? (
                  <p className="text-muted-foreground text-xs">
                    Segmento: {post.segment.name}
                  </p>
                ) : null}
                {post.last_error ? (
                  <Badge
                    variant="destructive"
                    className="h-auto whitespace-normal"
                  >
                    {post.last_error}
                  </Badge>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCopy(post)}
                  >
                    <Copy className="size-3.5" />
                    Copiar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDuplicate(post)}
                  >
                    <Repeat2 className="size-3.5" />
                    Duplicar
                  </Button>
                  {['draft', 'scheduled', 'ready', 'failed'].includes(
                    post.status
                  ) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStatus(post, 'published')}
                    >
                      <Send className="size-3.5" />
                      Marcar publicado
                    </Button>
                  ) : null}
                  {['draft', 'scheduled', 'ready'].includes(post.status) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStatus(post, 'cancelled')}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatPostType(type: SocialPostType) {
  return POST_TYPES.find((item) => item.value === type)?.label ?? 'Publicação';
}
