import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';

const STATE_COOKIE = 'google_business_oauth_state';

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim();
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://rp-instituto.example';
  if (!clientId) return NextResponse.redirect(new URL('/website?google=missing-config', origin));
  const session = await getSession();
  const auth = session ? await getAuthContext(session.user.id) : null;
  if (!auth || auth.profile.account_role !== 'owner') return NextResponse.redirect(new URL('/login', origin));
  const state = randomBytes(32).toString('base64url');
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${origin}/api/integrations/google/callback`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'https://www.googleapis.com/auth/business.manage');
  authorize.searchParams.set('access_type', 'offline');
  authorize.searchParams.set('prompt', 'consent');
  authorize.searchParams.set('state', state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}
