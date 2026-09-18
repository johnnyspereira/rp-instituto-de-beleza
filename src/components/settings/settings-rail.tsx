'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CircleUserRound,
  Database,
  MessageSquareText,
  Settings2,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  RAIL_GROUPS,
  SECTION_META,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from './settings-sections';

const RAIL_DESKTOP_MIN_PX = 1024;

const GROUP_ICONS: Record<(typeof RAIL_GROUPS)[number]['group'], LucideIcon> = {
  main: Building2,
  account: CircleUserRound,
  operation: BriefcaseBusiness,
  clinic: CalendarDays,
  messaging: MessageSquareText,
  crm: Database,
  system: Settings2,
};

export function SettingsRail({
  active,
  onSelect,
  hints,
  sections = SETTINGS_SECTIONS,
}: {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  hints?: Partial<Record<SettingsSection, ReactNode>>;
  sections?: readonly SettingsSection[];
}) {
  const t = useTranslations('Settings');
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia(`(min-width: ${RAIL_DESKTOP_MIN_PX}px)`).matches) {
      return;
    }
    activeRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [active]);

  return (
    <nav
      aria-label="Settings sections"
      className={cn(
        'border-border flex [scrollbar-width:none] gap-1 overflow-x-auto border-b pb-2 [&::-webkit-scrollbar]:hidden',
        'lg:sticky lg:top-0 lg:flex-col lg:gap-3 lg:overflow-visible lg:border-b-0 lg:pb-0'
      )}
    >
      {RAIL_GROUPS.map(({ group }) => {
        const items = sections.filter(
          (section) => SECTION_META[section].group === group
        );
        if (items.length === 0) return null;
        const isGroupActive = items.includes(active);
        const GroupIcon = GROUP_ICONS[group];

        return (
          <section
            key={group}
            className={cn(
              'flex shrink-0 gap-1 lg:flex-col lg:gap-1 lg:rounded-xl lg:border lg:p-2',
              isGroupActive
                ? 'lg:border-primary/25 lg:bg-primary-soft/20'
                : 'lg:border-border lg:bg-card/60'
            )}
          >
            <div className="hidden items-start gap-2 px-1.5 py-1 lg:flex">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                  isGroupActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <GroupIcon className="size-3.5" />
              </span>
              <div className="min-w-0">
                <div
                  className={cn(
                    'text-[11px] leading-4 font-semibold tracking-[0.08em] uppercase',
                    isGroupActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {t(`groups.${group}`)}
                </div>
                <div className="text-muted-foreground line-clamp-2 text-[11px] leading-4">
                  {t(`groupDesc.${group}`)}
                </div>
              </div>
            </div>

            {items.map((section) => {
              const meta = SECTION_META[section];
              const Icon = meta.icon;
              const isActive = section === active;

              return (
                <button
                  key={section}
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() => onSelect(section)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors',
                    'lg:w-full lg:px-2.5',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`sections.${section}`)}
                  </span>
                  {hints?.[section] != null ? (
                    <span
                      className={cn(
                        'hidden shrink-0 items-center gap-1.5 rounded-full px-1.5 text-[10px] lg:inline-flex',
                        isActive
                          ? 'bg-primary-foreground/15 text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {hints[section]}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </section>
        );
      })}
    </nav>
  );
}
