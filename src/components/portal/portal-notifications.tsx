'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CheckCheck,
  FileText,
  LifeBuoy,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
export type PortalNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_tab: string | null;
  read_at: string | null;
  created_at: string;
};
export function PortalNotifications({
  slug,
  onNavigate,
  onUnreadChange,
}: {
  slug: string;
  onNavigate: (tab: string) => void;
  onUnreadChange: (count: number) => void;
}) {
  const [items, setItems] = useState<PortalNotification[]>([]),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const r = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/notifications`
    );
    if (r.ok) {
      const p = await r.json();
      setItems(p.notifications);
      onUnreadChange(
        p.notifications.filter((n: PortalNotification) => !n.read_at).length
      );
    }
    setLoading(false);
  }, [slug, onUnreadChange]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function read(item?: PortalNotification) {
    await fetch(`/api/portal/${encodeURIComponent(slug)}/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item ? { id: item.id } : { all: true }),
    });
    if (item?.action_tab) onNavigate(item.action_tab);
    void load();
  }
  const Icon = ({ type }: { type: string }) =>
    type.startsWith('support') ? (
      <LifeBuoy />
    ) : type.startsWith('appointment') ? (
      <CalendarDays />
    ) : (
      <FileText />
    );
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bell />
            Notificações
          </h1>
          <p className="text-muted-foreground mt-1">
            Atualizações importantes da sua conta.
          </p>
        </div>
        {items.some((i) => !i.read_at) && (
          <Button variant="outline" onClick={() => void read()}>
            <CheckCheck />
            Marcar todas como lidas
          </Button>
        )}
      </div>
      {loading ? (
        <Loader2 className="mx-auto animate-spin" />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => void read(item)}
              className={`bg-background flex w-full gap-4 rounded-xl border p-4 text-left ${!item.read_at ? 'border-primary/40 shadow-sm' : ''}`}
            >
              <span
                className={`${!item.read_at ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} flex size-10 shrink-0 items-center justify-center rounded-full`}
              >
                <Icon type={item.type} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold">
                  {item.title}
                  {!item.read_at && (
                    <i className="bg-primary size-2 rounded-full" />
                  )}
                </span>
                {item.body && (
                  <span className="text-muted-foreground mt-1 block text-sm">
                    {item.body}
                  </span>
                )}
                <span className="text-muted-foreground mt-2 block text-xs">
                  {new Date(item.created_at).toLocaleString('pt-PT')}
                </span>
              </span>
            </button>
          ))}
          {!items.length && (
            <div className="border-border bg-background rounded-xl border border-dashed py-14 text-center">
              <Bell className="text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Nenhuma notificação</p>
              <p className="text-muted-foreground mt-1 text-sm">
                As atualizações aparecerão aqui.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
