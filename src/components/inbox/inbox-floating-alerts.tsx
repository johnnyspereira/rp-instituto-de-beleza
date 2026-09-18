'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';

import {
  CONVERSATION_SELECT,
  normalizeConversation,
} from '@/lib/inbox/conversations';
import {
  playNotificationSound,
  showBrowserNotification,
} from '@/lib/notifications/browser-alerts';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { Conversation, Message } from '@/types';

interface FloatingInboxAlert {
  id: string;
  conversationId: string;
  title: string;
  body: string;
  createdAt: string;
}

const ALERT_TTL_MS = 20000;
const MAX_ALERTS = 4;

function previewForMessage(message: Message): string {
  if (message.content_text?.trim()) return message.content_text.trim();

  switch (message.content_type) {
    case 'image':
      return 'Imagem recebida';
    case 'audio':
      return 'Audio recebido';
    case 'video':
      return 'Video recebido';
    case 'document':
      return 'Documento recebido';
    case 'location':
      return 'Localizacao recebida';
    case 'interactive':
      return 'Resposta interativa recebida';
    default:
      return 'Nova mensagem recebida';
  }
}

function titleForConversation(conversation: Conversation | null): string {
  return (
    conversation?.contact?.name ||
    conversation?.contact?.phone ||
    'Novo contato'
  );
}

export function InboxFloatingAlerts() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [alerts, setAlerts] = useState<FloatingInboxAlert[]>([]);
  const pathnameRef = useRef(pathname);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const subscriptionStartedAtRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  useEffect(() => {
    pathnameRef.current = pathname;
    if (pathname.startsWith('/inbox')) {
      // Route sync: entering the Inbox makes floating alerts redundant.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAlerts([]);
    }
  }, [pathname]);

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: string) => {
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => dismiss(id), ALERT_TTL_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss]
  );

  const pushAlert = useCallback(
    (alert: FloatingInboxAlert) => {
      setAlerts((prev) => {
        const withoutSameConversation = prev.filter(
          (item) => item.conversationId !== alert.conversationId
        );
        return [alert, ...withoutSameConversation].slice(0, MAX_ALERTS);
      });
      scheduleDismiss(alert.id);
    },
    [scheduleDismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const supabase = createClient();
    subscriptionStartedAtRef.current = Date.now();
    const channel = supabase
      .channel('floating-inbox-alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const message = payload.new as Message;

          if (pathnameRef.current.startsWith('/inbox')) return;
          if (message.sender_type !== 'customer') return;
          // A reconnect can replay rows that were already present in the
          // database. They belong in the Inbox, not in a fresh popup.
          if (
            message.created_at &&
            new Date(message.created_at).getTime() <
              subscriptionStartedAtRef.current - 1000
          )
            return;
          if (seenMessageIdsRef.current.has(message.id)) return;
          seenMessageIdsRef.current.add(message.id);

          const { data } = await supabase
            .from('conversations')
            .select(CONVERSATION_SELECT)
            .eq('id', message.conversation_id)
            .maybeSingle();

          const conversation = data ? normalizeConversation(data) : null;
          const alert = {
            id: message.id,
            conversationId: message.conversation_id,
            title: titleForConversation(conversation),
            body: previewForMessage(message),
            createdAt: message.created_at,
          };

          pushAlert(alert);
          playNotificationSound();

          if (document.visibilityState !== 'visible') {
            showBrowserNotification({
              title: alert.title,
              body: alert.body,
              tag: alert.conversationId,
              onClick: () => {
                router.push(`/inbox?c=${alert.conversationId}`);
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pushAlert, router, user?.id]);

  const openConversation = useCallback(
    (alert: FloatingInboxAlert) => {
      dismiss(alert.id);
      router.push(`/inbox?c=${alert.conversationId}`);
    },
    [dismiss, router]
  );

  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 w-[min(calc(100vw-2rem),22rem)] space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="border-border bg-popover text-popover-foreground pointer-events-auto rounded-md border p-3 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <div className="bg-primary/15 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {alert.title}
                  </p>
                  <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                    {alert.body}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(alert.id)}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                  aria-label="Fechar notificacao"
                  title="Fechar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => openConversation(alert)}
                className={cn(
                  'bg-primary text-primary-foreground mt-3 h-8 rounded-md px-3 text-xs font-medium',
                  'hover:bg-primary/90'
                )}
              >
                Abrir conversa
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
