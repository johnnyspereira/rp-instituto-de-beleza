import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import type { RowDataPacket } from 'mysql2';

import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { mutate, selectRows } from '@/lib/mysql/db';

const COOKIE = 'wacrm_portal_session';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function portalUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await selectRows<(RowDataPacket & { id: string; email: string; user_metadata: string | Record<string, unknown> | null })[]>(
    `SELECT u.id,u.email,u.user_metadata FROM app_sessions s JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() LIMIT 1`, [hash(token)]);
  const row = rows[0];
  if (!row) return null;
  let user_metadata: Record<string, unknown> = {};
  if (typeof row.user_metadata === 'string') { try { user_metadata = JSON.parse(row.user_metadata); } catch { user_metadata = {}; } }
  else if (row.user_metadata) user_metadata = row.user_metadata;
  return { id: row.id, email: row.email, user_metadata };
}

async function establish(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  await mutate('INSERT INTO app_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)', [randomUUID(), userId, hash(token), expires]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires });
}

export async function createPortalAuthClient() {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      const { executePortalRpc } = await import('@/lib/mysql/portal-rpc');
      return executePortalRpc(name, args, await portalUser());
    },
    auth: {
      async getUser() { return { data: { user: await portalUser() }, error: null }; },
      async signInWithPassword(input: { email: string; password: string }) {
        const rows = await selectRows<(RowDataPacket & { id: string; email: string; password_hash: string })[]>('SELECT id,email,password_hash FROM app_users WHERE email=? LIMIT 1', [input.email.toLowerCase()]);
        const row = rows[0];
        if (!row || !(await verifyPassword(input.password, row.password_hash))) return { data: { user: null }, error: { message: 'Invalid credentials.' } };
        await establish(row.id); return { data: { user: { id: row.id, email: row.email } }, error: null };
      },
      async verifyOtp(input: { token_hash: string; type: string }) {
        const rows = await selectRows<(RowDataPacket & { id: string; user_id: string })[]>(`SELECT id,user_id FROM app_one_time_tokens WHERE token_hash=? AND purpose=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() LIMIT 1`, [hash(input.token_hash), input.type]);
        const row = rows[0];
        if (!row) return { data: { user: null }, error: { message: 'Invalid or expired token.' } };
        await mutate('UPDATE app_one_time_tokens SET consumed_at=UTC_TIMESTAMP(3) WHERE id=?', [row.id]); await establish(row.user_id);
        return { data: { user: await portalUser() }, error: null };
      },
      async updateUser(input: { password?: string }) {
        const user = await portalUser(); if (!user) return { data: { user: null }, error: { message: 'Unauthorized.' } };
        if (input.password) await mutate('UPDATE app_users SET password_hash=? WHERE id=?', [await hashPassword(input.password), user.id]);
        return { data: { user }, error: null };
      },
      async signOut() { const store = await cookies(); const token = store.get(COOKIE)?.value; if (token) await mutate('DELETE FROM app_sessions WHERE token_hash=?', [hash(token)]); store.delete(COOKIE); return { error: null }; },
    },
  };
}
