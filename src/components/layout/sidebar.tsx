'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import {
  Bell,
  BadgeEuro,
  BarChart3,
  Bot,
  CircleHelp,
  Globe2,
  CalendarDays,
  Clapperboard,
  Crown,
  GitBranch,
  HeartHandshake,
  ListFilter,
  LibraryBig,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PackageCheck,
  Megaphone,
  LifeBuoy,
  Radio,
  Send,
  Settings,
  Shield,
  Sparkles,
  SquareCheckBig,
  Star,
  Target,
  User,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import type { AccountRole } from '@/lib/auth/roles';
import { NewFeatureBadge } from '@/components/layout/new-feature-badge';

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: {
    icon: Crown,
    labelKey: 'roleOwner',
    // Amber: scarce, immutable, "the boss" — gets visual emphasis.
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  admin: {
    icon: Shield,
    labelKey: 'roleAdmin',
    // Primary-tinted: significant but not as scarce as owner.
    className: 'border-primary/40 bg-primary/10 text-primary',
  },
  agent: {
    icon: UserCog,
    labelKey: 'roleAgent',
    // Neutral slate: the operational default.
    className: 'border-border bg-muted text-foreground',
  },
  viewer: {
    icon: User,
    labelKey: 'roleViewer',
    // Muted slate: read-only role; visually quieter than agent.
    className: 'border-border bg-card text-muted-foreground',
  },
};
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
  newBadge?: {
    key: string;
    label?: string;
    className?: string;
  };
}

const TODAY_NEW_BADGE = {
  label: 'NOVO',
  className:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.16)]',
};

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    labelKey: 'dashboard',
    icon: LayoutDashboard,
    newBadge: { key: 'dashboard-followups', ...TODAY_NEW_BADGE },
  },
  { href: '/inbox', labelKey: 'inbox', icon: MessageSquare },
  { href: '/notifications', labelKey: 'notifications', icon: Bell },
  {
    href: '/tasks',
    labelKey: 'tasks',
    icon: SquareCheckBig,
    newBadge: { key: 'client-tasks', ...TODAY_NEW_BADGE },
  },
  { href: '/agenda', labelKey: 'agenda', icon: CalendarDays },
  { href: '/avaliacoes', labelKey: 'reviews', icon: Star },
  {
    href: '/contacts',
    labelKey: 'contacts',
    icon: Users,
    newBadge: { key: 'contacts-import-export', ...TODAY_NEW_BADGE },
  },
  { href: '/pipelines', labelKey: 'pipelines', icon: GitBranch },
  {
    href: '/finance',
    labelKey: 'finance',
    icon: BadgeEuro,
    newBadge: { key: 'retroactive-cash', ...TODAY_NEW_BADGE },
  },
  {
    href: '/benefits',
    labelKey: 'benefits',
    icon: PackageCheck,
    newBadge: { key: 'benefits-report', ...TODAY_NEW_BADGE },
  },
  {
    href: '/business-hub',
    labelKey: 'businessHub',
    icon: Sparkles,
    newBadge: { key: 'zappy-gap-hub', ...TODAY_NEW_BADGE },
  },
  {
    href: '/business-hub/goals',
    labelKey: 'financialGoals',
    icon: Target,
    newBadge: { key: 'financial-goals', ...TODAY_NEW_BADGE },
  },
  { href: '/reports', labelKey: 'reports', icon: BarChart3 },
  { href: '/referrals', labelKey: 'referrals', icon: HeartHandshake },
  {
    href: '/broadcasts',
    labelKey: 'broadcasts',
    icon: Radio,
    newBadge: { key: 'saved-audience-segments', ...TODAY_NEW_BADGE },
  },
  {
    href: '/segments',
    labelKey: 'segments',
    icon: ListFilter,
    newBadge: { key: 'segments-page', ...TODAY_NEW_BADGE },
  },
  {
    href: '/scheduled-messages',
    labelKey: 'scheduledMessages',
    icon: Send,
    newBadge: { key: 'scheduled-whatsapp', ...TODAY_NEW_BADGE },
  },
  {
    href: '/social-planner',
    labelKey: 'socialPlanner',
    icon: Clapperboard,
    newBadge: { key: 'social-planner', ...TODAY_NEW_BADGE },
  },
  {
    href: '/portal-campaigns',
    labelKey: 'portalCampaigns',
    icon: Megaphone,
    newBadge: { key: 'portal-campaigns', ...TODAY_NEW_BADGE },
  },
  {
    href: '/library',
    labelKey: 'library',
    icon: LibraryBig,
    newBadge: { key: 'message-library', ...TODAY_NEW_BADGE },
  },
  { href: '/automations', labelKey: 'automations', icon: Zap },
  { href: '/flows', labelKey: 'flows', icon: Workflow, beta: true },
  { href: '/agents', labelKey: 'aiAgents', icon: Bot },
  { href: '/support', labelKey: 'support', icon: LifeBuoy },
  { href: '/website', labelKey: 'website', icon: Globe2 },
];

