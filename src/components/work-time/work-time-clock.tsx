'use client';

import Link from 'next/link';
import { Clock3, LockKeyhole, TimerOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { formatWorkDuration } from '@/lib/work-time/config';
import { cn } from '@/lib/utils';
import { useWorkTime } from './work-time-provider';

export function WorkTimeClock() {
  const t = useTranslations('WorkTime');
  const { loading, unavailable, locked, netSeconds, breakSeconds, status } =
    useWorkTime();

  const label = loading
    ? t('loadingShort')
    : unavailable
      ? t('unavailableShort')
      : status === 'idle'
        ? t('notStartedShort')
        : status === 'absent'
          ? t('absentShort')
          : status === 'paused'
            ? t('pausedShort')
            : status === 'closed'
              ? t('closedShort')
              : formatWorkDuration(netSeconds);

  const Icon =
    locked || status === 'paused'
      ? LockKeyhole
      : status === 'closed'
        ? TimerOff
        : Clock3;

  return (
    <Link
      href="/settings?tab=work-time"
      className={cn(
        'border-border bg-card text-foreground hover:bg-muted hidden h-9 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-colors sm:inline-flex',
        (locked || status === 'paused') &&
          'border-amber-300 bg-amber-50 text-amber-700',
        unavailable && 'text-muted-foreground'
      )}
      title={t('openWorkTime')}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="tabular-nums">{label}</span>
      {!loading && !unavailable && breakSeconds > 0 ? (
        <span className="text-muted-foreground hidden lg:inline">
          {t('pauseShort', { duration: formatWorkDuration(breakSeconds) })}
        </span>
      ) : null}
    </Link>
  );
}
