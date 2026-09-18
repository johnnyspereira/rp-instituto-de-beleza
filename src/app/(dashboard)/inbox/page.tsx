'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  CONVERSATION_SELECT,
  isInternalAlertConversation,
  normalizeConversation,
} from '@/lib/inbox/conversations';
import type {
  Conversation,
  Message,
  Contact,
  ConversationStatus,
} from '@/types';
import { useRealtime } from '@/hooks/use-realtime';
import { useAuth } from '@/hooks/use-auth';
import { ConversationList } from '@/components/inbox/conversation-list';
import { MessageThread } from '@/components/inbox/message-thread';
import { ContactSidebar } from '@/components/inbox/contact-sidebar';
import {
  AlertTriangle,
  Loader2,
  LayoutGrid,
  MessageCircleMore,
  Radio,
  Trash2,
  UsersRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Remembers the agent's show/hide choice for the desktop contact panel
// across reloads and sessions (device-scoped, like the theme prefs).
const CONTACT_PANEL_STORAGE_KEY = 'wacrm:inbox:contact-panel-open';

type WhatsAppConnectionState = {
  connected: boolean;
  source: 'qr' | 'meta' | null;
  state: 'idle' | 'starting' | 'qr' | 'connected' | 'disconnected' | 'error';
  connectedAt: string | null;
  connectedForSeconds: number | null;
  userJid: string | null;
  lastError: string | null;
};

function formatConnectionDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${secs}s`;
  return `${secs}s`;
}

export default function InboxPage() {
  const t = useTranslations('Inbox.page');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isOwner } = useAuth();
  /**
   * `?c=<id>` deep-link support. Used when landing here from the
   * dashboard's recent-conversations list so the right thread opens
   * automatically instead of showing the empty center panel.
   */
  const deepLinkConvId = searchParams.get('c');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [whatsappConnection, setWhatsappConnection] =
    useState<WhatsAppConnectionState | null>(null);
  const [connectionNow, setConnectionNow] = useState(() => Date.now());
  /**
   * Bumped whenever we want children (ConversationList, MessageThread)
   * to refetch from the DB — used as a safety net against missed
   * realtime events. Bumped on WS reconnect and on tab visibility →
   * visible. The initial mount fetches don't depend on this; they fire
   * once on conversationId-change as usual.
   */
  const [resyncToken, setResyncToken] = useState(0);

  /**
   * Whether the desktop contact sidebar (tags / deals / notes) is shown.
   * Defaults to `true` (the historical behaviour) and is restored from
   * localStorage after mount. We deliberately do NOT read localStorage in
   * the initializer: the server renders with `true`, so reading a stored
   * `false` synchronously would produce a hydration mismatch. The effect
   * below reconciles to the stored value right after mount instead.
   */
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
  const [clearInboxOpen, setClearInboxOpen] = useState(false);
  const [clearingInbox, setClearingInbox] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONTACT_PANEL_STORAGE_KEY);
      if (stored !== null) setContactPanelOpen(stored === 'true');
    } catch {
      // localStorage can throw in private-browsing / sandboxed contexts.
    }
  }, []);

  const handleToggleContactPanel = useCallback(() => {
    setContactPanelOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CONTACT_PANEL_STORAGE_KEY, String(next));
      } catch {
        // Persistence is best-effort; ignore storage failures.
      }
      return next;
    });
  }, []);

  // Fire the deep-link auto-select exactly once per URL — subsequent
  // list refreshes (realtime, manual refetch) must not snap the user
  // back to the deep-linked conversation if they've already clicked
  // elsewhere.
  const autoSelectedForDeepLinkRef = useRef<string | null>(null);

  // Tracks conversations whose hydrate fetch is currently in flight. The
  // conv-INSERT and the first-message-INSERT events both call into
  // hydrateConversation; the dedupe here keeps it at one refetch per
  // new conversation even when both events arrive within milliseconds.
  const hydratingConvIdsRef = useRef<Set<string>>(new Set());

  /**
   * Synchronous mirror of the conversation ids currently in `conversations`
   * state. Event handlers need to know "do we already have this conv?"
   * without waiting for a setState updater to run — updaters fire during
   * reconciliation, *after* the synchronous handler code returns, so a
   * `let foundInList = false; setState(p => { foundInList = ...; return ... })`
   * flag reads as `false` in the same tick (this exact bug shipped in #105
   * and caused #106: every incoming message and every status flip fired a
   * redundant DB hydrate, swamping the supabase client and starving the
   * realtime channel). The ref is kept in sync via the effect below.
   */
  const knownConvIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set<string>();
    for (const c of conversations) next.add(c.id);
    knownConvIdsRef.current = next;
  }, [conversations]);

  useEffect(() => {
    if (!deepLinkConvId || activeConversation?.id === deepLinkConvId) return;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .eq('id', deepLinkConvId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Failed to open deep-linked conversation:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return;
      }
      if (!data) return;

      const fetched = normalizeConversation(data);
      if (isInternalAlertConversation(fetched)) return;
      setActiveConversation(fetched);
      setActiveContact(fetched.contact ?? null);
      setMessages([]);
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === fetched.id);
        const next = exists
          ? prev.map((c) =>
              c.id === fetched.id ? { ...c, ...fetched, unread_count: 0 } : c
            )
          : [{ ...fetched, unread_count: 0 }, ...prev];
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [activeConversation?.id, deepLinkConvId]);

  // Pull the conversation row with its `contact` joined and merge it
  // into state. Needed because Supabase Realtime payloads only carry the
  // row's own columns — a brand-new conversation arrives without a
  // contact, which surfaced as "Unknown" names, empty avatars, and
  // (when the conv-INSERT event was delayed past the message-INSERT)
  // conversations stuck on "No messages yet" until the user reloaded.
  // Also self-heals if a realtime event was missed: callers can invoke
  // this whenever they reference a conversation id they don't recognise.
  const hydrateConversation = useCallback(async (convId: string) => {
    if (hydratingConvIdsRef.current.has(convId)) return;
    hydratingConvIdsRef.current.add(convId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .eq('id', convId)
        .maybeSingle();
      if (error) {
        // Supabase errors have non-enumerable properties — log fields
        // explicitly so the console message isn't just `{}`.
        console.error('Failed to hydrate conversation:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return;
      }
      if (!data) return;
      const fetched = normalizeConversation(data);
      if (isInternalAlertConversation(fetched)) {
        setConversations((prev) =>
          prev.filter((conversation) => conversation.id !== fetched.id)
        );
        return;
      }
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === fetched.id);
        if (existing) {
          // Already in state — keep its fields (a realtime UPDATE may
          // have landed while the fetch was in flight and patched
          // last_message_text / unread_count to fresher values than
          // the row we just read). Only backfill `contact`, which the
          // realtime payloads never carry.
          return prev.map((c) =>
            c.id === fetched.id
              ? { ...c, contact: c.contact ?? fetched.contact }
              : c
          );
        }
        return [fetched, ...prev];
      });
    } finally {
      hydratingConvIdsRef.current.delete(convId);
    }
  }, []);

  // Check WhatsApp connection status on mount
  useEffect(() => {
    let cancelled = false;

    const checkConnection = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) return;

      let qrConnection: WhatsAppConnectionState | null = null;
      try {
        const qrRes = await fetch('/api/whatsapp/baileys/status', {
          credentials: 'include',
          cache: 'no-store',
        });
        const qrStatus = await qrRes.json();
        if (qrRes.ok) {
          qrConnection = {
            connected: qrStatus?.connected === true,
            source: 'qr',
            state: [
              'idle',
              'starting',
              'qr',
              'connected',
              'disconnected',
              'error',
            ].includes(qrStatus?.state)
              ? qrStatus.state
              : 'idle',
            connectedAt:
              typeof qrStatus.connectedAt === 'string'
                ? qrStatus.connectedAt
                : null,
            connectedForSeconds:
              typeof qrStatus.connectedForSeconds === 'number'
                ? qrStatus.connectedForSeconds
                : null,
            userJid:
              typeof qrStatus.userJid === 'string' ? qrStatus.userJid : null,
            lastError:
              typeof qrStatus.lastError === 'string'
                ? qrStatus.lastError
                : null,
          };
        }
        if (qrConnection?.connected) {
          if (!cancelled) {
            setWhatsappConnection(qrConnection);
          }
          return;
        }
      } catch {
        // Fall through to the Meta config check below.
      }

      // whatsapp_config is one-row-per-account post-multi-user, so
      // the previous `.eq('user_id', user.id)` would miss the row
      // for any teammate who didn't personally save the config —
      // the "WhatsApp not connected" banner would show in the
      // shared inbox even though the admin had it configured.
      // Resolve account_id via the profile and query by that.
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();
      const accountId = profile?.account_id as string | undefined;
      if (!accountId) {
        if (!cancelled) {
          setWhatsappConnection({
            connected: false,
            source: null,
            state: 'idle',
            connectedAt: null,
            connectedForSeconds: null,
            userJid: null,
            lastError: null,
          });
        }
        return;
      }

      const { data } = await supabase
        .from('whatsapp_config')
        .select('status, connected_at')
        .eq('account_id', accountId)
        .maybeSingle();

      if (data?.status === 'connected') {
        if (!cancelled) {
          setWhatsappConnection({
            connected: true,
            source: 'meta',
            state: 'connected',
            connectedAt:
              typeof data.connected_at === 'string' ? data.connected_at : null,
            connectedForSeconds: null,
            userJid: null,
            lastError: null,
          });
        }
        return;
      }

      if (!cancelled) {
        setWhatsappConnection(
          qrConnection ?? {
            connected: false,
            source: null,
            state: 'idle',
            connectedAt: null,
            connectedForSeconds: null,
            userJid: null,
            lastError: null,
          }
        );
      }
    };

    checkConnection();
    const interval = window.setInterval(checkConnection, 15000);
    window.addEventListener('focus', checkConnection);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', checkConnection);
    };
  }, []);

  useEffect(() => {
    if (!whatsappConnection?.connected || whatsappConnection.source !== 'qr') {
      return;
    }

    setConnectionNow(Date.now());
    const interval = window.setInterval(
      () => setConnectionNow(Date.now()),
      1000
    );
    return () => window.clearInterval(interval);
  }, [whatsappConnection?.connected, whatsappConnection?.source]);

  // Handle realtime message events
  const handleMessageEvent = useCallback(
    (event: { eventType: string; new: Message; old: Partial<Message> }) => {
      const newMsg = event.new;

      if (event.eventType === 'INSERT') {
        // Add to messages if it belongs to active conversation
        if (
          activeConversation &&
          newMsg.conversation_id === activeConversation.id
        ) {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Replace optimistic message if it exists
            const withoutOptimistic = prev.filter(
              (m) => !m.id.startsWith('temp-')
            );
            return [...withoutOptimistic, newMsg];
          });
        }

        // Update conversation list preview. We need to know *synchronously*
        // whether the conv is already in state to decide between patching
        // the preview and triggering a hydrate — see the comment on
        // knownConvIdsRef for why a closure flag inside the updater would
        // always read false here.
        if (knownConvIdsRef.current.has(newMsg.conversation_id)) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === newMsg.conversation_id
                ? {
                    ...c,
                    last_message_text: newMsg.content_text ?? '',
                    last_message_at: newMsg.created_at,
                    unread_count:
                      activeConversation?.id === newMsg.conversation_id
                        ? 0
                        : c.unread_count + 1,
                  }
                : c
            )
          );
        } else {
          // First time we're seeing this conv: the conv-INSERT event
          // hasn't landed yet, or was missed. Hydrate from the DB so
          // the row surfaces with its `contact` joined; the conv-UPDATE
          // event the webhook emits right after the message INSERT will
          // converge state when it arrives.
          hydrateConversation(newMsg.conversation_id);
        }
      }

      if (event.eventType === 'UPDATE') {
        // Update message status
        setMessages((prev) =>
          prev.map((m) => (m.id === newMsg.id ? { ...m, ...newMsg } : m))
        );
      }
    },
    [activeConversation, hydrateConversation]
  );

  // Handle realtime conversation events
  const handleConversationEvent = useCallback(
    (event: {
      eventType: string;
      new: Conversation;
      old: Partial<Conversation>;
    }) => {
      const conv = event.new;

      if (event.eventType === 'INSERT') {
        if (isInternalAlertConversation(conv)) return;
        // Prepend immediately for snappy UX so the new conv shows in the
        // list right away, then hydrate to fill in the `contact` join
        // (realtime payloads never include joins). Skip both if we
        // already have the row — that shouldn't happen normally, but
        // out-of-order delivery would have us prepending a duplicate.
        if (!knownConvIdsRef.current.has(conv.id)) {
          setConversations((prev) => {
            if (prev.some((c) => c.id === conv.id)) return prev;
            return [conv, ...prev];
          });
          hydrateConversation(conv.id);
        }
      }

      if (event.eventType === 'UPDATE') {
        if (isInternalAlertConversation(conv)) {
          setConversations((prev) => prev.filter((item) => item.id !== conv.id));
          return;
        }
        if (knownConvIdsRef.current.has(conv.id)) {
          // If this UPDATE is for the conv the user is currently viewing,
          // suppress the incoming unread_count — the user is reading it
          // RIGHT NOW, so any positive value would just flicker the badge
          // back on for the ~100ms it takes for the reset effect's server
          // UPDATE to round-trip. Non-active convs take the value as-is.
          const isActive = activeConversation?.id === conv.id;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conv.id
                ? {
                    ...c,
                    ...conv,
                    unread_count: isActive ? 0 : conv.unread_count,
                  }
                : c
            )
          );
        } else {
          // UPDATE arrived before the INSERT (or after a missed INSERT)
          // — fetch the row so it surfaces with its contact joined. The
          // patch contained in `conv` will already be reflected in what
          // the hydrate fetch returns.
          hydrateConversation(conv.id);
        }

        // Update active conversation if it changed
        if (activeConversation && conv.id === activeConversation.id) {
          setActiveConversation((prev) => (prev ? { ...prev, ...conv } : prev));
        }
      }
    },
    [activeConversation, hydrateConversation]
  );

  // Subscribe to realtime. The `isConnected` flag below feeds the
  // reconnect resync: realtime is best-effort and events sent while the
  // WS was disconnected (laptop sleep, network blip, background-tab
  // throttle) are simply lost. We need a way to catch up.
  const { isConnected } = useRealtime({
    channelName: 'inbox-realtime',
    onMessageEvent: handleMessageEvent,
    onConversationEvent: handleConversationEvent,
    enabled: true,
  });

  /**
   * Bump `resyncToken` whenever the realtime channel transitions from
   * disconnected → connected *after* the initial connect. The initial
   * connect is covered by the children's on-mount fetches; only later
   * reconnects need a manual refetch to fill the gap.
   *
   * Tracked via a `was-connected` ref rather than a count so that React
   * strict-mode's dev-only effect double-fire doesn't read as a
   * reconnect.
   */
  const wasConnectedRef = useRef(false);
  const initialConnectDoneRef = useRef(false);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      // false → true transition
      if (initialConnectDoneRef.current) {
        setResyncToken((n) => n + 1);
      } else {
        initialConnectDoneRef.current = true;
      }
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  /**
   * Refetch when the tab regains focus. Background tabs may have their
   * WS throttled by the browser even without a full disconnect, so a
   * visibilitychange → visible is a reliable signal that we may have
   * missed events. Cheap to fire; the children dedupe on their own.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setResyncToken((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /**
   * Manual refresh trigger for the thread-header refresh button.
   * Bumps the same resyncToken the reconnect / visibility paths use,
   * so it goes through the existing dedupe & refetch plumbing — no
   * separate code path to keep in sync.
   */
  const handleManualRefresh = useCallback(() => {
    setResyncToken((n) => n + 1);
  }, []);

  const handleClearInbox = useCallback(async () => {
    setClearingInbox(true);
    try {
      const response = await fetch('/api/inbox/conversations/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'CLEAR_INBOX' }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        conversationsDeleted?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Falha ao limpar conversas.');
      }

      setConversations([]);
      setActiveConversation(null);
      setActiveContact(null);
      setMessages([]);
      setContactDrawerOpen(false);
      setClearInboxOpen(false);
      autoSelectedForDeepLinkRef.current = null;
      knownConvIdsRef.current = new Set();
      router.replace('/inbox', { scroll: false });
      setResyncToken((n) => n + 1);
      toast.success(
        `${payload.conversationsDeleted ?? 0} conversa(s) removida(s) do Inbox.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao limpar conversas.'
      );
    } finally {
      setClearingInbox(false);
    }
  }, [router]);

  const handleConversationsLoaded = useCallback(
    (loaded: Conversation[]) => {
      setConversations(loaded);
      // Resolve a pending deep-link here rather than in an effect — this
      // is an event handler, so the setState calls below are allowed by
      // react-hooks/set-state-in-effect. Runs once per ?c=<id> URL value
      // via the ref, so realtime refreshes of the list can't snap the
      // user back to the deep-linked thread after they've navigated.
      if (
        deepLinkConvId &&
        autoSelectedForDeepLinkRef.current !== deepLinkConvId &&
        loaded.length > 0
      ) {
        autoSelectedForDeepLinkRef.current = deepLinkConvId;
        // If the deep-linked conversation is already the active one
        // (e.g. because the user clicked it in the list and we
        // router.replace()'d the URL, which made the ConversationList
        // refetch and land us back here), do NOT re-apply it. Doing so
        // would setMessages([]) on a thread whose messages have
        // already been loaded by MessageThread — and because
        // conversationId didn't change, MessageThread wouldn't
        // refetch. The thread would read "No messages yet" until a
        // full page reload rehydrated state from scratch.
        if (activeConversation?.id === deepLinkConvId) return;
        const match = loaded.find((c) => c.id === deepLinkConvId);
        if (match) {
          setActiveConversation(match);
          setActiveContact(match.contact ?? null);
          setMessages([]);
          // Mirror the optimistic unread reset that handleSelectConversation
          // does — the user just deep-linked into this conv, treat that the
          // same as a click. Leaves activeConversation.unread_count alone so
          // the MessageThread reset effect still fires the server UPDATE.
          if (match.unread_count > 0) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === match.id ? { ...c, unread_count: 0 } : c
              )
            );
          }
        }
      }
    },
    [deepLinkConvId, activeConversation?.id]
  );

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      // Re-clicking the already-active conversation would clear the
      // messages array, but the fetch effect in MessageThread only re-runs
      // when conversationId changes — so messages would stay empty until
      // the user navigated away and back. Bail out early instead.
      if (activeConversation?.id === conv.id) return;
      setActiveConversation(conv);
      setActiveContact(conv.contact ?? null);
      setContactDrawerOpen(false);
      setMessages([]);
      // Optimistically clear the unread badge for this conv. The
      // server-side reset is fired by the unread-reset effect inside
      // MessageThread (which reads activeConversation.unread_count, not
      // the list copy — so we deliberately leave that intact below to
      // keep the effect firing), and the realtime UPDATE that comes
      // back will sync to 0 again as a no-op. Zeroing the list copy
      // here means the user sees the badge disappear the instant they
      // click instead of waiting for the round-trip — and it persists
      // even if the realtime UPDATE is dropped.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conv.id && c.unread_count > 0 ? { ...c, unread_count: 0 } : c
        )
      );
      // Record the selection on the deep-link ref BEFORE we change the
      // URL. The router.replace below flips `deepLinkConvId`, which can
      // in turn cause ConversationList to refetch and eventually call
      // handleConversationsLoaded again. Without this line, the ref
      // still points at the previous value, the auto-select block
      // sees `ref !== deepLinkConvId`, fires a second time, and
      // clobbers the messages MessageThread just fetched.
      autoSelectedForDeepLinkRef.current = conv.id;
      // Reflect the selection in the URL so a refresh lands the user
      // back in the same thread, and so copy-paste links work. Use
      // replace() to avoid polluting browser history with every click.
      router.replace(`/inbox?c=${conv.id}`, { scroll: false });
    },
    [activeConversation?.id, router]
  );

  // Mobile "back" — deselect the conversation so the list pane comes
  // back. Also clears the ?c= param so a refresh lands on the list
  // instead of re-opening the thread the user just backed out of.
  const handleCloseConversation = useCallback(() => {
    setActiveConversation(null);
    setActiveContact(null);
    setContactDrawerOpen(false);
    setMessages([]);
    // Clearing the ref lets the deep-link auto-selector fire again if
    // the user later visits /inbox?c=<same-id> — desirable UX.
    autoSelectedForDeepLinkRef.current = null;
    router.replace('/inbox', { scroll: false });
  }, [router]);

  const handleMessagesLoaded = useCallback((loaded: Message[]) => {
    setMessages(loaded);
  }, []);

  const handleNewMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleUpdateMessage = useCallback(
    (id: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    },
    []
  );

  const handleStatusChange = useCallback(
    (conversationId: string, status: ConversationStatus) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status } : c))
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [activeConversation]
  );

  const handleAssignChange = useCallback(
    (conversationId: string, assignedAgentId: string | null) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, assigned_agent_id: assignedAgentId ?? undefined }
            : c
        )
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) =>
          prev
            ? { ...prev, assigned_agent_id: assignedAgentId ?? undefined }
            : prev
        );
      }
    },
    [activeConversation]
  );

  const handleContactUpdated = useCallback((updated: Contact) => {
    setActiveContact((prev) =>
      prev?.id === updated.id ? { ...prev, ...updated } : prev
    );
    setActiveConversation((prev) =>
      prev?.contact?.id === updated.id
        ? { ...prev, contact: { ...prev.contact, ...updated } }
        : prev
    );
    setConversations((prev) =>
      prev.map((c) =>
        c.contact?.id === updated.id
          ? { ...c, contact: { ...c.contact, ...updated } }
          : c
      )
    );
  }, []);

  // On mobile (<lg) we show a SINGLE pane — either the list or the
  // thread — rather than cramming both side-by-side. Selecting a
  // conversation slides the thread in; the thread's back button pops
  // it back to the list. On lg+ both panes render side-by-side as
  // before, unchanged.
  const hasActiveConv = !!activeConversation;
  const qrConnectedForSeconds =
    whatsappConnection?.connected && whatsappConnection.source === 'qr'
      ? whatsappConnection.connectedAt
        ? Math.max(
            0,
            Math.floor(
              (connectionNow - Date.parse(whatsappConnection.connectedAt)) /
                1000
            )
          )
        : (whatsappConnection.connectedForSeconds ?? 0)
      : null;
  const conversationsNeedingReply = conversations.filter(
    (conversation) => conversation.unread_count > 0
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/35">
      <header className="flex shrink-0 flex-col gap-3 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard')}
            className="text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Voltar ao CRM"
            title="Voltar ao CRM"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <MessageCircleMore className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight">Inbox de atendimento</h1>
              {whatsappConnection?.connected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> WhatsApp ligado
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">Uma vista de trabalho para cada conversa e cliente.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 shadow-sm">
            <Radio className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">A responder</span>
            <strong className="text-foreground">{conversationsNeedingReply}</strong>
          </div>
          <div className="hidden items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 shadow-sm sm:flex">
            <UsersRound className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-muted-foreground">Conversas</span>
            <strong className="text-foreground">{conversations.length}</strong>
          </div>
          {isOwner ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setClearInboxOpen(true)} disabled={clearingInbox || conversations.length === 0} className="border-red-500/25 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400">
              {clearingInbox ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="hidden sm:inline">Limpar conversas</span>
            </Button>
          ) : null}
        </div>
      </header>
      {/* WhatsApp connection banner — in the flex column, not absolute,
          so it pushes the panels down instead of overlapping them. */}
      {qrConnectedForSeconds !== null && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2">
          <Wifi className="h-4 w-4 text-emerald-500" />
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {t('whatsappQrConnected', {
              duration: formatConnectionDuration(qrConnectedForSeconds),
            })}
          </p>
        </div>
      )}

      {whatsappConnection?.connected === false && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
          <WifiOff className="h-4 w-4 text-amber-400" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {whatsappConnection.state === 'qr'
              ? t('whatsappQrWaiting')
              : whatsappConnection.state === 'starting'
                ? t('whatsappQrStarting')
                : whatsappConnection.lastError
                  ? t('whatsappQrError', {
                      error: whatsappConnection.lastError,
                    })
                  : t('whatsappNotConnected')}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
            onClick={() => router.push('/settings?tab=whatsapp')}
          >
            {t('openWhatsappSettings')}
          </Button>
        </div>
      )}

      <div className="flex flex-1 gap-0 overflow-hidden p-2 sm:p-3">
        {/* Left panel: Conversation list.
            Hidden on mobile when a conversation is selected so the
            thread can occupy the full width. Always visible on lg+. */}
        <div
          className={cn(
            'flex h-full flex-1 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm lg:flex-none',
            hasActiveConv ? 'hidden lg:flex' : 'flex'
          )}
        >
          <ConversationList
            activeConversationId={activeConversation?.id ?? null}
            onSelect={handleSelectConversation}
            conversations={conversations}
            onConversationsLoaded={handleConversationsLoaded}
            resyncToken={resyncToken}
          />
        </div>

        {/* Center panel: Message thread.
            Hidden on mobile when no conversation is selected so the
            list can occupy the full width. Always visible on lg+
            (shows its own empty-state if no thread is picked yet).

            `min-w-0` is load-bearing: without it, a single wide piece
            of content inside the thread (long quote preview, very
            long URL in a message body) forces the flex child past
            its share and pushes the contact-sidebar panel off-screen
            on the right. Issue #165. */}
        <div
          className={cn(
            'flex h-full min-w-0 flex-1 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm lg:flex',
            hasActiveConv ? 'flex' : 'hidden lg:flex'
          )}
        >
          <MessageThread
            conversation={activeConversation}
            contact={activeContact}
            messages={messages}
            onMessagesLoaded={handleMessagesLoaded}
            onNewMessage={handleNewMessage}
            onUpdateMessage={handleUpdateMessage}
            onStatusChange={handleStatusChange}
            onAssignChange={handleAssignChange}
            onBack={handleCloseConversation}
            resyncToken={resyncToken}
            onRefresh={handleManualRefresh}
            contactPanelOpen={contactPanelOpen}
            onToggleContactPanel={handleToggleContactPanel}
            onOpenContactProfile={() => setContactDrawerOpen(true)}
          />
        </div>

        {/* Right panel: Contact sidebar — desktop only, and only when the
            agent hasn't collapsed it via the thread-header toggle (#258).
            On mobile it's always hidden (the `lg:block` below), so the
            toggle — which is itself desktop-only — never affects it. */}
        {contactPanelOpen && (
          <div className="ml-3 hidden overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm xl:block">
            <ContactSidebar
              contact={activeContact}
              conversationId={activeConversation?.id ?? null}
              onContactUpdated={handleContactUpdated}
            />
          </div>
        )}

        {hasActiveConv && contactDrawerOpen && (
          <div
            className="bg-background/70 fixed inset-0 z-50 flex justify-end backdrop-blur-sm xl:hidden"
            onClick={() => setContactDrawerOpen(false)}
          >
            <div
              className="relative h-full w-full max-w-sm shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setContactDrawerOpen(false)}
                className="bg-card text-muted-foreground hover:bg-muted hover:text-foreground absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-md shadow-sm"
                aria-label="Close contact profile"
                title="Close contact profile"
              >
                <X className="h-4 w-4" />
              </button>
              <ContactSidebar
                contact={activeContact}
                conversationId={activeConversation?.id ?? null}
                onContactUpdated={handleContactUpdated}
              />
            </div>
          </div>
        )}
      </div>

      <Dialog open={clearInboxOpen} onOpenChange={setClearInboxOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Limpar todas as conversas?
            </DialogTitle>
            <DialogDescription>
              Esta ação remove as conversas e mensagens do Inbox para este CRM.
              Os clientes, negócios, etiquetas, notas e agendamentos continuam
              salvos e vinculados aos clientes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearInboxOpen(false)}
              disabled={clearingInbox}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleClearInbox}
              disabled={clearingInbox}
            >
              {clearingInbox ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Limpar Inbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
