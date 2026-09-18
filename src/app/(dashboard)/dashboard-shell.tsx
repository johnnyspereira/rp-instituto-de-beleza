'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { PresenceHeartbeat } from '@/components/presence/presence-heartbeat';
import { InboxFloatingAlerts } from '@/components/inbox/inbox-floating-alerts';
import { NotificationRealtimeAlerts } from '@/components/notifications/notification-realtime-alerts';
import { PushNotifications } from '@/components/notifications/push-notifications';
import { WorkTimeProvider } from '@/components/work-time/work-time-provider';
import { DocumentTitle } from '@/components/layout/document-title';
import { ContextualHelp } from '@/components/support/contextual-help';
import { MobileAppNavigation } from '@/components/layout/mobile-app-navigation';

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, account } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const navigationLayout = account?.navigation_layout ?? 'sidebar';
  // Inbox is intentionally a focused workspace, not another dashboard
  // panel. It keeps the authentication/providers from this shell while
  // removing the global navigation chrome.
  // `usePathname` can transiently return null while a client navigation is
  // hydrating. Treat that state as the normal dashboard shell instead of
  // allowing a string call to take down every authenticated route.
  const isInboxWorkspace = pathname?.startsWith('/inbox') ?? false;

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="bg-background flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <WorkTimeProvider>
      <DocumentTitle />
      <div className="bg-background flex h-screen overflow-hidden">
        {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
        <PresenceHeartbeat />
        <InboxFloatingAlerts />
        <NotificationRealtimeAlerts />
        <PushNotifications />
        <ContextualHelp />
        {!isInboxWorkspace && (
          <>
            <Link
              href="/finance?tab=pos"
              aria-label="Abrir ponto de venda"
              title="Abrir POS"
              className="bg-primary text-primary-foreground hover:bg-primary-hover fixed right-5 bottom-24 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 sm:right-5 sm:bottom-5"
            >
              <ShoppingCart className="size-5" />
              <span className="sr-only">Abrir POS</span>
            </Link>
            <div
              className={
                navigationLayout === 'topbar' ? '2xl:hidden' : 'contents'
              }
            >
              <Sidebar
                open={sidebarOpen}
                onClose={closeSidebar}
                drawerOnly={navigationLayout === 'topbar'}
              />
            </div>
            <MobileAppNavigation onOpenMenu={() => setSidebarOpen(true)} />
          </>
        )}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!isInboxWorkspace && (
            <Header
              onOpenSidebar={() => setSidebarOpen(true)}
              navigationLayout={navigationLayout}
            />
          )}
          <main
            className={
              isInboxWorkspace
                ? 'flex-1 overflow-hidden'
                : 'flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28'
            }
          >
            {children}
          </main>
        </div>
      </div>
    </WorkTimeProvider>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