const bottomNavItems = [
  { href: '/help', labelKey: 'help', icon: CircleHelp },
  { href: '/settings', labelKey: 'settings', icon: Settings },
];

const navSections = [
  {
    labelKey: 'groupOperation',
    hrefs: [
      '/dashboard',
      '/notifications',
      '/agenda',
      '/avaliacoes',
      '/tasks',
    ],
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
] as const;

interface SidebarProps {
  /** Controlled by the Header's hamburger button when rendered as a drawer. */
  open?: boolean;
  onClose?: () => void;
  /** Topbar navigation uses this drawer until the horizontal menu fits. */
  drawerOnly?: boolean;
}

import { useTranslations } from 'next-intl';

export function Sidebar({ open = false, onClose, drawerOnly = false }: SidebarProps) {
  const t = useTranslations('Sidebar');
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  const navItemByHref = new Map(navItems.map((item) => [item.href, item]));
  const workspaceItems = ['/inbox', '/contacts']
    .map((href) => navItemByHref.get(href))
    .filter((item): item is NavItem => Boolean(item));
  const systemItems = [
    ...['/support', '/website', '/system-health']
      .map((href) => navItemByHref.get(href))
      .filter((item): item is NavItem => Boolean(item)),
    ...bottomNavItems,
  ];
  // Only surface the account-name strip when it actually carries
  // information. A solo user's personal account is named after them
  // (the 017 signup trigger seeds it from `full_name`), so showing it
  // here would just duplicate the user name in the footer below. Once
  // the account is renamed or the user joins a shared account, the
  // name diverges and the strip becomes meaningful — that's the signal
  // we gate on. Wait for the profile fetch to settle first, otherwise
  // the strip flashes in once the row resolves (a layout jump).
  const showAccountStrip =
    !profileLoading && !!account?.name && account.name !== profile?.full_name;
  const drawerBreakpoint = drawerOnly ? '2xl' : 'lg';

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label={t('closeMenu')}
        onClick={onClose}
        className={cn(
          cn(
            'bg-background/70 fixed inset-0 z-30 backdrop-blur-sm transition-opacity',
            drawerBreakpoint === '2xl' ? '2xl:hidden' : 'lg:hidden'
          ),
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left.
          'border-border bg-card fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r',
          'transition-transform duration-200 ease-out will-change-transform',
          open ? 'translate-x-0' : '-translate-x-full',
          // Desktop: static, always visible — reset all the mobile framing.
          drawerBreakpoint === '2xl'
            ? '2xl:static 2xl:z-0 2xl:w-60 2xl:translate-x-0 2xl:transition-none'
            : 'lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:transition-none'
        )}
        aria-label="Primary"
      >
        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div className="border-border flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Avatar className="size-8 rounded-lg after:rounded-lg">
              {account?.logo_url ? (
                <AvatarImage
                  src={account.logo_url}
                  alt={account.name ?? t('title')}
                  className="rounded-lg"
                />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground rounded-lg">
                <MessageSquare className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <span className="text-foreground text-sm font-semibold">
              {account?.name ?? t('title')}
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeMenu')}
            className={cn(
              'text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md',
              drawerBreakpoint === '2xl' ? '2xl:hidden' : 'lg:hidden'
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-4">
            {/* Inbox is a dedicated workspace, deliberately kept above the
                operational submenu so it is always one direct click away. */}
            <ul className="flex flex-col gap-1">
              {workspaceItems.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const showUnreadDot = totalUnread > 0 && !isActive;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors lg:py-2.5',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                          : 'bg-primary/10 text-primary hover:bg-primary/15'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{t(item.labelKey)}</span>
                      {showUnreadDot && (
                        <span className="bg-primary-foreground/90 relative flex h-2 w-2 rounded-full" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {navSections.map((section) => {
              const items = section.hrefs
                .map((href) => navItemByHref.get(href))
                .filter((item): item is NavItem => Boolean(item));
              if (items.length === 0) return null;

              return (
                <div key={section.labelKey} className="space-y-1.5">
                  <p className="text-muted-foreground/70 px-3 text-[10px] font-bold tracking-[0.18em] uppercase">
                    {t(section.labelKey)}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {items.map((item) => {
                      const isActive =
                        pathname === item.href ||
                        (item.href !== '/dashboard' &&
                          pathname.startsWith(item.href));

                      const showUnreadDot =
                        item.href === '/inbox' && totalUnread > 0 && !isActive;

                      // Unlike the inbox dot, the notifications count stays visible
                      // even while the page is active — it reflects unread state
                      // (cleared by marking notifications read), not "currently
                      // viewing this section".
                      const showNotificationBadge =
                        item.href === '/notifications' &&
                        unreadNotifications > 0;

                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={cn(
                              // Taller on mobile so fingers can hit the row reliably (≥44px).
                              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2',
                              isActive
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            <item.icon className="h-4 w-4" />
                            <span className="flex-1">
                              {t(item.labelKey as string)}
                            </span>
                            {item.beta && (
                              <span
                                aria-label={t('beta')}
                                className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-amber-300 uppercase"
                              >
                                {t('beta')}
                              </span>
                            )}
                            {item.newBadge && (
                              <NewFeatureBadge badge={item.newBadge} />
                            )}
                            {showUnreadDot && (
                              <span
                                aria-label={t('unreadConversations', {
                                  count: totalUnread,
                                })}
                                className="relative flex h-2 w-2"
                              >
                                <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                                <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
                              </span>
                            )}
                            {showNotificationBadge && (
                              <span
                                aria-label={t('unreadNotifications', {
                                  count: unreadNotifications,
                                })}
                                className="bg-primary text-primary-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                              >
                                {unreadNotifications > 9
                                  ? '9+'
                                  : unreadNotifications}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}

            <div className="border-border border-t pt-4">
              <p className="text-muted-foreground/70 px-3 text-[10px] font-bold tracking-[0.18em] uppercase">
                {t('groupSystem')}
              </p>

              <ul className="mt-1.5 flex flex-col gap-1">
                {systemItems.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {t(item.labelKey as string)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </nav>

        {/* User section */}
        <div className="border-border shrink-0 border-t p-3">
          {/* Account name display — surfaced only when the account
              name differs from the user's own name (see
              `showAccountStrip`). For a default solo account the two
              match, so we hide it to avoid duplicating the user name
              below; for renamed or shared accounts it tells the user
              which account they're acting in. */}
          {showAccountStrip && account?.name ? (
            <div className="text-muted-foreground mb-2 flex items-center gap-2 px-3 text-xs">
              <UsersRound className="size-3.5 shrink-0" />
              {/* `title=` exposes the full name on hover when it
                  gets truncated (long account names + narrow
                  sidebars). Cheap a11y win. */}
              <span className="truncate" title={account.name}>
                {account.name}
              </span>
              {accountRole
                ? // Always render the chip — owners used to be
                  // invisible here, which made them indistinguishable
                  // from admins at a glance. Now everyone sees their
                  // role (with a colour cue) regardless of tier.
                  (() => {
                    const meta = ROLE_CHIP[accountRole];
                    const Icon = meta.icon;
                    return (
                      <span
                        className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase ${meta.className}`}
                      >
                        <Icon className="size-3" />
                        {t(meta.labelKey as string)}
                      </span>
                    );
                  })()
                : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger className="hover:bg-muted/60 focus:bg-muted/60 data-popup-open:bg-muted/60 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus:outline-none">
              <Avatar className="size-8 shrink-0">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? t('defaultAvatar')}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    'U'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-medium">
                  {profile?.full_name ?? t('defaultUser')}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {profile?.email ?? ''}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="bg-popover text-popover-foreground ring-border min-w-56"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=profile"
                    onClick={onClose}
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
                    href="/settings?tab=whatsapp"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <Settings className="size-4" />
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
      </aside>
    </>
  );
}
