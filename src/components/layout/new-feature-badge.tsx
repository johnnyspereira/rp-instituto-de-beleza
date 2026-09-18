'use client';

import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

export const NEW_FEATURE_BADGE_STYLES = {
  emerald:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.16)]',
  amber:
    'border-amber-500/40 bg-amber-500/10 text-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.14)]',
  sky: 'border-sky-500/40 bg-sky-500/10 text-sky-300 shadow-[0_0_18px_rgba(14,165,233,0.14)]',
  violet:
    'border-violet-500/40 bg-violet-500/10 text-violet-300 shadow-[0_0_18px_rgba(139,92,246,0.14)]',
  rose: 'border-rose-500/40 bg-rose-500/10 text-rose-300 shadow-[0_0_18px_rgba(244,63,94,0.14)]',
} as const;

export type NewFeatureBadgeStyle = keyof typeof NEW_FEATURE_BADGE_STYLES;

interface NewFeatureBadgeProps {
  badge: {
    key: string;
    label?: string;
    className?: string;
  };
  compact?: boolean;
}

export function NewFeatureBadge({ badge, compact }: NewFeatureBadgeProps) {
  const { account, profileLoading } = useAuth();

  // The account controls this server-backed preference. Nothing is kept in
  // browser storage, so clearing cookies/cache cannot make labels return.
  if (profileLoading || !account?.new_feature_badges_enabled) return null;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-black tracking-[0.16em] uppercase',
        NEW_FEATURE_BADGE_STYLES.emerald,
        compact && 'px-1 py-0 text-[8px]',
        badge.className
      )}
      title="Nova funcionalidade"
    >
      {badge.label || 'NOVO'}
    </span>
  );
}
