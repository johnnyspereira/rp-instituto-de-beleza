'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';

let channelCounter = 0;

function nextChannelName() {
  channelCounter += 1;
  return `notifications-unread-count-${channelCounter}`;
}

interface NotificationCountRow {
  id: string;
  type: string;
  conversation_id?: string | null;
  user_id: string;
}

function groupedUnreadCount(rows: NotificationCountRow[]) {
  const keys = new Set<string>();

  for (const row of rows) {
    if (row.type === 'conversation_assigned' && row.conversation_id) {
      keys.add(`assignment:${row.conversation_id}:${row.user_id}`);
    } else {
      keys.add(`single:${row.id}`);
    }
  }

  return keys.size;
}

/**
 * Count of active unread notifications for the current user. The count
 * is always reconciled from Supabase, because assignment updates can
 * resolve one row and create/update another in quick succession.
 */
export function useUnreadNotifications(): number {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [count, setCount] = useState(0);
  const [channelName] = useState(nextChannelName);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const supabase = createClient();
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchUnreadCount() {
      const primary = await supabase
        .from('notifications')
        .select('id,type,conversation_id,user_id')
        .eq('user_id', userId)
        .is('read_at', null)
        .is('resolved_at', null);

      if (cancelled) return;

      if (!primary.error) {
        setCount(
          groupedUnreadCount((primary.data ?? []) as NotificationCountRow[])
        );
        return;
      }

      // Keep older local schemas usable before migration 040 is applied.
      const fallback = await supabase
        .from('notifications')
        .select('id,type,conversation_id,user_id')
        .eq('user_id', userId)
        .is('read_at', null);

      if (!cancelled && !fallback.error) {
        setCount(
          groupedUnreadCount((fallback.data ?? []) as NotificationCountRow[])
        );
      }
    }

    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void fetchUnreadCount();
      }, 120);
    }

    void fetchUnreadCount();

    const channel = supabase
      .channel(`${channelName}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        scheduleRefresh
      )
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchUnreadCount();
      }
    };
    const refreshOnFocus = () => void fetchUnreadCount();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshOnFocus);

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshOnFocus);
      supabase.removeChannel(channel);
    };
  }, [channelName, userId]);

  return userId ? count : 0;
}
