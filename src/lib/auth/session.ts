import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import type { RowDataPacket } from 'mysql2';

import { mutate, selectRows } from '@/lib/mysql/db';

export const SESSION_COOKIE = 'wacrm_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionRow extends RowDataPacket {
  session_id: string;
  user_id: string;
  email: string;
  expires_at: Date;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await mutate(
    `INSERT INTO app_sessions (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [randomUUID(), userId, hashToken(token), expiresAt]
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await selectRows<SessionRow[]>(
    `SELECT s.id AS session_id, s.user_id, u.email, s.expires_at
       FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()
      LIMIT 1`,
    [hashToken(token)]
  );

  const session = rows[0];
  if (!session) return null;

  return {
    sessionId: session.session_id,
    user: { id: session.user_id, email: session.email },
    expiresAt: session.expires_at,
  };
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await mutate('DELETE FROM app_sessions WHERE token_hash = ?', [
      hashToken(token),
    ]);
  }

  cookieStore.delete(SESSION_COOKIE);
}
