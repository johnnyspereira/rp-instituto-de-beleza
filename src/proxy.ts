import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'wacrm_session';
const workerCallbackPaths = [
  '/api/whatsapp/bridge',
  '/api/whatsapp/bridge-v2',
];

const protectedPaths = [
  '/dashboard',
  '/inbox',
  '/contacts',
  '/pipelines',
  '/finance',
  '/business-hub',
  '/reports',
  '/referrals',
  '/broadcasts',
  '/social-planner',
  '/automations',
  '/settings',
  '/website',
];

export function proxy(request: NextRequest) {
  // This is intentionally an optimistic check. Every data access and mutation
  // must still validate the session against MySQL at the point of use.
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const pathname = request.nextUrl.pathname;

  if (
    hasSessionCookie &&
    (pathname === '/login' ||
      pathname === '/signup' ||
      pathname === '/forgot-password')
  ) {
    const url = request.nextUrl.clone();
    const inviteToken = request.nextUrl.searchParams.get('invite');
    if (inviteToken && (pathname === '/login' || pathname === '/signup')) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`;
    } else {
      url.pathname = '/dashboard';
    }
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (
    !hasSessionCookie &&
    protectedPaths.some((path) => pathname.startsWith(path))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (
    !hasSessionCookie &&
    pathname.startsWith('/api/whatsapp/') &&
    !pathname.includes('/webhook') &&
    !workerCallbackPaths.includes(pathname)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
