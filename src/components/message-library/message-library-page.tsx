'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Copy,
  ExternalLink,
  FileText,
  Image,
  LibraryBig,
  Link2,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Video,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { createClient } from '@/lib/supabase/client';
import {
  MEDIA_MAX_BYTES,
  uploadAccountMedia,
} from '@/lib/storage/upload-media';
import { cn } from '@/lib/utils';

type LibraryItemType = 'text' | 'link' | 'image' | 'video' | 'document' | 'audio';

type LibraryItem = {
  id: string;
  account_id: string;
  user_id: string | null;
  title: string;
  category: string;
  item_type: LibraryItemType;
  content_text: string | null;
  asset_url: string | null;
  caption: string | null;
  tags: string[];
  is_favorite: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

type Draft = {
  id?: string;
  title: string;
  category: string;
  item_type: LibraryItemType;
  content_text: string;
  asset_url: string;
  caption: string;
  tagsText: string;
  is_favorite: boolean;
};

const TYPE_META: Record<
  LibraryItemType,
  { label: string; icon: typeof MessageSquareText; gradient: string }
> = {
  text: {
    label: 'Texto',
    icon: MessageSquareText,
    gradient: 'from-violet-500/20 via-fuchsia-500/10 to-transparent',
  },
  link: {
    label: 'Link',
    icon: Link2,
    gradient: 'from-blue-500/20 via-cyan-500/10 to-transparent',
  },
  image: {
    label: 'Imagem',
    icon: Image,
    gradient: 'from-emerald-500/20 via-teal-500/10 to-transparent',
  },
  video: {
    label: 'Vídeo',
    icon: Video,
    gradient: 'from-rose-500/20 via-orange-500/10 to-transparent',
  },
  document: {
    label: 'Documento',
    icon: FileText,
    gradient: 'from-amber-500/20 via-yellow-500/10 to-transparent',
  },
  audio: {
    label: 'Áudio',
    icon: AudioLines,
    gradient: 'from-indigo-500/20 via-sky-500/10 to-transparent',
  },
};

const DEFAULT_CATEGORIES = [
  'Geral',
  'Vendas',
  'Follow-up',
  'Agenda',
  'Financeiro',
  'Vouchers',
  'Pós-atendimento',
];

function emptyDraft(): Draft {
  return {
    title: '',
    category: 'Geral',
    item_type: 'text',
    content_text: '',
    asset_url: '',
    caption: '',
    tagsText: '',
    is_favorite: false,
  };
}

function previewText(item: LibraryItem) {
  if (item.item_type === 'link') return item.asset_url || item.content_text || '';
  if (item.item_type === 'text') return item.content_text || '';
  return item.caption || item.asset_url || '';
}

function fullCopyText(item: LibraryItem) {
  if (item.item_type === 'text') return item.content_text || '';
  if (item.item_type === 'link') {
    return [item.content_text, item.asset_url].filter(Boolean).join('\n');
  }
  return [item.caption, item.asset_url].filter(Boolean).join('\n');
}

export function MessageLibraryPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user } = useAuth();
  const canOperate = useCan('send-messages');

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [type, setType] = useState<'all' | LibraryItemType>('all');

  const loadItems = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('message_library_items')
      .select('*')
      .eq('account_id', accountId)
      .order('is_favorite', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) toast.error(`Não foi possível carregar biblioteca: ${error.message}`);
    else setItems((data ?? []) as LibraryItem[]);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // Initial remote-data synchronization for this client view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
  }, [loadItems]);

  const categories = useMemo(() => {
    const fromItems = items.map((item) => item.category).filter(Boolean);
    return ['Todas', ...Array.from(new Set([...DEFAULT_CATEGORIES, ...fromItems]))];
  }, [items]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt');
    return items.filter((item) => {
      if (category !== 'Todas' && item.category !== category) return false;
      if (type !== 'all' && item.item_type !== type) return false;
      if (!needle) return true;
      return [
        item.title,
        item.category,
        item.content_text,
        item.asset_url,
        item.caption,
        ...(item.tags ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt')
        .includes(needle);
    });
  }, [category, items, query, type]);

  const favoriteCount = items.filter((item) => item.is_favorite).length;
  const mediaCount = items.filter((item) =>
    ['image', 'video', 'document', 'audio'].includes(item.item_type)
  ).length;

  function editItem(item: LibraryItem) {
    setDraft({
      id: item.id,
      title: item.title,
      category: item.category,
      item_type: item.item_type,
      content_text: item.content_text || '',
      asset_url: item.asset_url || '',
      caption: item.caption || '',
      tagsText: (item.tags ?? []).join(', '),
      is_favorite: item.is_favorite,
    });
  }

  async function saveDraft() {
    if (!draft || !accountId || !user?.id || !canOperate) return;
    if (!draft.title.trim()) return toast.error('Informe o título.');
    const needsUrl = draft.item_type !== 'text';
    if (needsUrl && !draft.asset_url.trim()) {
      return toast.error('Informe a URL do material.');
    }
    if (!needsUrl && !draft.content_text.trim()) {
      return toast.error('Escreva o conteúdo do texto.');
    }

    const payload = {
      account_id: accountId,
      user_id: user.id,
      title: draft.title.trim(),
      category: draft.category.trim() || 'Geral',
      item_type: draft.item_type,
      content_text: draft.content_text.trim() || null,
      asset_url: draft.asset_url.trim() || null,
      caption: draft.caption.trim() || null,
      tags: draft.tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      is_favorite: draft.is_favorite,
    };

    setSaving(true);
    const request = draft.id
      ? supabase
          .from('message_library_items')
          .update(payload)
          .eq('id', draft.id)
          .eq('account_id', accountId)
      : supabase.from('message_library_items').insert(payload);
    const { error } = await request;
    setSaving(false);

    if (error) return toast.error(error.message);
    toast.success(draft.id ? 'Item atualizado.' : 'Item criado.');
    setDraft(null);
    await loadItems();
  }

  async function copyItem(item: LibraryItem) {
    const text = fullCopyText(item);
    if (!text.trim()) return toast.error('Nada para copiar.');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado.');
      await supabase
        .from('message_library_items')
        .update({
          usage_count: Number(item.usage_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('account_id', accountId);
      await loadItems();
    } catch {
      toast.error('Não foi possível copiar automaticamente.');
    }
  }

  async function toggleFavorite(item: LibraryItem) {
    const { error } = await supabase
      .from('message_library_items')
      .update({ is_favorite: !item.is_favorite })
      .eq('id', item.id)
      .eq('account_id', accountId);
    if (error) return toast.error(error.message);
    await loadItems();
  }

  async function deleteItem(item: LibraryItem) {
    if (!window.confirm(`Excluir "${item.title}"?`)) return;
    const { error } = await supabase
      .from('message_library_items')
      .delete()
      .eq('id', item.id)
      .eq('account_id', accountId);
    if (error) return toast.error(error.message);
    toast.success('Item excluído.');
    await loadItems();
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.14),transparent_30%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" />
              Centro comercial de mensagens
            </div>
            <h1 className="text-foreground text-3xl font-bold tracking-tight">
              Biblioteca de respostas & materiais
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              Organize scripts, links, PDFs, imagens, áudios e mensagens
              prontas para copiar agora e enviar pelo WhatsApp com agilidade.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadItems} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Atualizar
            </Button>
            <Button onClick={() => setDraft(emptyDraft())} disabled={!canOperate}>
              <Plus />
              Novo material
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Materiais" value={items.length} icon={LibraryBig} />
        <MetricCard label="Favoritos" value={favoriteCount} icon={Star} />
        <MetricCard label="Mídias/links" value={mediaCount} icon={Link2} />
      </div>

      <Card>
        <CardContent className="grid gap-3 py-4 lg:grid-cols-[1fr_220px_220px]">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título, categoria, tag, texto ou URL..."
              className="pl-9"
            />
          </div>
          <Select
            value={category}
            onValueChange={(value) => setCategory(value ?? 'Todas')}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(value) => setType(value as 'all' | LibraryItemType)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(TYPE_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="text-primary size-7 animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="border-border bg-card flex h-72 flex-col items-center justify-center rounded-3xl border border-dashed text-center">
          <LibraryBig className="text-muted-foreground mb-3 size-10" />
          <p className="text-foreground text-sm font-medium">
            Nenhum material encontrado.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Crie scripts, links e materiais para acelerar o atendimento.
          </p>
          <Button className="mt-4" onClick={() => setDraft(emptyDraft())}>
            <Plus />
            Criar primeiro material
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              onCopy={copyItem}
              onEdit={editItem}
              onFavorite={toggleFavorite}
              onDelete={deleteItem}
            />
          ))}
        </div>
      )}

      <LibraryDialog
        draft={draft}
        saving={saving}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onSave={saveDraft}
      />
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
  icon: typeof LibraryBig;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 w-28 bg-primary/10 blur-2xl" />
      <CardContent className="relative flex items-center justify-between py-4">
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-foreground mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-2xl">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function LibraryCard({
  item,
  onCopy,
  onEdit,
  onFavorite,
  onDelete,
}: {
  item: LibraryItem;
  onCopy: (item: LibraryItem) => void;
  onEdit: (item: LibraryItem) => void;
  onFavorite: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
}) {
  const meta = TYPE_META[item.item_type];
  const Icon = meta.icon;
  const preview = previewText(item);

  return (
    <Card className="group relative min-h-72 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-br ${meta.gradient}`} />
      <CardHeader className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="bg-background/80 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border backdrop-blur">
              <Icon className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate">{item.title}</CardTitle>
              <CardDescription className="truncate">
                {item.category} · {meta.label}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onFavorite(item)}
            className={cn(item.is_favorite && 'text-amber-400')}
            aria-label="Favoritar"
          >
            <Star className={cn(item.is_favorite && 'fill-current')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="relative flex flex-1 flex-col gap-4">
        <p className="text-muted-foreground line-clamp-5 min-h-24 text-sm whitespace-pre-wrap">
          {preview || 'Sem prévia'}
        </p>

        {item.tags?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="text-muted-foreground mt-auto flex items-center justify-between text-xs">
          <span>{item.usage_count || 0} uso(s)</span>
          {item.asset_url ? (
            <a
              href={item.asset_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary inline-flex items-center gap-1"
            >
              Abrir <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Button onClick={() => onCopy(item)}>
            <Copy />
            Copiar
          </Button>
          <Button variant="outline" size="icon" onClick={() => onEdit(item)}>
            <Pencil />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onDelete(item)}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LibraryDialog({
  draft,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft | null;
  saving: boolean;
  onChange: (draft: Draft | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadAsset(file?: File) {
    if (!file || !draft) return;
    if (file.size > MEDIA_MAX_BYTES) {
      toast.error('O ficheiro não pode ultrapassar 16 MB.');
      return;
    }
    setUploading(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      onChange({ ...draft, asset_url: publicUrl });
      toast.success('Ficheiro carregado.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o ficheiro.'
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {draft?.id ? 'Editar material' : 'Novo material da biblioteca'}
          </DialogTitle>
        </DialogHeader>
        {draft ? (
          <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título">
                <Input
                  value={draft.title}
                  onChange={(event) =>
                    onChange({ ...draft, title: event.target.value })
                  }
                  placeholder="Ex.: Pacote relaxamento premium"
                />
              </Field>
              <Field label="Categoria">
                <Input
                  value={draft.category}
                  onChange={(event) =>
                    onChange({ ...draft, category: event.target.value })
                  }
                  placeholder="Vendas, Follow-up, Vouchers..."
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <Select
                  value={draft.item_type}
                  onValueChange={(value) =>
                    onChange({ ...draft, item_type: value as LibraryItemType })
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_META).map(([key, meta]) => (
                      <SelectItem key={key} value={key}>
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tags">
                <Input
                  value={draft.tagsText}
                  onChange={(event) =>
                    onChange({ ...draft, tagsText: event.target.value })
                  }
                  placeholder="separe por vírgulas"
                />
              </Field>
            </div>

            {draft.item_type !== 'text' ? (
              <Field label="URL do material">
                <div className="flex gap-2">
                  <Input
                    value={draft.asset_url}
                    onChange={(event) =>
                      onChange({ ...draft, asset_url: event.target.value })
                    }
                    placeholder="Cole uma URL ou carregue um ficheiro"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={
                      draft.item_type === 'image'
                        ? 'image/jpeg,image/png,image/webp,image/gif'
                        : undefined
                    }
                    onChange={(event) => {
                      void uploadAsset(event.target.files?.[0]);
                      event.currentTarget.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                    Carregar
                  </Button>
                </div>
              </Field>
            ) : null}

            <Field label={draft.item_type === 'text' ? 'Texto' : 'Texto complementar'}>
              <Textarea
                value={draft.content_text}
                onChange={(event) =>
                  onChange({ ...draft, content_text: event.target.value })
                }
                rows={draft.item_type === 'text' ? 8 : 4}
                placeholder="Mensagem/script para copiar ou acompanhar o material"
              />
            </Field>

            {draft.item_type !== 'text' ? (
              <Field label="Legenda da mídia/link">
                <Textarea
                  value={draft.caption}
                  onChange={(event) =>
                    onChange({ ...draft, caption: event.target.value })
                  }
                  rows={3}
                  placeholder="Legenda opcional para WhatsApp"
                />
              </Field>
            ) : null}

            <label className="border-border bg-muted/30 flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3">
              <span>
                <span className="text-foreground block text-sm font-medium">
                  Favorito
                </span>
                <span className="text-muted-foreground text-xs">
                  Aparece no topo da biblioteca.
                </span>
              </span>
              <input
                type="checkbox"
                checked={draft.is_favorite}
                onChange={(event) =>
                  onChange({ ...draft, is_favorite: event.target.checked })
                }
                className="accent-primary size-4"
              />
            </label>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Plus />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-foreground mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
