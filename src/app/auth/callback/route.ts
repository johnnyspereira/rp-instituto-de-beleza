import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { createSession } from '@/lib/auth/session';
import { mutate, selectRows } from '@/lib/mysql/db';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next') || '/dashboard';
  const next = rawNext.startsWith('/') ? rawNext : '/dashboard';

  if (!code) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'missing_auth_code');
    return NextResponse.redirect(loginUrl);
  }

  const rows = await selectRows<(RowDataPacket & { id: string; user_id: string })[]>(
    `SELECT id,user_id FROM app_one_time_tokens WHERE token_hash=? AND purpose='recovery' AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() LIMIT 1`,
    [createHash('sha256').update(code).digest('hex')]
  );
  if (!rows[0]) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'auth_callback_failed');
    return NextResponse.redirect(loginUrl);
  }
  await mutate('UPDATE app_one_time_tokens SET consumed_at=UTC_TIMESTAMP(3) WHERE id=?', [rows[0].id]);
  await createSession(rows[0].user_id);

  return NextResponse.redirect(new URL(next, request.url));
}
