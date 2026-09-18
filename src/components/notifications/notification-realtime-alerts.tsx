'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/use-auth';
import {
  ensureNotificationSoundUnlocked,
  playNotificationSound,
  showBrowserNotification,
} from '@/lib/notifications/browser-alerts';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/types';

const INBOX_MESSAGE_TYPE = 'new_message_received';
const REALTIME_DEDUPE_MS = 15_000;

function getNotificationHref(notification: Notification) {
  if (notification.action_url?.startsWith('/')) return notification.action_url;
  if (notification.conversation_id)
    return `/inbox?c=${notification.conversation_id}`;

  switch (notification.category) {
    case 'sales':
      return '/pipelines';
    case 'finance':
      return '/finance?tab=invoices';
    case 'clinic':
      return '/agenda';
    case 'clients':
      return '/contacts';
    case 'automation':
      return '/automations';
    case 'broadcast':
      return '/broadcasts';
    case 'work_time':
      return '/settings?tab=work-time';
    case 'system':
      if (
        notification.type === 'whatsapp_connected' ||
        notification.type === 'whatsapp_disconnected'
      ) {
        return '/settings?tab=whatsapp';
      }
      return '/notifications';
    default:
      return '/notifications';
  }
}

function getRealtimeDedupeKey(notification: Notification) {
  if (
    notification.type === 'conversation_assigned' &&
    notification.conversation_id
  ) {
    return `assignment:${notification.conversation_id}:${notification.user_id}`;
  }
  return notification.id;
}

export function NotificationRealtimeAlerts() {
  const router = useRouter();
  const { accountId, user } = useAuth();
  const userId = user?.id ?? null;
  const seenEventsRef = useRef<Set<string>>(new Set());
  const seenGroupAtRef = useRef<Map<string, number>>(new Map());
  const subscriptionStartedAtRef = useRef(0);

  const openNotification = useCallback(
    (notification: Notification) => {
      const href = getNotificationHref(notification);
      if (userId) {
        const supabase = createClient();
        void supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', notification.id)
          .eq('user_id', userId);
      }
      router.push(href);
    },
    [router, userId]
  );

  useEffect(() => {
    ensureNotificationSoundUnlocked();
  }, []);

  useEffect(() => {
    if (!accountId || !userId) return;

    const supabase = createClient();
    subscriptionStartedAtRef.current = Date.now();
    const channel = supabase
      .channel(`notification-realtime-alerts-${accountId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          if (
            payload.eventType !== 'INSERT' &&
            payload.eventType !== 'UPDATE'
          ) {
            return;
          }

          const notification = payload.new as Notification;
          const eventKey = `${notification.id}:${notification.created_at ?? ''}`;

          if (notification.user_id !== userId) return;
          if (notification.read_at || notification.resolved_at) return;
          // Do not surface stale rows when the realtime channel reconnects.
          // New alerts generated after this subscription are unaffected.
          if (
            notification.created_at &&
            new Date(notification.created_at).getTime() <
              subscriptionStartedAtRef.current - 1000
          )
            return;
          if (seenEventsRef.current.has(eventKey)) return;

          seenEventsRef.current.add(eventKey);
          const groupKey = getRealtimeDedupeKey(notification);
          const now = Date.now();
          const lastSeenAt = seenGroupAtRef.current.get(groupKey);
          if (lastSeenAt && now - lastSeenAt < REALTIME_DEDUPE_MS) return;
          seenGroupAtRef.current.set(groupKey, now);

          // The inbox has its own conversation popup; avoid two visual
          // cards for the same inbound message while keeping all other
          // CRM notifications global.
          if (notification.type === INBOX_MESSAGE_TYPE) return;

          playNotificationSound();
          showBrowserNotification({
            title: notification.title || 'Nova notificacao',
            body: notification.body,
            tag: groupKey,
            onClick: () => openNotification(notification),
          });

          toast(notification.title || 'Nova notificacao', {
            id: `notification-${groupKey}`,
            description: notification.body ?? undefined,
            duration: 12000,
            icon: <BellRing className="text-primary h-4 w-4" />,
            action: {
              label: 'Abrir',
              onClick: () => openNotification(notification),
            },
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, openNotification, userId]);

  return null;
}
