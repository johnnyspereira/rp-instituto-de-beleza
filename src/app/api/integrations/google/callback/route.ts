import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';
import { encrypt } from '@/lib/whatsapp/encryption';
import { mutate } from '@/lib/mysql/db';

export async function GET(request: Request) {
  const url = new URL(request.url); const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://rp-instituto.example';
  const state = url.searchParams.get('state'); const code = url.searchParams.get('code');
  const expected = (await cookies()).get('google_business_oauth_state')?.value;
  const session = await getSession(); const auth = session ? await getAuthContext(session.user.id) : null;
  if (!state || state !== expected) return NextResponse.redirect(new URL('/website?google=failed&reason=state', origin));
  if (!code || !auth || auth.profile.account_role !== 'owner') return NextResponse.redirect(new URL('/website?google=failed&reason=session', origin));
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim(); const secret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim();
  if (!clientId || !secret) return NextResponse.redirect(new URL('/website?google=missing-config', origin));
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: secret, redirect_uri: `${origin}/api/integrations/google/callback`, grant_type: 'authorization_code' }) });
    const token = await tokenResponse.json() as { refresh_token?: string };
    if (!tokenResponse.ok || !token.refresh_token) throw new Error('token');
    await mutate(`INSERT INTO google_business_profile_connections(account_id,refresh_token_encrypted,connected_by_user_id) VALUES(?,?,?) ON DUPLICATE KEY UPDATE refresh_token_encrypted=VALUES(refresh_token_encrypted),connected_by_user_id=VALUES(connected_by_user_id),connected_at=UTC_TIMESTAMP(3)`, [auth.account.id, encrypt(token.refresh_token), auth.user.id]);
    const response = NextResponse.redirect(new URL('/website?google=connected', origin)); response.cookies.delete('google_business_oauth_state'); return response;
  } catch (error) {
    console.error('[google-oauth-callback]', error);
    const message = error instanceof Error ? error.message : '';
    const reason = message === 'token'
      ? 'token'
      : /ENCRYPTION_KEY|invalid key length/i.test(message)
        ? 'encryption'
        : 'storage';
    return NextResponse.redirect(new URL(`/website?google=failed&reason=${reason}`, origin));
  }
}
