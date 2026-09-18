'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';

import { navItems, isNavItemActive, type NavItem } from '@/components/layout/navigation';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { cn } from '@/lib/utils';

const MOBILE_PRIMARY_HREFS = [
  '/dashboard',
  '/inbox',
  '/agenda',
  '/finance',
] as const;

/**
 * Touch-first CRM navigation. Desktop navigation stays untouched; on phones
 * this makes the common workspaces available in one thumb reach and leaves
 * the full drawer for the rest of the tools.
 */
export function MobileAppNavigation({
  onOpenMenu,
}: {
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations('Sidebar');
  const unreadInbox = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  const primaryItems = MOBILE_PRIMARY_HREFS.map((href) =>
    navItems.find((item) => item.href === href)
  ).filter((item): item is NavItem => Boolean(item));

  function counterFor(item: NavItem) {
    if (item.href === '/inbox' && unreadInbox > 0) return unreadInbox;
    if (item.href === '/notifications' && unreadNotifications > 0)
      return unreadNotifications;
    return 0;
  }

  return (
    <nav
      aria-label="Navegação principal"
      className="border-border/80 bg-background/95 fixed inset-x-0 bottom-0 z-50 border-t px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-10px_28px_-20px_hsl(var(--foreground)/0.45)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {primaryItems.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const counter = counterFor(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium transition-colors',
                active
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground active:bg-muted'
              )}
            >
              <span className="relative">
                <item.icon className="size-5" />
                {counter > 0 ? (
                  <span className="bg-primary text-primary-foreground absolute -top-2 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold">
                    {counter > 9 ? '9+' : counter}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="text-muted-foreground active:bg-muted flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium"
          aria-label="Abrir todas as áreas"
        >
          <Menu className="size-5" />
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
}
