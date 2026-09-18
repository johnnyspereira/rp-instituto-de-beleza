export const PRIVACY_NOTICE_FALLBACK_VERSION = '1.0';

export async function requestConsentEvidence(request: Request) {
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(ip)
  );
  const ipHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return {
    ip_hash: ipHash,
    user_agent: (request.headers.get('user-agent') || 'unknown').slice(0, 500),
    language: (request.headers.get('accept-language') || '').slice(0, 120),
    captured_at: new Date().toISOString(),
  };
}

export async function privacyNoticeVersion(
  db: SupabaseClient,
  accountId: string
) {
  const { data } = await db
    .from('privacy_settings')
    .select('privacy_notice_version')
    .eq('account_id', accountId)
    .maybeSingle();
  return data?.privacy_notice_version || PRIVACY_NOTICE_FALLBACK_VERSION;
}
import type { SupabaseClient } from '@supabase/supabase-js';
