'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AudioLines,
  FileText,
  Image,
  LibraryBig,
  Link2,
  Loader2,
  MessageSquareText,
  Search,
  Star,
  Video,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type LibraryItemType = 'text' | 'link' | 'image' | 'video' | 'document' | 'audio';

export type InboxLibraryItem = {
  id: string;
  title: string;
  category: string;
  item_type: LibraryItemType;
  content_text: string | null;
  asset_url: string | null;
  caption: string | null;
  tags: string[];
  is_favorite: boolean;
  usage_count: number;
};

const TYPE_META: Record<
  LibraryItemType,
  { label: string; icon: typeof MessageSquareText; className: string }
> = {
  text: {
    label: 'Texto',
    icon: MessageSquareText,
    className: 'bg-violet-500/10 text-violet-400',
  },
  link: {
    label: 'Link',
    icon: Link2,
    className: 'bg-blue-500/10 text-blue-400',
  },
  image: {
    label: 'Imagem',
    icon: Image,
    className: 'bg-emerald-500/10 text-emerald-400',
  },
  video: {
    label: 'Vídeo',
    icon: Video,
    className: 'bg-rose-500/10 text-rose-400',
  },
  document: {
    label: 'Documento',
    icon: FileText,
    className: 'bg-amber-500/10 text-amber-400',
  },
  audio: {
    label: 'Áudio',
    icon: AudioLines,
    className: 'bg-indigo-500/10 text-indigo-400',
  },
};

function preview(item: InboxLibraryItem) {
  if (item.item_type === 'text') return item.content_text || '';
  if (item.item_type === 'link') return item.content_text || item.asset_url || '';
  return item.caption || item.asset_url || '';
}

function searchText(item: InboxLibraryItem) {
  return [
    item.title,
    item.category,
    item.content_text,
    item.caption,
    item.asset_url,
    ...(item.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('pt');
}

export function LibraryPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: InboxLibraryItem) => void;
}) {
  const [items, setItems] = useState<InboxLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Loading state belongs to the dialog's open lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('message_library_items')
        .select(
          'id, title, category, item_type, content_text, asset_url, caption, tags, is_favorite, usage_count'
        )
        .order('is_favorite', { ascending: false })
        .order('updated_at', { ascending: false });
      if (!cancelled) {
        setItems((data ?? []) as InboxLibraryItem[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt');
    if (!needle) return items;
    return items.filter((item) => searchText(item).includes(needle));
  }, [items, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LibraryBig className="text-primary size-5" />
            Biblioteca
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar material, script, tag ou URL..."
              className="pl-9"
            />
          </div>

          <div className="max-h-[62vh] overflow-y-auto pr-1">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="text-primary size-5 animate-spin" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="border-border bg-muted/20 rounded-xl border border-dashed py-10 text-center">
                <LibraryBig className="text-muted-foreground mx-auto mb-2 size-8" />
                <p className="text-muted-foreground text-sm">
                  Nenhum material encontrado.
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {filteredItems.map((item) => {
                  const meta = TYPE_META[item.item_type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onPick(item)}
                      className="border-border bg-card hover:border-primary/50 hover:bg-muted/40 group flex min-h-32 flex-col rounded-xl border p-3 text-left transition-colors"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-xl',
                              meta.className
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="text-foreground block truncate text-sm font-medium">
                              {item.title}
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {item.category} · {meta.label}
                            </span>
                          </span>
                        </span>
                        {item.is_favorite ? (
                          <Star className="size-4 shrink-0 fill-amber-400 text-amber-400" />
                        ) : null}
                      </span>
                      <span className="text-muted-foreground mt-3 line-clamp-3 text-xs whitespace-pre-wrap">
                        {preview(item) || 'Sem prévia'}
                      </span>
                      <span className="text-muted-foreground mt-auto pt-3 text-[11px]">
                        {item.usage_count || 0} uso(s)
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
