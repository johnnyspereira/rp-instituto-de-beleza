import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { sendLocalEmail } from '@/lib/email/smtp';
import { passwordResetEmail } from '@/lib/email/templates';
import { mutate, selectRows } from '@/lib/mysql/db';
import { getPublicUrl } from '@/lib/public-url';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email) return Response.json({ data: {}, error: null });

  const rows = await selectRows<(RowDataPacket & { id: string })[]>(
    'SELECT id FROM app_users WHERE email=? LIMIT 1',
    [email]
  );
  if (rows[0]) {
    const token = randomBytes(32).toString('base64url');
    await mutate(
      `INSERT INTO app_one_time_tokens(id,user_id,token_hash,purpose,expires_at)
       VALUES(?,?,?,'recovery',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE))`,
      [
        randomUUID(),
        rows[0].id,
        createHash('sha256').update(token).digest('hex'),
      ]
    );
    const url = new URL(
      getPublicUrl('/auth/callback', new URL(request.url).origin)
    );
    url.searchParams.set('code', token);
    url.searchParams.set('next', '/reset-password');
    try {
      await sendLocalEmail({
        to: email,
        profile: 'general',
        ...passwordResetEmail({ resetUrl: url.toString() }),
      });
    } catch (cause) {
      console.error('[password-reset-email]', cause);
    }
  }
  return Response.json({ data: {}, error: null });
}
