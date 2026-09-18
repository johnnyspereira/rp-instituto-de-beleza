import 'server-only';

import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { mutate, selectRows, transaction } from '@/lib/mysql/db';
import { sendPush, type StoredPushSubscription } from '@/lib/push/server';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

type Recipient = RowDataPacket & {
  user_id: string;
  full_name: string;
  account_role: 'owner' | 'admin';
  professional_phone: string | null;
};

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  // A clinic often stores Portuguese mobile numbers locally (9 digits).
  // WhatsApp requires an international E.164 number, so make the safe,
  // unambiguous Portuguese conversion before adding the plus sign.
  if (/^9\d{8}$/.test(digits)) return `+351${digits}`;
  return digits ? `+${digits}` : '';
}

async function ownerConversation(input: {
  accountId: string;
  owner: Recipient;
  phone: string;
}) {
  return transaction(async (connection) => {
    const digits = input.phone.replace(/\D/g, '');
    const [contacts] = await connection.execute<
      (RowDataPacket & { id: string })[]
    >(
      `SELECT id FROM contacts
       WHERE account_id=? AND (phone_normalized=? OR phone=?)
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [input.accountId, digits, input.phone]
    );
    let contactId = contacts[0]?.id;
    if (!contactId) {
      contactId = randomUUID();
      await connection.execute<ResultSetHeader>(
        `INSERT INTO contacts(
          id,account_id,user_id,phone,phone_normalized,name,source,
          preferred_contact,whatsapp_consent
        ) VALUES(?,?,?,?,?,?,'system_owner_alerts','whatsapp',TRUE)`,
        [
          contactId,
          input.accountId,
          input.owner.user_id,
          input.phone,
          digits,
          input.owner.full_name || 'Proprietário',
        ]
      );
    }
    const [conversations] = await connection.execute<
      (RowDataPacket & { id: string })[]
    >(
      'SELECT id FROM conversations WHERE account_id=? AND contact_id=? LIMIT 1 FOR UPDATE',
      [input.accountId, contactId]
    );
    let conversationId = conversations[0]?.id;
    if (!conversationId) {
      conversationId = randomUUID();
      await connection.execute<ResultSetHeader>(
        `INSERT INTO conversations(id,account_id,user_id,contact_id,status)
         VALUES(?,?,?,?,'open')`,
        [conversationId, input.accountId, input.owner.user_id, contactId]
      );
    }
    return conversationId;
  });
}

export async function notifyAccountEvent(input: {
  accountId: string;
  type: string;
  category:
    | 'inbox'
    | 'sales'
    | 'finance'
    | 'clinic'
    | 'clients'
    | 'automation'
    | 'system'
    | 'broadcast'
    | 'work_time'
    | 'support';
  priority?: 'low' | 'normal' | 'high' | 'critical';
  title: string;
  body: string;
  actionUrl: string;
  contactId?: string | null;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
  whatsappText?: string;
}) {
  const recipients = await selectRows<Recipient[]>(
    `SELECT user_id,full_name,account_role,professional_phone
     FROM profiles WHERE account_id=? AND account_role IN ('owner','admin')
     ORDER BY CASE account_role WHEN 'owner' THEN 0 ELSE 1 END,created_at ASC`,
    [input.accountId]
  );
  if (!recipients.length)
    return { internal: 0, push: 0, whatsapp: 'no_recipient' as const };

  const insertedUsers: string[] = [];
  let ownerInserted = false;
  for (const recipient of recipients) {
    const result = await mutate(
      `INSERT IGNORE INTO notifications(
        id,account_id,user_id,type,category,priority,contact_id,title,body,
        action_url,metadata,dedupe_key
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        input.accountId,
        recipient.user_id,
        input.type,
        input.category,
        input.priority ?? 'normal',
        input.contactId ?? null,
        input.title,
        input.body,
        input.actionUrl,
        JSON.stringify(input.metadata ?? {}),
        input.dedupeKey,
      ]
    );
    if (result.affectedRows) {
      insertedUsers.push(recipient.user_id);
      if (recipient.account_role === 'owner') ownerInserted = true;
    }
  }

  let pushCount = 0;
  if (insertedUsers.length) {
    const placeholders = insertedUsers.map(() => '?').join(',');
    const subscriptions = await selectRows<
      (RowDataPacket & StoredPushSubscription)[]
    >(
      `SELECT id,endpoint,p256dh,auth FROM push_subscriptions
       WHERE owner_type='crm_user' AND user_id IN (${placeholders})`,
      insertedUsers
    );
    pushCount = subscriptions.length;
    await sendPush(subscriptions, {
      title: input.title,
      body: input.body,
      url: input.actionUrl,
      tag: input.dedupeKey,
    });
  }

  const owner = recipients.find(
    (recipient) => recipient.account_role === 'owner'
  );
  const configuredPhone =
    process.env.ADMIN_WHATSAPP_PHONE || owner?.professional_phone || '';
  const phone = normalizedPhone(configuredPhone);
  if (!ownerInserted || !owner || !phone || !input.whatsappText) {
    return {
      internal: insertedUsers.length,
      push: pushCount,
      whatsapp: !phone ? ('not_configured' as const) : ('skipped' as const),
    };
  }

  try {
    const conversationId = await ownerConversation({
      accountId: input.accountId,
      owner,
      phone,
    });
    // Account alerts used to be placed exclusively in the polling outbox.
    // With a reachable remote Worker this made Portal, voucher and pack
    // notifications appear in the CRM while waiting for a legacy worker.
    // Send them directly, exactly like Inbox messages; retain the outbox for
    // installations that intentionally operate without a public Worker.
    if (!remoteWhatsAppWorker.enabled()) {
      throw new Error('WHATSAPP_MODE deve ser remote_worker para enviar alertas.');
    }
    await remoteWhatsAppWorker.send({
      accountId: input.accountId,
      userId: owner.user_id,
      conversationId,
      message: { text: input.whatsappText, contentType: 'text', senderType: 'bot' },
    });
    return {
      internal: insertedUsers.length,
      push: pushCount,
      whatsapp: 'sent' as const,
    };
  } catch (error) {
    console.error('[account-event] WhatsApp alert failed:', error);
    return {
      internal: insertedUsers.length,
      push: pushCount,
      whatsapp: 'failed' as const,
    };
  }
}
