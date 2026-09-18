'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ChevronDown,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  User,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModeToggle } from '@/components/layout/mode-toggle';
import { NewFeatureBadge } from '@/components/layout/new-feature-badge';
import { WorkTimeClock } from '@/components/work-time/work-time-clock';
import {
  bottomNavItems,
  isNavItemActive,
  navItems,
  type NavItem,
} from './navigation';
import { useAuth } from '@/hooks/use-auth';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { cn } from '@/lib/utils';

const pageTitles: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/inbox': 'inbox',
  '/notifications': 'notifications',
  '/tasks': 'tasks',
  '/agenda': 'agenda',
  '/contacts': 'contacts',
  '/finance': 'finance',
  '/benefits': 'benefits',
  '/business-hub/goals': 'financialGoals',
  '/business-hub': 'businessHub',
  '/reports': 'reports',
  '/referrals': 'referrals',
  '/pipelines': 'pipelines',
  '/broadcasts': 'broadcasts',
  '/segments': 'segments',
  '/scheduled-messages': 'scheduledMessages',
  '/social-planner': 'socialPlanner',
  '/portal-campaigns': 'portalCampaigns',
  '/library': 'library',
  '/automations': 'automations',
  '/settings': 'settings',
  '/support': 'support',
  '/help': 'help',
  '/website': 'website',
  '/system-health': 'systemHealth',
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path)
  );
  return match ? match[1] : 'dashboard';
}

const topbarDirectHrefs = ['/dashboard', '/inbox', '/agenda', '/contacts'];

const topbarGroupConfigs = [
  {
    labelKey: 'groupOperation',
    hrefs: ['/notifications', '/tasks'],
  },
  {
    labelKey: 'groupCommercial',
    hrefs: [
      '/pipelines',
      '/finance',
      '/benefits',
      '/business-hub',
      '/business-hub/goals',
      '/reports',
      '/referrals',
    ],
  },
  {
    labelKey: 'groupMarketing',
    hrefs: [
      '/avaliacoes',
      '/broadcasts',
      '/segments',
      '/scheduled-messages',
      '/social-planner',
      '/portal-campaigns',
      '/library',
    ],
  },
  {
    labelKey: 'groupAutomation',
    hrefs: ['/automations', '/flows', '/agents'],
  },
  {
    labelKey: 'groupSystem',
    hrefs: ['/settings', '/support', '/help', '/website', '/system-health'],
  },
] as const;

const headerLabelFallbacks = {
  pt: {
    flows: 'Fluxos',
    aiAgents: 'Agentes de IA',
    businessHub: 'Gestao Zappy',
    financialGoals: 'Metas financeiras',
    socialPlanner: 'Publicações',
    portalCampaigns: 'Campanhas exclusivas',
    reports: 'Relatórios',
    referrals: 'Indicações',
    benefits: 'Packs e vouchers',
    systemHealth: 'Diagnóstico do Sistema',
    groupOperation: 'Operacao',
    groupCommercial: 'Comercial',
    groupMarketing: 'Marketing',
    groupAutomation: 'Automação',
    groupSystem: 'Sistema',
  },
  en: {
    flows: 'Flows',
    aiAgents: 'AI Agents',
    businessHub: 'Zappy Hub',
    financialGoals: 'Financial goals',
    socialPlanner: 'Social planner',
    portalCampaigns: 'Exclusive campaigns',
    reports: 'Reports',
    referrals: 'Referrals',
    benefits: 'Packs and vouchers',
    systemHealth: 'System diagnostics',
    groupOperation: 'Operation',
    groupCommercial: 'Commercial',
    groupMarketing: 'Marketing',
    groupAutomation: 'Automation',
    groupSystem: 'System',
  },
} as const;

interface HeaderProps {
  onOpenSidebar?: () => void;
  navigationLayout?: 'sidebar' | 'topbar';
}

