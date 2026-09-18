'use client';

import { useState } from 'react';
import { Clock3, LockKeyhole, RefreshCw, TimerOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';
import { useWorkTime } from '@/components/work-time/work-time-provider';
import { formatWorkDuration, secondsBetween } from '@/lib/work-time/config';
import type { WorkBreak, WorkTimeDay } from '@/lib/work-time/types';
import { cn } from '@/lib/utils';

const CONFIRM_WORDS = [
  'tempo',
  'ponto',
  'foco',
  'presenca',
  'jornada',
  'lumiar',
  'crm',
];

export function WorkTimePanel() {
  const t = useTranslations('Settings.workTime');
  const {
    snapshot,
    loading,
    unavailable,
    netSeconds,
    breakSeconds,
    refresh,
    startDay,
    closeDay,
  } = useWorkTime();
  const [confirmationAction, setConfirmationAction] = useState<
    'start' | 'close' | null
  >(null);
  const [confirmationWord, setConfirmationWord] = useState('');
  const [confirmationInput, setConfirmationInput] = useState('');

  const today = snapshot
    ? {
        ...snapshot,
        totals: {
          ...snapshot.totals,
          netSeconds,
          breakSeconds,
        },
      }
    : null;
  const session = today?.session ?? null;
  const todayPaused = Boolean(
    session?.status === 'open' && today?.breaks.some((item) => !item.ended_at)
  );
  const hasStarted = Boolean(session);
  const isAbsent = session?.status === 'absent';
  const hasUnjustifiedBreaks = Boolean(
    today?.breaks.some((item) => !item.justification?.trim())
  );

  const requestConfirmation = (action: 'start' | 'close') => {
    setConfirmationAction(action);
    setConfirmationInput('');
    setConfirmationWord(randomConfirmationWord());
  };

  const cancelConfirmation = () => {
    setConfirmationAction(null);
    setConfirmationInput('');
    setConfirmationWord('');
  };

  const confirmAction = async () => {
    if (
      confirmationInput.trim().toLowerCase() !== confirmationWord.toLowerCase()
    ) {
      return;
    }
    if (confirmationAction === 'start') await startDay();
    if (confirmationAction === 'close') await closeDay();
    cancelConfirmation();
  };

  return (
    <section className="animate-in fade-in-50 max-w-5xl duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      {unavailable ? (
        <Card>
          <CardContent>
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t('unavailable')}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  {t('today')}
                </p>
                <h3 className="text-foreground mt-1 text-2xl font-bold">
                  {session?.work_date ?? t('notStarted')}
                </h3>
              </div>
              <div
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  !hasStarted
                    ? 'bg-muted text-muted-foreground'
                    : isAbsent
                      ? 'bg-muted text-muted-foreground'
                      : todayPaused
                        ? 'bg-amber-500/10 text-amber-600'
                        : session?.status === 'closed'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-emerald-500/10 text-emerald-600'
                )}
              >
                {!hasStarted
                  ? t('notStarted')
                  : isAbsent
                    ? t('absent')
                    : todayPaused
                      ? t('paused')
                      : session?.status === 'closed'
                        ? t('closed')
                        : t('open')}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryBox
                icon={Clock3}
                label={t('worked')}
                value={formatWorkDuration(today?.totals.netSeconds ?? 0)}
              />
              <SummaryBox
                icon={TimerOff}
                label={t('pauses')}
                value={formatWorkDuration(today?.totals.breakSeconds ?? 0)}
              />
              <SummaryBox
                icon={LockKeyhole}
                label={t('forcedPauses')}
                value={(today?.breaks.length ?? 0).toLocaleString()}
              />
            </div>

            <div className="bg-muted/35 grid gap-3 rounded-lg p-3 text-sm sm:grid-cols-2">
              <Detail
                label={t('startedAt')}
                value={formatTime(session?.started_at)}
              />
              <Detail
                label={t('lastActivity')}
                value={formatTime(session?.last_active_at)}
              />
              <Detail
                label={t('closedAt')}
                value={formatTime(session?.closed_at)}
              />
              <Detail
                label={t('grossTime')}
                value={formatWorkDuration(today?.totals.grossSeconds ?? 0)}
              />
            </div>

            {confirmationAction ? (
              <div className="border-primary/30 bg-primary/5 rounded-lg border p-3">
                <p className="text-foreground text-sm font-medium">
                  {confirmationAction === 'start'
                    ? t('confirmStartTitle')
                    : t('confirmCloseTitle')}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('confirmWordHint')}{' '}
                  <strong className="text-foreground font-mono">
                    {confirmationWord}
                  </strong>
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={confirmationInput}
                    onChange={(event) =>
                      setConfirmationInput(event.target.value)
                    }
                    className="border-input bg-background focus:border-ring focus:ring-ring/30 min-h-10 flex-1 rounded-lg border px-3 text-sm outline-none focus:ring-3"
                    placeholder={t('confirmWordPlaceholder')}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={cancelConfirmation}
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void confirmAction()}
                      disabled={
                        confirmationInput.trim().toLowerCase() !==
                        confirmationWord.toLowerCase()
                      }
                    >
                      {t('confirm')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <RefreshCw
                  className={cn('h-4 w-4', loading && 'animate-spin')}
                />
                {t('refresh')}
              </Button>
              {!hasStarted ? (
                <Button
                  type="button"
                  onClick={() => requestConfirmation('start')}
                  disabled={loading || unavailable}
                >
                  {t('startDay')}
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => requestConfirmation('close')}
                disabled={
                  loading ||
                  !hasStarted ||
                  isAbsent ||
                  session?.status === 'closed' ||
                  hasUnjustifiedBreaks
                }
              >
                {t('closeDay')}
              </Button>
            </div>
            {hasUnjustifiedBreaks ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t('unjustifiedBreaksWarning')}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-foreground text-base font-semibold">
                  {t('todayBreaks')}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t('todayBreaksDesc')}
                </p>
              </div>
            </div>
            <BreakList breaks={today?.breaks ?? []} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent>
          <div className="mb-4">
            <h3 className="text-foreground text-base font-semibold">
              {t('recentDays')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('recentDaysDesc')}
            </p>
          </div>
          <div className="grid gap-2">
            {(snapshot?.recent ?? []).map((day) => (
              <RecentDayRow key={day.session.id} day={day} />
            ))}
            {snapshot?.recent.length === 0 ? (
              <p className="bg-muted/35 text-muted-foreground rounded-lg px-3 py-4 text-sm">
                {t('noDays')}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SummaryBox({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-muted/35 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm font-medium">
          {label}
        </span>
        <Icon className="text-primary h-4 w-4" />
      </div>
      <p className="text-foreground mt-2 text-2xl font-bold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="text-foreground mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function BreakList({ breaks }: { breaks: WorkBreak[] }) {
  const t = useTranslations('Settings.workTime');
  if (breaks.length === 0) {
    return (
      <p className="bg-muted/35 text-muted-foreground rounded-lg px-3 py-4 text-sm">
        {t('noBreaks')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {breaks.map((item) => (
        <div
          key={item.id}
          className="bg-muted/35 flex items-center justify-between gap-3 rounded-lg px-3 py-3"
        >
          <div className="min-w-0">
            <p className="text-foreground text-sm font-semibold">
              {t(`reason.${item.reason}`)}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatTime(item.started_at)} - {formatTime(item.ended_at)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {item.justification?.trim()
                ? item.justification
                : t('withoutJustification')}
            </p>
          </div>
          <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
            {formatWorkDuration(
              secondsBetween(
                item.started_at,
                item.ended_at ?? new Date().toISOString()
              )
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function RecentDayRow({ day }: { day: WorkTimeDay }) {
  const t = useTranslations('Settings.workTime');
  return (
    <div className="bg-muted/35 grid gap-3 rounded-lg px-3 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
      <div>
        <p className="text-foreground font-semibold">{day.session.work_date}</p>
        <p className="text-muted-foreground text-xs">
          {day.session.status === 'absent'
            ? t('absent')
            : day.session.status === 'closed'
              ? t('closed')
              : t('open')}
        </p>
      </div>
      <span className="text-muted-foreground">
        {t('worked')}:{' '}
        <strong className="text-foreground">
          {formatWorkDuration(day.totals.netSeconds)}
        </strong>
      </span>
      <span className="text-muted-foreground">
        {t('pauses')}:{' '}
        <strong className="text-foreground">
          {formatWorkDuration(day.totals.breakSeconds)}
        </strong>
      </span>
      <span className="text-muted-foreground">
        {t('forcedPauses')}:{' '}
        <strong className="text-foreground">{day.breaks.length}</strong>
      </span>
    </div>
  );
}

function randomConfirmationWord() {
  return CONFIRM_WORDS[Math.floor(Math.random() * CONFIRM_WORDS.length)]!;
}

function formatTime(value: string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
