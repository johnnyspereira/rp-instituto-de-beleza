'use client';

import {
  GitFork,
  ListChecks,
  MessageCircle,
  MousePointerClick,
  PlayCircle,
  QrCode,
  ShieldCheck,
  Tags,
  Workflow,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

const GUIDE_STEPS = [
  { key: 'trigger', icon: MousePointerClick },
  { key: 'nodes', icon: Workflow },
  { key: 'branches', icon: GitFork },
  { key: 'data', icon: Tags },
  { key: 'activate', icon: PlayCircle },
] as const;

const CHANNELS = [
  { key: 'meta', icon: ShieldCheck },
  { key: 'qr', icon: QrCode },
] as const;

export function FlowGuide({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('Flows.guide');

  return (
    <section
      className={cn(
        'border-border bg-card rounded-xl border',
        compact ? 'p-4' : 'p-5'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-foreground inline-flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="text-primary h-4 w-4" />
            {t('title')}
          </div>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-relaxed">
            {t('description')}
          </p>
        </div>
        <span className="border-primary/30 bg-primary-soft text-primary rounded-full border px-2.5 py-1 text-[11px] font-semibold">
          {t('badge')}
        </span>
      </div>

      <div
        className={cn(
          'mt-4 grid gap-3',
          compact
            ? 'grid-cols-1 md:grid-cols-5'
            : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-5'
        )}
      >
        {GUIDE_STEPS.map(({ key, icon: Icon }, index) => (
          <div
            key={key}
            className="border-border bg-background rounded-lg border p-3"
          >
            <div className="flex items-center gap-2">
              <span className="bg-primary-soft text-primary flex h-7 w-7 items-center justify-center rounded-md">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-muted-foreground text-[11px] font-semibold uppercase">
                {t('stepNumber', { number: index + 1 })}
              </span>
            </div>
            <h3 className="text-foreground mt-3 text-sm font-semibold">
              {t(`steps.${key}.title`)}
            </h3>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {t(`steps.${key}.body`)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {CHANNELS.map(({ key, icon: Icon }) => (
          <div
            key={key}
            className="border-border bg-background rounded-lg border p-3"
          >
            <div className="flex items-center gap-2">
              <span className="bg-muted text-foreground flex h-8 w-8 items-center justify-center rounded-md">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-foreground text-sm font-semibold">
                  {t(`channels.${key}.title`)}
                </h3>
                <p className="text-primary text-[11px] font-medium">
                  {t(`channels.${key}.status`)}
                </p>
              </div>
            </div>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {t(`channels.${key}.body`)}
            </p>
          </div>
        ))}
      </div>

      <div className="border-border bg-muted/35 mt-4 rounded-lg border border-dashed p-3">
        <div className="flex items-start gap-2">
          <MessageCircle className="text-primary mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t('tip')}
          </p>
        </div>
      </div>
    </section>
  );
}