export function Header({
  onOpenSidebar,
  navigationLayout = 'sidebar',
}: HeaderProps) {
  const t = useTranslations('Header');
  const locale = useLocale();
  const labelLocale = locale === 'en' ? 'en' : 'pt';
  const pathname = usePathname();
  const { profile, account, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  const titleKey = getPageTitleKey(pathname);
  const allNavItems = [...navItems, ...bottomNavItems];
  const navItemByHref = new Map(allNavItems.map((item) => [item.href, item]));
  const topbarDirectItems = topbarDirectHrefs
    .map((href) => navItemByHref.get(href))
    .filter((item): item is NavItem => Boolean(item));
  const topbarGroups = topbarGroupConfigs
    .map((group) => ({
      ...group,
      items: group.hrefs
        .map((href) => navItemByHref.get(href))
        .filter((item): item is NavItem => Boolean(item)),
    }))
    .filter((group) => group.items.length > 0);

  function getAttentionLabel(item: NavItem) {
    if (item.href === '/inbox' && totalUnread > 0) {
      return totalUnread > 9 ? '9+' : String(totalUnread);
    }
    if (item.href === '/notifications' && unreadNotifications > 0) {
      return unreadNotifications > 9 ? '9+' : String(unreadNotifications);
    }
    return null;
  }

  function getHeaderLabel(key: string) {
    return (
      headerLabelFallbacks[labelLocale][
        key as keyof (typeof headerLabelFallbacks)['pt']
      ] ?? t(key)
    );
  }

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    'U';

  return (
    <header
      className={cn(
        'border-border bg-background shrink-0 border-b',
        navigationLayout === 'topbar'
          ? 'grid h-[4.5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 shadow-[0_1px_0_hsl(var(--border)),0_8px_24px_-22px_hsl(var(--foreground))] lg:grid-cols-[minmax(0,1fr)_auto] lg:px-5 2xl:grid-cols-[auto_minmax(0,1fr)_auto]'
          : 'flex h-14 items-center justify-between gap-3 px-4 lg:px-6'
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t('openMenu')}
          className={cn(
            'text-muted-foreground hover:bg-muted hover:text-foreground flex size-10 items-center justify-center rounded-xl transition-colors',
            navigationLayout === 'topbar' ? '2xl:hidden' : 'lg:hidden'
          )}
        >
          <Menu className="h-5 w-5" />
        </button>
        {navigationLayout === 'topbar' && (
          <Link
            href="/dashboard"
            className="group hidden min-w-0 items-center gap-3 rounded-xl py-1 pr-3 2xl:flex"
            title={account?.name ?? 'CRM'}
          >
            <Avatar className="size-10 rounded-xl shadow-sm ring-1 ring-black/5 after:rounded-xl">
              {account?.logo_url ? (
                <AvatarImage
                  src={account.logo_url}
                  alt={account.name ?? 'CRM'}
                  className="rounded-xl"
                />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground rounded-xl text-xs font-bold tracking-wide">
                {(account?.name ?? 'CRM').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <span className="text-foreground block max-w-40 truncate text-sm font-semibold tracking-tight">
                {account?.name ?? 'CRM'}
              </span>
              <span className="text-muted-foreground block text-[10px] font-medium tracking-[0.14em] uppercase">
                Workspace
              </span>
            </span>
          </Link>
        )}
        <h1
          className={cn(
            'text-foreground truncate text-base font-semibold sm:text-lg',
            navigationLayout === 'topbar' && '2xl:hidden'
          )}
        >
          {t(titleKey as string)}
        </h1>
      </div>

      {navigationLayout === 'topbar' && (
        <nav className="bg-muted/55 border-border/70 hidden min-w-0 items-center gap-0.5 overflow-visible rounded-2xl border p-1 shadow-inner 2xl:flex 2xl:justify-self-center">
          {topbarDirectItems.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const attentionLabel = getAttentionLabel(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-medium transition-all',
                  active
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5'
                    : 'text-muted-foreground hover:bg-background/65 hover:text-foreground'
                )}
              >
                <item.icon className={cn('size-4', active && 'text-primary')} />
                <span>{t(item.labelKey as string)}</span>
                {attentionLabel && (
                  <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold">
                    {attentionLabel}
                  </span>
                )}
                {item.newBadge && (
                  <NewFeatureBadge badge={item.newBadge} compact />
                )}
              </Link>
            );
          })}

          {topbarGroups.map((group) => {
            const active = group.items.some((item) =>
              isNavItemActive(pathname, item.href)
            );
            const attentionLabel =
              group.items.map(getAttentionLabel).find(Boolean) ?? null;
            const GroupIcon = group.items[0]?.icon;

            return (
              <DropdownMenu key={group.labelKey}>
                <DropdownMenuTrigger
                  className={cn(
                    'data-popup-open:bg-background data-popup-open:text-foreground inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-medium transition-all focus:outline-none',
                    active
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5'
                      : 'text-muted-foreground hover:bg-background/65 hover:text-foreground'
                  )}
                >
                  {GroupIcon ? (
                    <GroupIcon
                      className={cn('size-4', active && 'text-primary')}
                    />
                  ) : null}
                  {getHeaderLabel(group.labelKey)}
                  {attentionLabel && (
                    <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold">
                      {attentionLabel}
                    </span>
                  )}
                  <ChevronDown className="size-3 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={10}
                  className="w-64 rounded-xl p-1.5 shadow-xl"
                >
                  <div className="px-2.5 pt-1.5 pb-2">
                    <p className="text-foreground text-xs font-semibold">
                      {getHeaderLabel(group.labelKey)}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[10px]">
                      Aceda às ferramentas desta área
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  {group.items.map((item) => {
                    const itemActive = isNavItemActive(pathname, item.href);
                    const itemAttentionLabel = getAttentionLabel(item);
                    return (
                      <DropdownMenuItem
                        key={item.href}
                        render={<Link href={item.href} />}
                        className={cn(
                          'h-10 cursor-pointer justify-between gap-2 rounded-lg px-2.5',
                          itemActive && 'bg-primary/10 text-primary'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <item.icon className="size-4" />
                          <span className="truncate">
                            {getHeaderLabel(item.labelKey)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {item.beta && (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[8px] font-semibold text-amber-500 uppercase">
                              Beta
                            </span>
                          )}
                          {item.newBadge && (
                            <NewFeatureBadge badge={item.newBadge} compact />
                          )}
                          {itemAttentionLabel && (
                            <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold">
                              {itemAttentionLabel}
                            </span>
                          )}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </nav>
      )}

      <div
        className={cn(
          'flex shrink-0 items-center gap-1 sm:gap-2',
          navigationLayout === 'topbar' &&
            'border-border/60 bg-background/70 rounded-2xl border p-1 shadow-sm'
        )}
      >
        {/* On tablets the header stays intentionally compact: the avatar
            opens the full account menu, while the clock moves out of the
            way so it cannot compete with navigation. */}
        <div className="hidden 2xl:block">
          <WorkTimeClock />
        </div>
        <ModeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            className="hover:bg-muted/70 focus:bg-muted/70 data-popup-open:bg-muted/70 flex items-center gap-2 rounded-xl p-1 transition-colors focus:outline-none sm:pr-2.5"
            aria-label={t('openAccountMenu')}
          >
            <Avatar className="size-9 ring-1 ring-black/5">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? t('defaultAvatar')}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                'text-foreground hidden max-w-28 truncate text-sm font-medium whitespace-nowrap 2xl:inline'
              )}
            >
              {profile?.full_name ?? t('defaultUser')}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="bg-popover text-popover-foreground ring-border min-w-56"
          >
            <div className="px-2 py-1.5">
              <p className="text-foreground truncate text-sm font-medium">
                {profile?.full_name ?? t('defaultUser')}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {profile?.email ?? ''}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=profile"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <User className="size-4" />
              {t('menuProfile')}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=general"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <SettingsIcon className="size-4" />
              {t('menuSettings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={signOut}
              className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <LogOut className="size-4" />
              {t('menuSignOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
