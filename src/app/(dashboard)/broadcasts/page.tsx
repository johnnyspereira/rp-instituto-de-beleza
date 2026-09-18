'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast } from '@/types';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Radio, Plus, Loader2, Copy, CalendarDays, List } from 'lucide-react';
import { useCan } from '@/hooks/use-can';
import { useAuth } from '@/hooks/use-auth';
import { GatedButton } from '@/components/ui/gated-button';
import { getBroadcastStatus } from '@/lib/broadcast-status';
import { useTranslations } from 'next-intl';

/**
 * Poll cadence while any broadcast is sending. Kept modest so we don't
 * beat on Supabase — the aggregate trigger in migration 003 keeps
 * counts consistent; we just need to surface the freshest snapshot.
 */
const POLL_INTERVAL_MS = 5_000;

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function RateCell({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  /** Tailwind bg class for the fill, e.g. "bg-primary" */
  color: string;
}) {
  const pct = percent(value, total);
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
        {pct}%
      </span>
      <div className="bg-muted h-1.5 w-20 overflow-hidden rounded-full">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BroadcastsPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.page');
  const tStatus = useTranslations('Broadcasts.status');
  const canCreate = useCan('send-messages');
  const { accountId } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [error, setError] = useState<string | null>(null);

  // Used to kick off polling only while something is actively sending.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchBroadcasts() {
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setBroadcasts(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const anySending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts]
  );

  useEffect(() => {
    function startPolling() {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(fetchBroadcasts, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!pollTimer.current) return;
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }

    // Pause polling while the tab is hidden — keeps Supabase cold when
    // the user is away, and ensures a fresh fetch the moment they
    // refocus so they don't see stale data on return.
    function handleVisibilityChange() {
      if (!anySending) return;
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        fetchBroadcasts();
        startPolling();
      }
    }

    if (anySending && document.visibilityState === 'visible') {
      startPolling();
    } else {
      stopPolling();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [anySending]);

  async function duplicateBroadcast(
    broadcast: Broadcast,
    event: React.MouseEvent<HTMLButtonElement>
  ) {
    event.stopPropagation();
    setDuplicatingId(broadcast.id);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error(t('toastNotSignedIn'));
      if (!accountId) throw new Error(t('toastNoAccount'));

      const { error } = await supabase.from('broadcasts').insert({
        user_id: user.id,
        account_id: accountId,
        name: t('copyName', { name: broadcast.name }),
        template_name: broadcast.template_name,
        template_language: broadcast.template_language,
        template_variables: broadcast.template_variables ?? {},
        audience_filter: broadcast.audience_filter ?? {},
        status: 'draft',
        total_recipients: 0,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        failed_count: 0,
      });
      if (error) throw error;
      toast.success(t('toastDuplicated'));
      fetchBroadcasts();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('toastDuplicateFailed');
      toast.error(message);
    } finally {
      setDuplicatingId(null);
    }
  }

  const calendarDays = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      const items = broadcasts.filter((broadcast) => {
        const raw = broadcast.scheduled_at || broadcast.created_at;
        return new Date(raw).toISOString().slice(0, 10) === key;
      });
      return { date, key, inMonth: date.getMonth() === month, items };
    });
  }, [broadcasts]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top indeterminate progress bar: only visible while a broadcast
          is mid-send. Pure CSS animation so no extra deps. */}
      {anySending && (
        <div
          role="progressbar"
          aria-label="Broadcast in progress"
          className="broadcast-indeterminate bg-muted fixed inset-x-0 top-0 z-40 h-0.5 overflow-hidden"
        >
          <div className="broadcast-indeterminate-bar bg-primary h-0.5" />
          <style jsx>{`
            .broadcast-indeterminate-bar {
              width: 33%;
              transform: translateX(-100%);
              animation: broadcast-slide 1.6s cubic-bezier(0.4, 0, 0.2, 1)
                infinite;
            }
            @keyframes broadcast-slide {
              0% {
                transform: translateX(-100%);
              }
              100% {
                transform: translateX(400%);
              }
            }
          `}</style>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setView(view === 'list' ? 'calendar' : 'list')}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            {view === 'list' ? (
              <CalendarDays className="h-4 w-4" />
            ) : (
              <List className="h-4 w-4" />
            )}
            {view === 'list' ? t('calendarView') : t('listView')}
          </Button>
          <GatedButton
            canAct={canCreate}
            gateReason="create broadcasts"
            onClick={() => router.push('/broadcasts/new')}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('newBroadcast')}
          </GatedButton>
        </div>
      </div>

      {broadcasts.length === 0 ? (
        <div className="border-border bg-card flex h-64 flex-col items-center justify-center rounded-xl border">
          <Radio className="text-muted-foreground mb-3 h-10 w-10" />
          <p className="text-foreground text-sm font-medium">
            {t('noBroadcastsYet')}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t('createFirst')}
          </p>
          <GatedButton
            canAct={canCreate}
            gateReason="create broadcasts"
            onClick={() => router.push('/broadcasts/new')}
            className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4"
          >
            <Plus className="h-4 w-4" />
            {t('newBroadcast')}
          </GatedButton>
        </div>
      ) : view === 'calendar' ? (
        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="border-border bg-muted/30 grid grid-cols-7 border-b text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((day) => (
              <div key={day} className="px-2 py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day) => (
              <div
                key={day.key}
                className={`border-border min-h-28 border-r border-b p-2 last:border-r-0 ${
                  day.inMonth ? 'bg-card' : 'bg-muted/20'
                }`}
              >
                <p className="text-muted-foreground text-xs">
                  {day.date.getDate()}
                </p>
                <div className="mt-2 space-y-1">
                  {day.items.slice(0, 3).map((broadcast) => {
                    const status = getBroadcastStatus(broadcast.status);
                    return (
                      <button
                        key={broadcast.id}
                        type="button"
                        onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                        className={`block w-full truncate rounded-md border px-2 py-1 text-left text-[11px] ${status.classes}`}
                        title={broadcast.name}
                      >
                        {broadcast.name}
                      </button>
                    );
                  })}
                  {day.items.length > 3 && (
                    <p className="text-muted-foreground text-[11px]">
                      +{day.items.length - 3}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">
                  {t('table.name')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden md:table-cell">
                  {t('table.template')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden text-right sm:table-cell">
                  {t('table.recipients')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden lg:table-cell">
                  {t('table.delivery')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden lg:table-cell">
                  {t('table.read')}
                </TableHead>
                <TableHead className="text-muted-foreground">
                  {t('table.status')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden sm:table-cell">
                  {t('table.date')}
                </TableHead>
                <TableHead className="text-muted-foreground text-right">
                  {t('table.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((broadcast) => {
                const status = getBroadcastStatus(broadcast.status);
                return (
                  <TableRow
                    key={broadcast.id}
                    className="border-border hover:bg-muted/50 cursor-pointer"
                    onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                  >
                    <TableCell className="text-foreground font-medium">
                      {broadcast.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">
                      {broadcast.template_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                      {broadcast.total_recipients}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <RateCell
                        value={broadcast.delivered_count}
                        total={broadcast.total_recipients}
                        color="bg-primary"
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <RateCell
                        value={broadcast.read_count}
                        total={broadcast.total_recipients}
                        color="bg-blue-500"
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
                      >
                        {status.pulse && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-400" />
                          </span>
                        )}
                        {tStatus(status.label)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {new Date(broadcast.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={duplicatingId === broadcast.id}
                        onClick={(event) => duplicateBroadcast(broadcast, event)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {duplicatingId === broadcast.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        {t('duplicate')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
