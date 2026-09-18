'use client';

import Link from 'next/link';
import {
  UserPlus,
  Briefcase,
  Radio,
  Zap,
  CalendarPlus,
  ShoppingCart,
} from 'lucide-react';
import type { ComponentType } from 'react';

import { useTranslations } from 'next-intl';

// Quick-action shortcuts. Each navigates to the page that owns the
// relevant "create" flow. We deliberately don't try to auto-open any
// modal on the target page — that'd require touching those pages,
// which is out of scope here.
interface Action {
  labelKey: string;
  label?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tint: string;
}

const ACTIONS: Action[] = [
  {
    labelKey: 'appointment',
    label: 'Nova marcação',
    href: '/agenda?new=1',
    icon: CalendarPlus,
    tint: 'text-emerald-500',
  },
  {
    labelKey: 'sale',
    label: 'Nova venda',
    href: '/finance',
    icon: ShoppingCart,
    tint: 'text-sky-500',
  },
  {
    labelKey: 'newContact',
    href: '/contacts',
    icon: UserPlus,
    tint: 'text-primary',
  },
  {
    labelKey: 'newDeal',
    href: '/pipelines',
    icon: Briefcase,
    tint: 'text-blue-400',
  },
  {
    labelKey: 'newBroadcast',
    href: '/broadcasts/new',
    icon: Radio,
    tint: 'text-amber-400',
  },
  {
    labelKey: 'newAutomation',
    href: '/automations/new',
    icon: Zap,
    tint: 'text-primary',
  },
];

export function QuickActions() {
  const t = useTranslations('Dashboard.quickActions');

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.href}
            href={a.href}
            className="group border-border bg-card hover:border-border hover:bg-muted/60 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
          >
            <div
              className={`bg-muted flex h-9 w-9 items-center justify-center rounded-lg ${a.tint}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-foreground text-sm font-medium">
              {a.label ?? t(a.labelKey as string)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
