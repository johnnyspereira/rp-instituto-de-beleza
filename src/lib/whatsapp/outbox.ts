import 'server-only';

import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { transaction } from '@/lib/mysql/db';

export type WhatsAppOutboxPayload = {
  contentType: string;
  text?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  interactivePayload?: unknown;
  replyToMessageId?: string | null;
  senderType?: 'agent' | 'bot';
};

export async function enqueueWhatsAppMessage(input: {
  accountId: string;
  userId: string;
  conversationId: string;
  requestKey: string;
  payload: WhatsAppOutboxPayload;
}) {
  return transaction(async (connection) => {
    const [existing] = await connection.execute<
      (RowDataPacket & { message_id: string; status: string })[]
    >(
      `SELECT message_id,status FROM whatsapp_outbox
       WHERE account_id=? AND request_key=? LIMIT 1 FOR UPDATE`,
      [input.accountId, input.requestKey]
    );
    if (existing[0]) {
      return {
        messageId: existing[0].message_id,
        status: existing[0].status,
        duplicate: true,
      };
    }

    const [conversation] = await connection.execute<
      (RowDataPacket & { phone: string })[]
    >(
      `SELECT c.phone FROM conversations v
       JOIN contacts c ON c.id=v.contact_id
       WHERE v.id=? AND v.account_id=? LIMIT 1 FOR UPDATE`,
      [input.conversationId, input.accountId]
    );
    if (!conversation[0]?.phone)
      throw new Error('Conversation phone not found.');

    const messageId = randomUUID();
    const outboxId = randomUUID();
    const contentType = input.payload.contentType;
    const preview = input.payload.text || `[${contentType}]`;
    await connection.execute<ResultSetHeader>(
      `INSERT INTO messages(
        id,conversation_id,sender_type,sender_id,content_type,content_text,
        media_url,template_name,status,reply_to_message_id,interactive_payload
      ) VALUES(?,?,?,?,?,?,?,?, 'sending',?,?)`,
      [
        messageId,
        input.conversationId,
        input.payload.senderType ?? 'agent',
        input.userId,
        contentType,
        input.payload.text || null,
        input.payload.mediaUrl || null,
        input.payload.templateName || null,
        input.payload.replyToMessageId || null,
        input.payload.interactivePayload
          ? JSON.stringify(input.payload.interactivePayload)
          : null,
      ]
    );
    await connection.execute<ResultSetHeader>(
      `INSERT INTO whatsapp_outbox(
        id,account_id,conversation_id,user_id,message_id,request_key,phone,payload
      ) VALUES(?,?,?,?,?,?,?,?)`,
      [
        outboxId,
        input.accountId,
        input.conversationId,
        input.userId,
        messageId,
        input.requestKey,
        conversation[0].phone,
        JSON.stringify(input.payload),
      ]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE conversations SET last_message_text=?,last_message_at=UTC_TIMESTAMP(3),
       updated_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?`,
      [preview, input.conversationId, input.accountId]
    );
    return { messageId, status: 'pending', duplicate: false };
  });
}
