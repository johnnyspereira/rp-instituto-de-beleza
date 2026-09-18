'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, LockKeyhole, TimerReset } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import {
  formatWorkDuration,
  getLocalWorkDate,
  secondsBetween,
  WORK_HEARTBEAT_MS,
  WORK_IDLE_LOCK_GRACE_MS,
  WORK_IDLE_WARNING_MS,
} from '@/lib/work-time/config';
import type { WorkTimeSnapshot } from '@/lib/work-time/types';

type WorkTimeContextValue = {
  snapshot: WorkTimeSnapshot | null;
  loading: boolean;
  unavailable: boolean;
  locked: boolean;
  netSeconds: number;
  breakSeconds: number;
  status: 'open' | 'closed' | 'paused' | 'absent' | 'idle';
  startDay: () => Promise<void>;
  refresh: () => Promise<void>;
  closeDay: () => Promise<void>;
};

const WorkTimeContext = createContext<WorkTimeContextValue | null>(null);

export function WorkTimeProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('WorkTime');
  const { user, profile } = useAuth();
  const supabase = createClient();

  const [snapshot, setSnapshot] = useState<WorkTimeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [locked, setLocked] = useState(false);
  const [warningDeadline, setWarningDeadline] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [password, setPassword] = useState('');
  const [breakJustification, setBreakJustification] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const lastActivityRef = useRef(Date.now());
  const lastHeartbeatRef = useRef(0);
  const lockedRef = useRef(false);
  const snapshotRef = useRef<WorkTimeSnapshot | null>(null);
  const startingLockRef = useRef(false);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const applySnapshot = useCallback((next: WorkTimeSnapshot) => {
    setSnapshot(next);
    setUnavailable(false);

    const hasOpenForcedBreak =
      next.session?.status === 'open' &&
      next.breaks.some(
        (item) =>
          !item.ended_at &&
          (item.reason === 'forced_inactivity' || item.reason === 'system_lock')
      );

    if (hasOpenForcedBreak) {
      setWarningDeadline(null);
      setLocked(true);
    }
  }, []);

  const fetchSnapshot = useCallback(
    async (showLoading = false) => {
      if (!user) return;
      if (showLoading) setLoading(true);
      try {
        const date = getLocalWorkDate();
        const res = await fetch(`/api/work-time?date=${date}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) throw new Error(await readApiError(res));
        applySnapshot((await res.json()) as WorkTimeSnapshot);
      } catch (error) {
        console.error('[WorkTimeProvider] fetch failed:', error);
        setUnavailable(true);
      } finally {
        setLoading(false);
      }
    },
    [applySnapshot, user]
  );

  const postAction = useCallback(
    async (
      action:
        'start_day' | 'heartbeat' | 'start_break' | 'end_break' | 'close_day',
      body: Record<string, unknown> = {}
    ) => {
      if (!user) return null;
      const res = await fetch('/api/work-time', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          date: getLocalWorkDate(),
          ...body,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const next = (await res.json()) as WorkTimeSnapshot;
      applySnapshot(next);
      return next;
    },
    [applySnapshot, user]
  );

  const markHeartbeat = useCallback(async () => {
    const current = snapshotRef.current;
    if (
      !current?.session ||
      current.session.status !== 'open' ||
      lockedRef.current
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastHeartbeatRef.current < WORK_HEARTBEAT_MS / 2) return;
    lastHeartbeatRef.current = now;
    try {
      await postAction('heartbeat');
    } catch (error) {
      console.error('[WorkTimeProvider] heartbeat failed:', error);
    }
  }, [postAction]);

  const acknowledgePresence = useCallback(() => {
    lastActivityRef.current = Date.now();
    setWarningDeadline(null);
    void markHeartbeat();
  }, [markHeartbeat]);

  const startForcedLock = useCallback(async () => {
    if (startingLockRef.current) return;
    startingLockRef.current = true;
    setWarningDeadline(null);
    setLocked(true);
    setLockError(null);
    try {
      await postAction('start_break', { reason: 'forced_inactivity' });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('lockFailed');
      setLockError(message);
    } finally {
      startingLockRef.current = false;
    }
  }, [postAction, t]);

  const startDay = useCallback(async () => {
    try {
      await postAction('start_day');
      lastActivityRef.current = Date.now();
      toast.success(t('startedToast'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('startFailed');
      toast.error(message);
    }
  }, [postAction, t]);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.email) {
      setLockError(t('missingEmail'));
      return;
    }
    setLockError(null);
    const trimmedJustification = breakJustification.trim();
    if (!trimmedJustification) {
      setLockError(t('justificationRequired'));
      return;
    }
    setUnlocking(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });
      if (error) {
        setLockError(t('wrongPassword'));
        return;
      }
      await postAction('end_break', { justification: trimmedJustification });
      lastActivityRef.current = Date.now();
      setPassword('');
      setBreakJustification('');
      setLocked(false);
      toast.success(t('unlockedToast'));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('unlockFailed');
      setLockError(message);
    } finally {
      setUnlocking(false);
    }
  };

  const closeDay = useCallback(async () => {
    try {
      await postAction('close_day');
      toast.success(t('closedToast'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('closeFailed');
      toast.error(message);
    }
  }, [postAction, t]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    void Promise.resolve().then(async () => {
      if (!cancelled) await fetchSnapshot(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSnapshot, user]);

  useEffect(() => {
    if (!user || unavailable) return;
    const onActivity = () => {
      if (lockedRef.current) return;
      lastActivityRef.current = Date.now();
      if (warningDeadline === null) void markHeartbeat();
    };

    const events: (keyof DocumentEventMap)[] = [
      'mousemove',
      'keydown',
      'pointerdown',
      'scroll',
      'touchstart',
    ];
    events.forEach((event) =>
      document.addEventListener(event, onActivity, { passive: true })
    );

    const onVisibility = () => {
      if (!document.hidden && !lockedRef.current) {
        lastActivityRef.current = Date.now();
        void markHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    return () => {
      events.forEach((event) =>
        document.removeEventListener(event, onActivity)
      );
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [markHeartbeat, unavailable, user, warningDeadline]);

  useEffect(() => {
    if (!user || unavailable) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setNowMs(now);

      const current = snapshotRef.current;
      if (
        !current?.session ||
        current.session.status !== 'open' ||
        lockedRef.current
      ) {
        return;
      }

      if (warningDeadline !== null) {
        if (now >= warningDeadline) void startForcedLock();
        return;
      }

      if (now - lastActivityRef.current >= WORK_IDLE_WARNING_MS) {
        setWarningDeadline(now + WORK_IDLE_LOCK_GRACE_MS);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startForcedLock, unavailable, user, warningDeadline]);

  useEffect(() => {
    if (!user || unavailable) return;
    const interval = setInterval(() => void markHeartbeat(), WORK_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [markHeartbeat, unavailable, user]);

  const liveTotals = useMemo(() => {
    if (!snapshot?.session) return { netSeconds: 0, breakSeconds: 0 };
    const nowIso = new Date(nowMs).toISOString();
    const effectiveEnd = snapshot.session.ended_at ?? nowIso;
    const grossSeconds = secondsBetween(
      snapshot.session.started_at,
      effectiveEnd
    );
    const breakSeconds = snapshot.breaks.reduce(
      (sum, item) =>
        sum + secondsBetween(item.started_at, item.ended_at ?? nowIso),
      0
    );
    return {
      netSeconds: Math.max(0, grossSeconds - breakSeconds),
      breakSeconds,
    };
  }, [nowMs, snapshot]);

  const warningSeconds = warningDeadline
    ? Math.max(0, Math.ceil((warningDeadline - nowMs) / 1000))
    : 0;

  const value: WorkTimeContextValue = {
    snapshot,
    loading,
    unavailable,
    locked,
    netSeconds: liveTotals.netSeconds,
    breakSeconds: liveTotals.breakSeconds,
    status: snapshot
      ? !snapshot.session
        ? 'idle'
        : snapshot.session.status === 'absent'
          ? 'absent'
          : snapshot.session.status === 'closed'
            ? 'closed'
            : snapshot.breaks.some((item) => !item.ended_at)
              ? 'paused'
              : 'open'
      : 'idle',
    startDay,
    refresh: () => fetchSnapshot(true),
    closeDay,
  };

  return (
    <WorkTimeContext.Provider value={value}>
      {children}
      {warningDeadline !== null && !locked ? (
        <div className="bg-card fixed right-4 bottom-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-amber-300 p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-foreground text-sm font-semibold">
                {t('areYouThereTitle')}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('areYouThereDesc', { seconds: warningSeconds })}
              </p>
              <div className="mt-3 flex justify-end">
                <Button type="button" size="sm" onClick={acknowledgePresence}>
                  {t('iAmHere')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {locked ? (
        <div className="bg-background/95 fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <form
            onSubmit={unlock}
            className="border-border bg-card w-full max-w-sm rounded-xl border p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-foreground text-base font-semibold">
                  {t('lockedTitle')}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('lockedDesc')}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="work-lock-email">{t('email')}</Label>
                <Input
                  id="work-lock-email"
                  value={profile?.email ?? ''}
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="work-lock-password">{t('password')}</Label>
                <Input
                  id="work-lock-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                  autoComplete="current-password"
                  disabled={unlocking}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="work-lock-justification">
                  {t('justification')}
                </Label>
                <Textarea
                  id="work-lock-justification"
                  value={breakJustification}
                  onChange={(event) =>
                    setBreakJustification(event.target.value)
                  }
                  placeholder={t('justificationPlaceholder')}
                  disabled={unlocking}
                  required
                />
              </div>
            </div>

            {lockError ? (
              <p className="border-destructive/30 bg-destructive/10 text-destructive mt-3 rounded-lg border px-3 py-2 text-sm">
                {lockError}
              </p>
            ) : null}

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <TimerReset className="h-4 w-4" />
                {t('forcedPauseRunning', {
                  duration: formatWorkDuration(liveTotals.breakSeconds),
                })}
              </div>
              <Button
                type="submit"
                disabled={unlocking || !password || !breakJustification.trim()}
              >
                {unlocking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('unlocking')}
                  </>
                ) : (
                  t('unlock')
                )}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </WorkTimeContext.Provider>
  );
}

export function useWorkTime() {
  const value = useContext(WorkTimeContext);
  if (!value) {
    return {
      snapshot: null,
      loading: false,
      unavailable: true,
      locked: false,
      netSeconds: 0,
      breakSeconds: 0,
      status: 'idle' as const,
      startDay: async () => {},
      refresh: async () => {},
      closeDay: async () => {},
    };
  }
  return value;
}

async function readApiError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
