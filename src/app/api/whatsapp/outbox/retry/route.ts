import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { mutate, selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';

/**
 * Requeue one failed Inbox message.  The browser never talks to the WhatsApp
 * worker directly: the durable outbox remains the single delivery path.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const body = (await request.json()) as { message_id?: unknown };
    const messageId = String(body.message_id ?? '').trim();
    if (!messageId) {
      return NextResponse.json({ error: 'message_id is required.' }, { status: 400 });
    }

    const rows = await selectRows<
      (RowDataPacket & { id: string; status: string })[]
    >(
      `SELECT o.id,o.status FROM whatsapp_outbox o
       JOIN messages m ON m.id=o.message_id
       WHERE o.message_id=? AND o.account_id=?
         AND m.sender_type IN ('agent','bot')
       LIMIT 1`,
      [messageId, ctx.accountId]
    );
    const job = rows[0];
    if (!job) {
      return NextResponse.json({ error: 'Mensagem de envio não encontrada.' }, { status: 404 });
    }
    if (!['failed', 'dead'].includes(job.status)) {
      return NextResponse.json(
        { error: 'Esta mensagem não está disponível para reenvio.' },
        { status: 409 }
      );
    }

    await mutate(
      `UPDATE whatsapp_outbox
       SET status='pending',attempts=0,available_at=UTC_TIMESTAMP(3),
           lease_until=NULL,last_error=NULL,worker_id=NULL,updated_at=UTC_TIMESTAMP(3)
       WHERE id=? AND account_id=?`,
      [job.id, ctx.accountId]
    );
    await mutate(
      "UPDATE messages SET status='sending' WHERE id=?",
      [messageId]
    );

    return NextResponse.json({ success: true, queue_status: 'pending' });
  } catch (error) {
    return toErrorResponse(error);
  }
}
