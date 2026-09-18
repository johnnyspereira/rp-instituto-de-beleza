'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  AlertTriangle,
  RotateCcw,
  Download,
  Trash2,
  RefreshCw,
  Smartphone,
  Cloud,
  Radio,
  Clock3,
  MessageCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;
type BaileysSessionStatus = {
  connected: boolean;
  state: 'idle' | 'starting' | 'qr' | 'connected' | 'disconnected' | 'error';
  qr: string | null;
  lastError: string | null;
  userJid: string | null;
  connectedAt?: string | null;
  connectedForSeconds?: number | null;
  hasSavedAuth?: boolean;
  isStarting?: boolean;
  lastActivityAt?: string | null;
  lastIncomingAt?: string | null;
  lastOutgoingAt?: string | null;
  receivedCount?: number;
  sentCount?: number;
  lastRestartAt?: string | null;
  restartCount?: number;
};

const QR_STATUS_ACTIVE_POLL_MS = 5000;
const QR_STATUS_CONNECTED_POLL_MS = 15000;

function formatWorkerDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function StatusTile({
  icon,
  label,
  value,
  detail,
  className = '',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  className?: string;
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg border p-2 ${className}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-medium uppercase">
            {label}
          </p>
          <p className="text-foreground mt-1 truncate text-sm font-semibold">
            {value}
          </p>
          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}

export function WhatsAppConfig() {
  const t = useTranslations('Settings.whatsapp');
  const supabase = createClient();
  // After multi-user, whatsapp_config is one-row-per-account, not
  // one-row-per-user. We pull `accountId` straight off the auth
  // context and key every read off it — so a teammate who just
  // joined an account sees the inviter's saved config without
  // having to re-enter anything.
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  // Guards against re-hydrating the form when the load effect below
  // re-runs for reasons unrelated to actually switching accounts —
  // e.g. Supabase's onAuthStateChange fires a token refresh (new
  // `user` object, profileLoading flips true/false) when the browser
  // tab regains focus. Without this, that churn calls fetchConfig()
  // again and overwrites whatever the user typed but hadn't saved yet.
  const loadedAccountIdRef = useRef<string | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);
  const [baileysStatus, setBaileysStatus] =
    useState<BaileysSessionStatus | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [baileysLoading, setBaileysLoading] = useState(false);
  const [baileysError, setBaileysError] = useState<string | null>(null);
  const [baileysSyncing, setBaileysSyncing] = useState(false);
  const [baileysSyncStartedAt, setBaileysSyncStartedAt] = useState<
    number | null
  >(null);
  const [baileysSyncElapsed, setBaileysSyncElapsed] = useState(0);
  const [baileysLastSync, setBaileysLastSync] = useState<{
    chats: number;
    scanned: number;
    imported: number;
  } | null>(null);
  const [baileysClearingAuth, setBaileysClearingAuth] = useState(false);
  const [baileysRestarting, setBaileysRestarting] = useState(false);
  const [baileysLastCheckedAt, setBaileysLastCheckedAt] = useState<
    string | null
  >(null);
  const baileysStatusInFlightRef = useRef(false);
  const [workerLogs, setWorkerLogs] = useState<
    Array<{
      at: string;
      type: string;
      message: string;
      details?: {
        recipient?: string | null;
        sender?: string | null;
        contentType?: string | null;
        whatsappMessageId?: string | null;
        status?: string | null;
      };
    }>
  >([]);
  const [workerLogsLoading, setWorkerLogsLoading] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    const load = async () => {
      setWorkerLogsLoading(true);
      try {
        const response = await fetch('/api/whatsapp/baileys/logs', {
          credentials: 'include',
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (alive && response.ok) setWorkerLogs(payload.events ?? []);
      } finally {
        if (alive) setWorkerLogsLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [accountId]);

  useEffect(() => {
    if (!baileysSyncing || !baileysSyncStartedAt) return;

    const updateElapsed = () => {
      setBaileysSyncElapsed(
        Math.max(0, Math.floor((Date.now() - baileysSyncStartedAt) / 1000))
      );
    };
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 350);
    return () => window.clearInterval(interval);
  }, [baileysSyncing, baileysSyncStartedAt]);

  // True once /register has succeeded on Meta's side (timestamp set
  // in the row). When false, the saved config is metadata-only and
  // Meta will silently drop every inbound event — that's the
  // multi-number bug that prompted this work.
  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;

  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  type RegistrationProbe = {
    live: boolean;
    checks: Record<string, boolean | null>;
    errors?: string[];
    last_registration_error?: string | null;
    registered_at?: string | null;
    subscribed_apps_at?: string | null;
  };
  const [registrationProbe, setRegistrationProbe] =
    useState<RegistrationProbe | null>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfig = useCallback(
    async (acctId: string) => {
      setLoading(true);
      try {
        // Load form values from Supabase (shows what's in DB).
        // Switched from `user_id` (which would only match the row's
        // original author) to `account_id` so every member of the
        // account sees the same saved configuration. UNIQUE(account_id)
        // on the table guarantees the .maybeSingle() return type
        // remains accurate.
        const { data, error } = await supabase
          .from('whatsapp_config')
          .select('*')
          .eq('account_id', acctId)
          .maybeSingle();

        if (error) {
          console.error('Failed to load config row:', error);
        }

        if (data) {
          setConfig(data);
          setPhoneNumberId(data.phone_number_id || '');
          setWabaId(data.waba_id || '');
          setAccessToken(MASKED_TOKEN);
          setVerifyToken('');
          setPin('');
          setTokenEdited(false);
        } else {
          setConfig(null);
          setPhoneNumberId('');
          setWabaId('');
          setAccessToken('');
          setVerifyToken('');
          setPin('');
          setTokenEdited(false);
        }
        // Clear any stale probe result when reloading the row.
        setRegistrationProbe(null);

        // Then verify health via the API (decrypts token + pings Meta)
        if (data) {
          try {
            const res = await fetch('/api/whatsapp/config', { method: 'GET' });
            const payload = await res.json();

            if (payload.connected) {
              setConnectionStatus('connected');
              setResetReason(null);
              setStatusMessage('');
            } else {
              setConnectionStatus('disconnected');
              setResetReason(
                payload.needs_reset
                  ? 'token_corrupted'
                  : payload.reason === 'meta_api_error'
                    ? 'meta_api_error'
                    : null
              );
              setStatusMessage(payload.message || '');
            }
          } catch (err) {
            console.error('Health check failed:', err);
            setConnectionStatus('disconnected');
          }
        } else {
          setConnectionStatus('disconnected');
          setResetReason(null);
          setStatusMessage('');
        }
      } catch (err) {
        console.error('fetchConfig error:', err);
        toast.error('Failed to load WhatsApp configuration');
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    // Need both the auth session (`!authLoading`) AND the profile
    // (`!profileLoading`, which carries `accountId`). Without the
    // second guard, the effect would fire with `accountId === null`
    // for the first render window and bail without ever retrying
    // once the profile arrives.
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user?.id, accountId, fetchConfig]);

  useEffect(() => {
    if (!authLoading && !profileLoading && accountId) {
      fetchBaileysStatus();
    }
  }, [authLoading, profileLoading, accountId]);

  useEffect(() => {
    if (authLoading || profileLoading || !accountId || baileysClearingAuth) {
      return;
    }

    const pollMs = baileysStatus?.connected
      ? QR_STATUS_CONNECTED_POLL_MS
      : QR_STATUS_ACTIVE_POLL_MS;

    const pollStatus = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchBaileysStatus({ silent: true });
    };

    const interval = window.setInterval(pollStatus, pollMs);
    window.addEventListener('focus', pollStatus);
    document.addEventListener('visibilitychange', pollStatus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', pollStatus);
      document.removeEventListener('visibilitychange', pollStatus);
    };
  }, [
    authLoading,
    profileLoading,
    accountId,
    baileysStatus?.connected,
    baileysStatus?.state,
    baileysClearingAuth,
  ]);

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('Phone Number ID is required');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('Access Token is required for initial setup');
      return;
    }

    try {
      setSaving(true);

      // Always POST through the API — it verifies with Meta and encrypts
      // the access_token server-side with ENCRYPTION_KEY. Skipping this
      // and writing direct to Supabase stores the token in plaintext,
      // which then fails decryption on every subsequent health check.
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        // Optional — only sent when the user filled it in. The server
        // requires it on first save or when changing numbers; for a
        // simple token rotation, leaving it blank skips re-register.
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        // Existing config — reuse stored encrypted token by decrypting on the
        // server. But our POST handler requires an access_token to verify
        // with Meta. If the user didn't change the token, we need to signal
        // that. Simplest: require token re-entry if they're updating.
        toast.error('Please re-enter the Access Token to save changes');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save configuration');
        setSaving(false);
        return;
      }

      // The route now returns a structured outcome:
      //   * registered=true   → number is live, events will flow
      //   * registered=false  → credentials saved but /register
      //                         failed; UI shows the specific error
      //                         and a retry path. registration_error
      //                         is human-readable from Meta.
      if (data.registered === false && data.registration_error) {
        toast.error(
          `Saved, but Meta couldn't register the number: ${data.registration_error}`,
          { duration: 12000 }
        );
      } else if (data.registration_skipped) {
        // Credentials saved + verified, but /register was skipped
        // because no PIN was supplied (e.g. a Meta test number).
        // Don't claim the number is "Live" — point at the
        // Registration status banner instead.
        toast.success(
          'Credentials saved and verified. Inbound registration was skipped (no PIN) — see Registration status below.',
          { duration: 10000 }
        );
        setPin('');
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Live — ${data.phone_info.verified_name} can now receive events.`
            : 'WhatsApp connected. Events will start flowing within a minute.'
        );
        // Clear the PIN so subsequent saves don't accidentally
        // re-register (which would void the active subscription if
        // the PIN became stale).
        setPin('');
      }

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(
          payload.phone_info?.verified_name
            ? `Connected to ${payload.phone_info.verified_name}`
            : 'API connection successful'
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(
          payload.needs_reset
            ? 'token_corrupted'
            : payload.reason === 'meta_api_error'
              ? 'meta_api_error'
              : null
        );
        setStatusMessage(payload.message || '');
        toast.error(payload.message || 'API connection failed');
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error('Connection test failed. Check network and try again.');
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch('/api/whatsapp/config/verify-registration', {
        method: 'GET',
      });
      const data = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(data);
      if (data.live) {
        toast.success('Number is fully wired — Meta is delivering events.');
      } else {
        toast.error(
          'Number is not fully registered. See the checks below for which step failed.',
          { duration: 8000 }
        );
      }
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('verify-registration failed:', err);
      toast.error('Could not reach the verification endpoint.');
    } finally {
      setVerifyingRegistration(false);
    }
  }

  async function handleReset() {
    if (
      !confirm(
        'This will delete the current WhatsApp config so you can re-enter it. Continue?'
      )
    ) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to reset configuration');
        return;
      }

      toast.success(
        'Configuration cleared. You can now re-enter your credentials.'
      );
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
      setBaileysStatus(null);
      setQrImageUrl(null);
      setBaileysError(null);
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  }

  async function fetchBaileysStatus(options: { silent?: boolean } = {}) {
    if (baileysStatusInFlightRef.current) return;

    baileysStatusInFlightRef.current = true;
    if (!options.silent) {
      setBaileysLoading(true);
    }
    setBaileysError(null);

    try {
      const res = await fetch('/api/whatsapp/baileys/status', {
        credentials: 'include',
        cache: 'no-store',
      });
      const text = await res.text();
      let data: BaileysSessionStatus | { error?: string };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {
          error: `Unexpected response (${res.status}): ${text.slice(0, 120)}`,
        };
      }

      if (!res.ok) {
        const message =
          'error' in data && data.error
            ? data.error
            : `Failed to fetch WhatsApp session status (${res.status}).`;
        setBaileysError(message);
        if ('connected' in data) {
          setBaileysStatus(data as BaileysSessionStatus);
        }
        return;
      }

      setBaileysStatus(data as BaileysSessionStatus);
      setBaileysLastCheckedAt(new Date().toISOString());
    } catch (err) {
      console.error('Failed to fetch Baileys status:', err);
      setBaileysError('Failed to fetch WhatsApp session status.');
    } finally {
      baileysStatusInFlightRef.current = false;
      if (!options.silent) {
        setBaileysLoading(false);
      }
    }
  }

  async function handleClearBaileysAuth() {
    if (!window.confirm(t('clearQrAuthConfirm'))) return;

    setBaileysClearingAuth(true);
    setBaileysError(null);

    try {
      const res = await fetch('/api/whatsapp/baileys/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();

      if (!res.ok) {
        setBaileysError(data?.error || t('clearQrAuthError'));
        return;
      }

      setBaileysStatus({
        connected: false,
        state: 'idle',
        qr: null,
        lastError: null,
        userJid: null,
      });
      setQrImageUrl(null);
      toast.success(t('clearQrAuthSuccess'));
    } catch (err) {
      console.error('Failed to logout Baileys:', err);
      setBaileysError(t('clearQrAuthError'));
    } finally {
      setBaileysClearingAuth(false);
    }
  }

  async function handleRestartBaileys() {
    setBaileysRestarting(true);
    setBaileysError(null);

    try {
      const res = await fetch('/api/whatsapp/baileys/restart', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      const text = await res.text();
      let data: { status?: BaileysSessionStatus; error?: string };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {
          error: `Unexpected response (${res.status}): ${text.slice(0, 120)}`,
        };
      }

      if (!res.ok) {
        setBaileysError(data.error || t('restartQrError'));
        return;
      }

      if (data.status) {
        setBaileysStatus(data.status);
        setBaileysLastCheckedAt(new Date().toISOString());
      }
      toast.success(t('restartQrSuccess'));
    } catch (err) {
      console.error('Failed to restart Baileys:', err);
      setBaileysError(t('restartQrError'));
    } finally {
      setBaileysRestarting(false);
    }
  }

  async function handleSyncBaileys() {
    setBaileysSyncing(true);
    setBaileysError(null);
    setBaileysSyncStartedAt(Date.now());
    setBaileysSyncElapsed(0);

    try {
      const res = await fetch('/api/whatsapp/baileys/sync', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        // Bring back the usable Inbox history, including older photos and
        // attachments, rather than only the last few chats/messages.
        body: JSON.stringify({ chat_limit: 250, message_limit: 100 }),
      });
      const text = await res.text();
      let data: {
        error?: string;
        chatsScanned?: number;
        messagesScanned?: number;
        messagesPersisted?: number;
      };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {
          error: `Unexpected response (${res.status}): ${text.slice(0, 120)}`,
        };
      }

      if (!res.ok) {
        setBaileysError(data.error || `Failed to sync chats (${res.status}).`);
        return;
      }

      toast.success(
        `Synced ${data.messagesPersisted ?? 0} new messages from ${data.chatsScanned ?? 0} chats.`
      );
      setBaileysLastSync({
        chats: data.chatsScanned ?? 0,
        scanned: data.messagesScanned ?? 0,
        imported: data.messagesPersisted ?? 0,
      });
    } catch (err) {
      console.error('Failed to sync Baileys chats:', err);
      setBaileysError('Failed to sync WhatsApp chats.');
    } finally {
      setBaileysSyncing(false);
      setBaileysSyncStartedAt(null);
    }
  }

  useEffect(() => {
    if (baileysStatus?.qr) {
      QRCode.toDataURL(baileysStatus.qr)
        .then((url) => setQrImageUrl(url))
        .catch((err) => {
          console.error('QR code render failed:', err);
          setQrImageUrl(null);
          setBaileysError('Failed to render the QR code.');
        });
    } else {
      setQrImageUrl(null);
    }
  }, [baileysStatus?.qr]);

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead title={t('title')} description={t('description')} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      </section>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';
  const whatsappConnected =
    connectionStatus === 'connected' || baileysStatus?.connected === true;
  const qrState = baileysStatus?.state ?? 'idle';
  const qrConnected =
    baileysStatus?.connected === true || qrState === 'connected';
  const qrStatusLabel = qrConnected
    ? t('qrStatusConnected')
    : qrState === 'starting'
      ? t('qrStatusStarting')
      : qrState === 'qr'
        ? t('qrStatusQr')
        : qrState === 'error'
          ? t('qrStatusError')
          : qrState === 'disconnected'
            ? t('qrStatusDisconnected')
            : t('qrStatusIdle');
  const qrStatusClass = qrConnected
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
    : qrState === 'starting'
      ? 'border-blue-500/30 bg-blue-500/10 text-blue-500'
      : qrState === 'qr'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
        : qrState === 'error' || qrState === 'disconnected'
          ? 'border-red-500/30 bg-red-500/10 text-red-500'
          : 'border-border bg-muted text-muted-foreground';
  const qrPollSeconds = Math.round(
    (qrConnected ? QR_STATUS_CONNECTED_POLL_MS : QR_STATUS_ACTIVE_POLL_MS) /
      1000
  );
  const qrLastCheckedLabel = baileysLastCheckedAt
    ? new Date(baileysLastCheckedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : t('qrNeverChecked');
  const qrLastActivityLabel = baileysStatus?.lastActivityAt
    ? new Date(baileysStatus.lastActivityAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : t('qrNeverChecked');
  const qrUptimeLabel = baileysStatus?.connectedForSeconds
    ? formatWorkerDuration(baileysStatus.connectedForSeconds)
    : '—';
  const workerTimeLabel = (value?: string | null) =>
    value
      ? new Date(value).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : 'Sem atividade';
  const syncSteps = [
    'A comunicar com o WhatsApp',
    'A listar conversas disponíveis',
    'A ler mensagens recentes',
    'A guardar mensagens no Inbox',
  ];
  const syncStepIndex = Math.min(
    syncSteps.length - 1,
    Math.floor(baileysSyncElapsed / 2)
  );
  const syncProgress = Math.min(92, 14 + baileysSyncElapsed * 7);
  const metaStatusClass =
    connectionStatus === 'connected'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
      : connectionStatus === 'disconnected'
        ? 'border-red-500/30 bg-red-500/10 text-red-500'
        : 'border-border bg-muted text-muted-foreground';
  const registrationStatusClass = isRegistered
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
    : config
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
      : 'border-border bg-muted text-muted-foreground';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />
      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          <StatusTile
            icon={<Smartphone className="size-4" />}
            label={t('qrSummaryLabel')}
            value={qrStatusLabel}
            detail={
              qrConnected
                ? t('whatsappQrConnected', {
                    jid: baileysStatus?.userJid ?? '',
                  })
                : qrState === 'starting'
                  ? t('whatsappQrRestoring')
                  : qrState === 'qr'
                    ? t('whatsappQrScanNow')
                    : t('qrSummaryDisconnected')
            }
            className={qrStatusClass}
          />
          <StatusTile
            icon={<Cloud className="size-4" />}
            label={t('metaSummaryLabel')}
            value={
              connectionStatus === 'connected'
                ? t('credentialsValid')
                : t('notConnected')
            }
            detail={
              connectionStatus === 'connected'
                ? t('metaSummaryConnected')
                : t('metaSummaryOptional')
            }
            className={metaStatusClass}
          />
          <StatusTile
            icon={<Radio className="size-4" />}
            label={t('webhookSummaryLabel')}
            value={
              isRegistered
                ? t('registeredShort')
                : config
                  ? t('notRegisteredShort')
                  : t('notConfiguredShort')
            }
            detail={
              isRegistered
                ? t('webhookSummaryLive')
                : config
                  ? t('webhookSummaryNeedsMeta')
                  : t('webhookSummaryWaiting')
            }
            className={registrationStatusClass}
          />
          <StatusTile
            icon={<Clock3 className="size-4" />}
            label="Worker ligado"
            value={qrConnected ? qrUptimeLabel : 'Parado'}
            detail={qrConnected ? `Ultima atividade: ${qrLastActivityLabel}` : baileysStatus?.lastError || 'Sem ligacao ao WhatsApp'}
            className={qrStatusClass}
          />
          <StatusTile
            icon={<Download className="size-4" />}
            label="Entradas nesta execucao"
            value={String(baileysStatus?.receivedCount ?? 0)}
            detail={`Ultima entrada: ${workerTimeLabel(baileysStatus?.lastIncomingAt)}`}
            className="border-sky-500/30 bg-sky-500/10 text-sky-600"
          />
          <StatusTile
            icon={<MessageCircle className="size-4" />}
            label="Saidas nesta execucao"
            value={String(baileysStatus?.sentCount ?? 0)}
            detail={`Ultima saida: ${workerTimeLabel(baileysStatus?.lastOutgoingAt)}`}
            className="border-violet-500/30 bg-violet-500/10 text-violet-600"
          />
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Registos do Worker</CardTitle>
              <CardDescription>
                Eventos recentes do WhatsApp: ligações, envios, entradas, sincronizações e erros.
              </CardDescription>
            </div>
            {workerLogsLoading && <RefreshCw className="text-muted-foreground size-4 animate-spin" />}
          </CardHeader>
          <CardContent>
            {workerLogs.length ? (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2 font-mono text-xs">
                {workerLogs.map((event, index) => (
                  <div key={`${event.at}-${index}`} className="flex flex-wrap gap-x-3 gap-y-1 rounded px-2 py-1.5 hover:bg-muted/60">
                    <span className="text-muted-foreground shrink-0">{new Date(event.at).toLocaleTimeString()}</span>
                    <span className="text-primary shrink-0 uppercase">{event.type}</span>
                    <span className="text-foreground break-words">{event.message}</span>
                    {event.details?.recipient || event.details?.sender ? (
                      <span className="text-muted-foreground shrink-0">
                        {event.details.recipient ? 'Para' : 'De'}:{' '}
                        {event.details.recipient || event.details.sender}
                      </span>
                    ) : null}
                    {event.details?.status ? (
                      <span className="text-muted-foreground shrink-0">
                        Estado: {event.details.status}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Ainda não há registos nesta execução. Os eventos surgem assim que o Worker inicia ou processa uma ação.</p>
            )}
          </CardContent>
        </Card>

        {/* Corrupted-token reset banner */}
        {showResetBanner && (
          <Alert className="border-amber-600/40 bg-amber-950/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
              <div className="flex-1">
                <AlertTitle className="mb-1 text-amber-200">
                  Stored token can&apos;t be decrypted
                </AlertTitle>
                <AlertDescription className="text-sm text-amber-100/80">
                  {statusMessage}
                </AlertDescription>
                <Button
                  onClick={handleReset}
                  disabled={resetting}
                  size="sm"
                  className="mt-3 bg-amber-600 text-white hover:bg-amber-700"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t('resetting')}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />
                      {t('resetConfig')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* WhatsApp QR Code session */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-foreground">
                  {t('whatsappQrTitle')}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {t('whatsappQrDesc')}
                </CardDescription>
              </div>
              <Badge className={`shrink-0 border ${qrStatusClass}`}>
                {qrStatusLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {baileysError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {baileysError}
              </div>
            )}

            {baileysSyncing && (
              <div
                className="border-primary/20 bg-primary/5 overflow-hidden rounded-xl border p-4"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 text-primary relative flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <Radio className="size-4 animate-pulse" />
                    <span className="bg-primary absolute size-2 animate-ping rounded-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-foreground text-sm font-semibold">
                        A sincronizar conversas…
                      </p>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {baileysSyncElapsed}s
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {syncSteps[syncStepIndex]}
                    </p>
                  </div>
                </div>
                <div className="bg-primary/10 mt-4 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {syncSteps.map((step, index) => (
                    <div key={step} className="flex items-center gap-1.5">
                      <span
                        className={`size-1.5 rounded-full ${
                          index <= syncStepIndex
                            ? 'bg-primary animate-pulse'
                            : 'bg-border'
                        }`}
                      />
                      <span className="text-muted-foreground hidden truncate text-[10px] sm:block">
                        {index === 0
                          ? 'Ligação'
                          : index === 1
                            ? 'Conversas'
                            : index === 2
                              ? 'Mensagens'
                              : 'Inbox'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {baileysLastSync && !baileysSyncing && (
              <div className="border-emerald-500/20 bg-emerald-500/5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-4 py-2.5 text-xs">
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  Última sincronização concluída
                </span>
                <span className="text-muted-foreground">
                  {baileysLastSync.chats} conversas verificadas
                </span>
                <span className="text-muted-foreground">
                  {baileysLastSync.scanned} mensagens analisadas
                </span>
                <span className="text-muted-foreground">
                  {baileysLastSync.imported} novas no Inbox
                </span>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="border-border bg-muted/40 rounded-lg border p-4">
                <p className="text-foreground text-sm font-medium">
                  {t('whatsappQrStatus')}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {qrConnected
                    ? t('whatsappQrConnected', {
                        jid: baileysStatus?.userJid ?? '',
                      })
                    : qrState === 'starting'
                      ? t('whatsappQrRestoring')
                      : qrState === 'qr'
                        ? t('whatsappQrScanNow')
                        : t('whatsappQrNotConnected')}
                </p>
                <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span>{t('qrAutoRefresh', { seconds: qrPollSeconds })}</span>
                  <span>
                    {t('qrLastChecked', { time: qrLastCheckedLabel })}
                  </span>
                  <span>
                    {t('qrLastActivity', { time: qrLastActivityLabel })}
                  </span>
                  {baileysStatus?.hasSavedAuth && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {t('qrSavedAuth')}
                    </span>
                  )}
                </div>

                {baileysStatus?.state === 'qr' && qrImageUrl ? (
                  <div className="border-border bg-background mt-4 rounded-lg border p-3">
                    <img
                      src={qrImageUrl}
                      alt="WhatsApp QR Code"
                      className="mx-auto max-h-72"
                    />
                    <p className="text-muted-foreground mt-2 text-center text-xs">
                      {t('whatsappQrHint')}
                    </p>
                  </div>
                ) : (
                  <div className="border-border bg-background text-muted-foreground mt-4 rounded-lg border p-4 text-sm">
                    {qrConnected
                      ? t('whatsappQrConnectedInfo')
                      : t('whatsappQrIdleInfo')}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="border-border bg-card rounded-lg border p-3">
                  <p className="text-foreground text-sm font-medium">
                    {t('qrActionsTitle')}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('qrActionsDesc')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchBaileysStatus()}
                      disabled={
                        baileysLoading ||
                        baileysClearingAuth ||
                        baileysRestarting
                      }
                      className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      {baileysLoading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      {t('refreshQrStatus')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRestartBaileys}
                      disabled={
                        baileysLoading ||
                        baileysClearingAuth ||
                        baileysRestarting
                      }
                      className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      {baileysRestarting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                      {t('restartQrSession')}
                    </Button>
                    {baileysStatus?.connected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSyncBaileys}
                        disabled={
                          baileysSyncing ||
                          baileysClearingAuth ||
                          baileysRestarting
                        }
                        className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        {baileysSyncing ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Download className="size-3.5" />
                        )}
                        Sync chats
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                  <p className="text-sm font-medium text-red-400">
                    {t('qrMaintenanceTitle')}
                  </p>
                  <p className="mt-1 text-xs text-red-300/80">
                    {t('qrMaintenanceDesc')}
                  </p>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearBaileysAuth}
                      disabled={
                        baileysSyncing ||
                        baileysClearingAuth ||
                        baileysRestarting
                      }
                      className="bg-background/60 border-red-500/30 text-red-400 hover:bg-red-950/40 hover:text-red-300"
                    >
                      {baileysClearingAuth ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      {t('clearQrAuth')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connection Status */}
        <Alert className="bg-card border-border">
          <div className="flex items-center gap-2">
            {whatsappConnected ? (
              <CheckCircle2 className="text-primary size-4" />
            ) : (
              <XCircle className="size-4 text-red-500" />
            )}
            <AlertTitle className="text-foreground mb-0">
              {whatsappConnected
                ? baileysStatus?.connected
                  ? t('whatsappQrConnectedTitle')
                  : t('credentialsValid')
                : t('notConnected')}
            </AlertTitle>
          </div>
          <AlertDescription className="text-muted-foreground">
            {whatsappConnected
              ? baileysStatus?.connected
                ? t('whatsappQrConnectedInfo')
                : t('connectedDesc')
              : t('notConnectedDescWithQr', {
                  state: baileysStatus?.state ?? 'unknown',
                  message: statusMessage || t('notConnectedDesc'),
                })}
          </AlertDescription>
        </Alert>

        {/* Registration Status — the "is it actually live?" check.
            Credentials being valid is necessary but not sufficient;
            without a successful /register call the number won't
            receive inbound events. Surface this dimension separately
            so users don't trust a misleading green banner. */}
        {config && (
          <Alert
            className={
              isRegistered
                ? 'border-emerald-700/50 bg-emerald-950/30'
                : 'border-amber-700/50 bg-amber-950/30'
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isRegistered ? (
                  <CheckCircle2 className="size-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-400" />
                )}
                <AlertTitle
                  className={
                    'mb-0 ' +
                    (isRegistered ? 'text-emerald-200' : 'text-amber-200')
                  }
                >
                  {isRegistered ? t('registered') : t('notRegistered')}
                </AlertTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerifyRegistration}
                disabled={verifyingRegistration}
                className="border-border text-foreground hover:bg-muted h-7 bg-transparent"
              >
                {verifyingRegistration ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Zap className="size-3.5" />
                )}
                {t('verifyWithMeta')}
              </Button>
            </div>
            <AlertDescription className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {isRegistered ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: t('subscribedSince', {
                      date: config.registered_at
                        ? new Date(config.registered_at).toLocaleString()
                        : t('unknownDate'),
                    }),
                  }}
                />
              ) : lastRegistrationError ? (
                <>
                  {t('lastAttemptFailed')}
                  <span className="text-red-300">
                    &quot;{lastRegistrationError}&quot;
                  </span>
                  . {t('retryHint')}
                </>
              ) : (
                <>{t('noRegistrationHint')}</>
              )}
            </AlertDescription>

            {registrationProbe && (
              <div className="border-border bg-card/60 mt-3 space-y-1.5 rounded border px-3 py-2 text-[11px]">
                <p className="text-foreground font-medium">
                  {t('diagnosticLastRun')}
                  <span
                    className={
                      registrationProbe.live
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }
                  >
                    {registrationProbe.live ? t('live') : t('notLive')}
                  </span>
                </p>
                <ul className="text-muted-foreground space-y-0.5">
                  {Object.entries(registrationProbe.checks).map(([k, v]) => (
                    <li key={k} className="flex items-center gap-1.5">
                      {v === true ? (
                        <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
                      ) : v === false ? (
                        <XCircle className="size-3 shrink-0 text-red-400" />
                      ) : (
                        <span className="border-border size-3 shrink-0 rounded-full border" />
                      )}
                      <code className="text-muted-foreground">{k}</code>
                    </li>
                  ))}
                </ul>
                {(registrationProbe.errors ?? []).length > 0 && (
                  <ul className="space-y-0.5 pt-1 text-red-300">
                    {registrationProbe.errors?.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Alert>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          {/* API Credentials */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                {t('apiCredentialsTitle')}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('apiCredentialsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t('phoneNumberId')}
                </Label>
                <Input
                  placeholder="e.g. 100234567890123"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('wabaId')}</Label>
                <Input
                  placeholder="e.g. 100234567890456"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t('accessToken')}
                </Label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    placeholder={t('accessTokenPlaceholder')}
                    value={accessToken}
                    onChange={(e) => {
                      setAccessToken(e.target.value);
                      setTokenEdited(true);
                    }}
                    onFocus={() => {
                      if (accessToken === MASKED_TOKEN) {
                        setAccessToken('');
                        setTokenEdited(true);
                      }
                    }}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
                  >
                    {showToken ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                {config && !tokenEdited && (
                  <p className="text-muted-foreground text-xs">
                    {t('tokenHidden')}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t('webhookVerifyToken')}
                </Label>
                <Input
                  placeholder={t('webhookVerifyTokenPlaceholder')}
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-muted-foreground text-xs">
                  {t('webhookVerifyTokenHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t('twoStepPin')}
                  <span className="text-muted-foreground ml-1">
                    {t('optional')}
                  </span>
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t('pinPlaceholder')}
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground tracking-widest"
                />
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <span
                    dangerouslySetInnerHTML={{ __html: t.raw('pinHint') }}
                  />
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Webhook URL */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                {t('webhookTitle')}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('webhookDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t('webhookUrl')}
                </Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={webhookUrl}
                    className="bg-muted border-border text-muted-foreground font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyWebhookUrl}
                    className="border-border text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('saveConfig')
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !config}
            className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('testing')}
              </>
            ) : (
              <>
                <Zap className="size-4" />
                {t('testConnection')}
              </>
            )}
          </Button>
          {config && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="border-red-900 text-red-400 hover:bg-red-950/40 hover:text-red-300"
            >
              {resetting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('resetting')}
                </>
              ) : (
                <>
                  <RotateCcw className="size-4" />
                  {t('resetConfig')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
