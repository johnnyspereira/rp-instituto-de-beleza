import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { mutate, selectRows, transaction } from '@/lib/mysql/db';
import { notifyAccountEvent } from '@/lib/notifications/account-events';
import { createClient } from '@/lib/supabase/server';
import { handleAppointmentConfirmationReply } from '@/lib/clinic/appointment-confirmation';
import { handleWhatsAppRescheduleReply } from '@/lib/clinic/appointment-whatsapp-reschedule';
import { enqueueWhatsAppMessage } from '@/lib/whatsapp/outbox';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';
import { handleOwnerInboxCommand } from '@/lib/ai/owner-inbox-commands';
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply';

async function authorized(
  request: Request,
  accountId: string,
  bodySecret?: unknown
) {
  // Bracket access is intentional: this value only exists in Passenger's
  // runtime environment and must never be folded into the GitHub build.
  const secret = process.env['WHATSAPP_WORKER_SECRET']?.trim();
  // Some shared-hosting proxy configurations do not forward the standard
  // Authorization header to Passenger. Keep Bearer support, but accept the
  // worker-specific header as a resilient authenticated transport too.
  const supplied =
    request.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
      .trim() ??
    request.headers.get('x-whatsapp-worker-secret')?.trim() ??
    (typeof bodySecret === 'string' ? bodySecret.trim() : undefined);
  if (secret) {
    if (supplied) {
      const left = Buffer.from(secret);
      const right = Buffer.from(supplied);
      if (left.length === right.length && timingSafeEqual(left, right)) return true;
    }

    // Shared hosting occasionally strips or rewrites request headers/body
    // before Passenger receives them. Accept a short-lived HMAC in the URL
    // as a proxy-safe transport without putting the worker secret in it.
    const url = new URL(request.url);
    const timestamp = Number(url.searchParams.get('worker_ts'));
    const signature = url.searchParams.get('worker_sig');
    const action = url.searchParams.get('worker_action') ?? '';
    const isFresh =
      Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) <= 300_000;
    if (signature && isFresh) {
      const expected = createHmac('sha256', secret)
        .update(`${timestamp}.${accountId}.${action}`)
        .digest('hex');
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expected, 'hex');
      if (
        signatureBuffer.length === expectedBuffer.length &&
        timingSafeEqual(signatureBuffer, expectedBuffer)
      ) {
        return true;
      }
    }
  }
  if (!supplied) return false;
  if (!accountId) return false;
  const rows = await selectRows<(RowDataPacket & { secret_hash: string })[]>(
    'SELECT secret_hash FROM whatsapp_worker_credentials WHERE account_id=? LIMIT 1',
    [accountId]
  );
  const expected = rows[0]?.secret_hash;
  if (!expected) return false;
  const suppliedHash = createHash('sha256').update(supplied).digest('hex');
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(suppliedHash, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function phone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function phoneKey(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function messageDedupeKey(conversationId: string, externalId: string) {
  return createHash('sha256')
    .update(`${conversationId}:${externalId}`)
    .digest('hex');
}

const MAX_BRIDGE_MEDIA_BYTES = 16 * 1024 * 1024;

function bridgeMediaUrl(messageId: string) {
  return `/api/whatsapp/bridge-media/${encodeURIComponent(messageId)}`;
}

function decodeBridgeMedia(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  // whatsapp-web.js returns base64 without a data-URL prefix. Reject
  // malformed input before allocating a potentially unbounded buffer.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Invalid media payload.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > MAX_BRIDGE_MEDIA_BYTES) {
    throw new Error('Media must be between 1 byte and 16 MB.');
  }
  return bytes;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? '');
    const accountId = String(body.accountId ?? '');
    if (!accountId) throw new Error('accountId is required.');
    if (!(await authorized(request, accountId, body.workerSecret)))
      return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (action === 'heartbeat') {
      await mutate(
        `INSERT INTO whatsapp_worker_health(
          account_id,worker_id,connected,state,qr,user_jid,has_saved_auth,
          connected_at,last_activity_at,last_error,last_seen_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE worker_id=VALUES(worker_id),connected=VALUES(connected),
          state=VALUES(state),qr=VALUES(qr),user_jid=VALUES(user_jid),
          has_saved_auth=VALUES(has_saved_auth),connected_at=VALUES(connected_at),
          last_activity_at=VALUES(last_activity_at),last_error=VALUES(last_error),
          last_seen_at=UTC_TIMESTAMP(3)`,
        [
          accountId,
          String(body.workerId ?? 'local-worker'),
          body.connected ? 1 : 0,
          String(body.state ?? 'offline').slice(0, 32),
          body.qr ? String(body.qr) : null,
          body.userJid ? String(body.userJid) : null,
          body.hasSavedAuth ? 1 : 0,
          body.connectedAt ? new Date(String(body.connectedAt)) : null,
          body.lastActivityAt ? new Date(String(body.lastActivityAt)) : null,
          body.lastError ? String(body.lastError) : null,
        ]
      );
      return Response.json({ success: true });
    }

    if (action === 'claim_command') {
      const workerId = String(body.workerId ?? 'local-worker').slice(0, 100);
      const command = await transaction(async (connection) => {
        const [rows] = await connection.execute<
          (RowDataPacket & {
            id: string;
            command_type: string;
            payload: string | Record<string, unknown> | null;
          })[]
        >(
          `SELECT id,command_type,payload FROM whatsapp_worker_commands
           WHERE account_id=? AND status='pending'
           ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
          [accountId]
        );
        const row = rows[0];
        if (!row) return null;
        await connection.execute(
          `UPDATE whatsapp_worker_commands SET status='processing',worker_id=?,
           updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [workerId, row.id]
        );
        return {
          ...row,
          payload:
            typeof row.payload === 'string'
              ? JSON.parse(row.payload)
              : row.payload,
        };
      });
      return Response.json({ command });
    }

    if (action === 'complete_command') {
      const failed = Boolean(body.error);
      await mutate(
        `UPDATE whatsapp_worker_commands SET status=?,last_error=?,
         completed_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3)
         WHERE id=? AND account_id=?`,
        [
          failed ? 'failed' : 'done',
          failed ? String(body.error) : null,
          String(body.commandId),
          accountId,
        ]
      );
      return Response.json({ success: true });
    }

    if (action === 'claim_outbox') {
      const workerId = String(body.workerId ?? 'local-worker').slice(0, 100);
      const job = await transaction(async (connection) => {
        const [rows] = await connection.execute<
          (RowDataPacket & {
            id: string;
            conversation_id: string;
            message_id: string;
            phone: string;
            payload: string | Record<string, unknown>;
            attempts: number;
          })[]
        >(
          `SELECT id,conversation_id,message_id,phone,payload,attempts
           FROM whatsapp_outbox
           WHERE account_id=? AND (
             (status IN ('pending','failed') AND available_at<=UTC_TIMESTAMP(3))
             OR (status='processing' AND lease_until<UTC_TIMESTAMP(3))
             -- Older worker versions falsely rejected the connected owner's
             -- own number before attempting a send. Reclaim only those
             -- precise bot alerts once; a real new failure gets its normal
             -- error and is not retried in a loop.
             OR (status='dead' AND last_error='Recipient is not registered on WhatsApp.'
                 AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.senderType'))='bot')
           )
           ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
          [accountId]
        );
        const row = rows[0];
        if (!row) return null;
        await connection.execute(
          `UPDATE whatsapp_outbox SET status='processing',attempts=attempts+1,
           worker_id=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 90 SECOND),
           updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [workerId, row.id]
        );
        return {
          ...row,
          attempts: Number(row.attempts) + 1,
          payload:
            typeof row.payload === 'string'
              ? JSON.parse(row.payload)
              : row.payload,
        };
      });
      return Response.json({ job });
    }

    if (action === 'complete_outbox') {
      const providerMessageId = String(body.providerMessageId ?? '');
      if (!providerMessageId) throw new Error('providerMessageId is required.');
      const result = await transaction(async (connection) => {
        const [rows] = await connection.execute<
          (RowDataPacket & {
            id: string;
            conversation_id: string;
            message_id: string;
          })[]
        >(
          `SELECT id,conversation_id,message_id FROM whatsapp_outbox
           WHERE id=? AND account_id=? LIMIT 1 FOR UPDATE`,
          [String(body.jobId), accountId]
        );
        const job = rows[0];
        if (!job) throw new Error('Outbox job not found.');
        const dedupeKey = messageDedupeKey(
          job.conversation_id,
          providerMessageId
        );
        await connection.execute(
          'DELETE FROM messages WHERE dedupe_key=? AND id<>?',
          [dedupeKey, job.message_id]
        );
        await connection.execute(
          `UPDATE messages SET message_id=?,dedupe_key=?,status='sent'
           WHERE id=? AND conversation_id=?`,
          [providerMessageId, dedupeKey, job.message_id, job.conversation_id]
        );
        await connection.execute(
          `UPDATE whatsapp_outbox SET status='sent',provider_message_id=?,sent_at=UTC_TIMESTAMP(3),
           lease_until=NULL,last_error=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [providerMessageId, job.id]
        );
        return { messageId: job.message_id };
      });
      return Response.json({ success: true, ...result });
    }

    if (action === 'fail_outbox') {
      const result = await transaction(async (connection) => {
        const [rows] = await connection.execute<
          (RowDataPacket & {
            id: string;
            message_id: string;
            attempts: number;
          })[]
        >(
          `SELECT id,message_id,attempts FROM whatsapp_outbox
           WHERE id=? AND account_id=? LIMIT 1 FOR UPDATE`,
          [String(body.jobId), accountId]
        );
        const job = rows[0];
        if (!job) throw new Error('Outbox job not found.');
        const dead = Number(job.attempts) >= 5;
        const delaySeconds = Math.min(
          300,
          5 * 2 ** Math.max(0, Number(job.attempts) - 1)
        );
        const availableAt = new Date(Date.now() + delaySeconds * 1000);
        await connection.execute(
          `UPDATE whatsapp_outbox SET status=?,available_at=?,lease_until=NULL,last_error=?,
           updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [
            dead ? 'dead' : 'failed',
            availableAt,
            String(body.error ?? 'Send failed'),
            job.id,
          ]
        );
        if (dead) {
          await connection.execute(
            "UPDATE messages SET status='failed' WHERE id=?",
            [job.message_id]
          );
        }
        return { dead, retryInSeconds: dead ? null : delaySeconds };
      });
      return Response.json({ success: true, ...result });
    }

    if (action === 'resolve_conversation') {
      const rows = await selectRows<(RowDataPacket & { phone: string })[]>(
        `SELECT c.phone FROM conversations v JOIN contacts c ON c.id=v.contact_id
          WHERE v.id=? AND v.account_id=? LIMIT 1`,
        [String(body.conversationId), accountId]
      );
      if (!rows[0]) throw new Error('Conversation not found.');
      return Response.json({ phone: rows[0].phone });
    }

    if (action === 'persist_message') {
      const externalId = String(body.messageId ?? '');
      if (!externalId) throw new Error('messageId is required.');
      const direction = body.fromMe ? 'agent' : 'customer';
      const contentType = [
        'text',
        'image',
        'document',
        'audio',
        'video',
        'location',
        'template',
        'interactive',
      ].includes(String(body.contentType))
        ? String(body.contentType)
        : 'text';
      const normalized = phone(body.phone);
      if (!normalized) throw new Error('Valid phone is required.');
      const normalizedKey = phoneKey(normalized);
      const phoneAliases = Array.isArray(body.phoneAliases)
        ? [...new Set(body.phoneAliases.map(phoneKey).filter((key) => key && key !== normalizedKey))]
        : [];
      const userId = String(body.userId ?? '');
      if (!userId) throw new Error('userId is required.');
      const mediaBytes = decodeBridgeMedia(body.mediaBase64);
      const mediaMimeType = String(body.mediaMimeType ?? '').slice(0, 255);
      const mediaFilename = body.mediaFilename
        ? String(body.mediaFilename).slice(0, 512)
        : null;
      if (mediaBytes && !mediaMimeType) {
        throw new Error('Media MIME type is required.');
      }
      const profilePictureBytes = decodeBridgeMedia(body.profilePicBase64);
      const profilePictureMimeType = String(
        body.profilePicMimeType ?? ''
      ).slice(0, 255);
      if (
        profilePictureBytes &&
        !/^image\//i.test(profilePictureMimeType)
      ) {
        throw new Error('Profile picture must be an image.');
      }
      const mediaUrl = mediaBytes
        ? bridgeMediaUrl(externalId)
        : body.mediaUrl
          ? String(body.mediaUrl)
          : null;

      const result = await transaction(async (connection) => {
        if (mediaBytes) {
          await connection.execute(
            `INSERT INTO whatsapp_bridge_media(message_id,account_id,mime_type,filename,data)
             VALUES(?,?,?,?,?)
             ON DUPLICATE KEY UPDATE mime_type=VALUES(mime_type),filename=VALUES(filename),data=VALUES(data)`,
            [externalId, accountId, mediaMimeType, mediaFilename, mediaBytes]
          );
        }
        const [identities] = await connection.execute<
          (RowDataPacket & { contact_id: string })[]
        >(
          'SELECT contact_id FROM contact_phone_identities WHERE account_id=? AND phone_key=? LIMIT 1 FOR UPDATE',
          [accountId, normalizedKey]
        );
        let contactId = identities[0]?.contact_id;
        let legacyContactId: string | undefined;
        if (phoneAliases.length) {
          const [legacyIdentities] = await connection.execute<
            (RowDataPacket & { contact_id: string })[]
          >(
            `SELECT contact_id FROM contact_phone_identities
             WHERE account_id=? AND phone_key IN (${phoneAliases.map(() => '?').join(',')})
             LIMIT 1 FOR UPDATE`,
            [accountId, ...phoneAliases]
          );
          legacyContactId = legacyIdentities[0]?.contact_id;
        }
        if (!contactId) {
          const candidateId = randomUUID();
          await connection.execute(
            `INSERT IGNORE INTO contacts(id,account_id,user_id,phone,name,source,preferred_contact,whatsapp_consent)
             VALUES(?,?,?,?,?,'whatsapp','whatsapp',TRUE)`,
            [
              candidateId,
              accountId,
              userId,
              normalized,
              String(body.name ?? normalized),
            ]
          );
          const [contacts] = await connection.execute<
            (RowDataPacket & { id: string })[]
          >(
            'SELECT id FROM contacts WHERE account_id=? AND phone=? LIMIT 1 FOR UPDATE',
            [accountId, normalized]
          );
          contactId = contacts[0]?.id;
          if (!contactId) throw new Error('Failed to resolve contact.');
          await connection.execute(
            `INSERT INTO contact_phone_identities(account_id,phone_key,contact_id,source)
             VALUES(?,?,?,'whatsapp')
             ON DUPLICATE KEY UPDATE contact_id=contact_id`,
            [accountId, normalizedKey, contactId]
          );
          const [winner] = await connection.execute<
            (RowDataPacket & { contact_id: string })[]
          >(
            'SELECT contact_id FROM contact_phone_identities WHERE account_id=? AND phone_key=? LIMIT 1',
            [accountId, normalizedKey]
          );
          contactId = winner[0]?.contact_id ?? contactId;
        }
        if (legacyContactId && legacyContactId === contactId) legacyContactId = undefined;
        // Contacts may originate directly from an incoming WhatsApp message,
        // so they must receive the same sequential internal reference as a
        // contact created in the CRM. Fill only a blank value: imports and
        // manually assigned references always win.
        const [referenceRows] = await connection.execute<
          (RowDataPacket & { client_reference: string | null })[]
        >(
          'SELECT client_reference FROM contacts WHERE id=? AND account_id=? LIMIT 1 FOR UPDATE',
          [contactId, accountId]
        );
        if (!referenceRows[0]?.client_reference?.trim()) {
          // Serialize allocation per account. Locking the account row is
          // portable on MySQL and avoids relying on aggregate gap locks.
          await connection.execute(
            'SELECT id FROM accounts WHERE id=? FOR UPDATE',
            [accountId]
          );
          const [maximumRows] = await connection.execute<
            (RowDataPacket & { maximum_reference: number | string })[]
          >(
            `SELECT COALESCE(MAX(CASE WHEN client_reference REGEXP '^[0-9]+$'
             THEN CAST(client_reference AS UNSIGNED) ELSE 0 END),0) AS maximum_reference
             FROM contacts WHERE account_id=?`,
            [accountId]
          );
          const nextReference = String(
            Number(maximumRows[0]?.maximum_reference ?? 0) + 1
          );
          await connection.execute(
            `UPDATE contacts SET client_reference=?
             WHERE id=? AND account_id=? AND (client_reference IS NULL OR TRIM(client_reference)='')`,
            [nextReference, contactId, accountId]
          );
        }
        const profilePicUrl = String(body.profilePicUrl ?? '');
        if (profilePictureBytes) {
          const avatarMediaId = `avatar:${contactId}`;
          await connection.execute(
            `INSERT INTO whatsapp_bridge_media(message_id,account_id,mime_type,filename,data)
             VALUES(?,?,?,?,?)
             ON DUPLICATE KEY UPDATE mime_type=VALUES(mime_type),data=VALUES(data)`,
            [
              avatarMediaId,
              accountId,
              profilePictureMimeType,
              'whatsapp-profile-picture',
              profilePictureBytes,
            ]
          );
          await connection.execute(
            'UPDATE contacts SET avatar_url=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?',
            [bridgeMediaUrl(avatarMediaId), contactId, accountId]
          );
        } else if (
          /^https:\/\//i.test(profilePicUrl) &&
          profilePicUrl.length <= 4096
        ) {
          await connection.execute(
            'UPDATE contacts SET avatar_url=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?',
            [profilePicUrl, contactId, accountId]
          );
        }
        const [conversations] = await connection.execute<
          (RowDataPacket & { id: string })[]
        >(
          'SELECT id FROM conversations WHERE account_id=? AND contact_id=? LIMIT 1 FOR UPDATE',
          [accountId, contactId]
        );
        let conversationId = conversations[0]?.id;
        if (!conversationId) {
          conversationId = randomUUID();
          await connection.execute(
            "INSERT INTO conversations(id,account_id,user_id,contact_id,status) VALUES(?,?,?,?,'open')",
            [conversationId, accountId, userId, contactId]
          );
        }
        // A LID is an internal WhatsApp identifier, not a phone number. If
        // an older worker created a conversation using one, move its message
        // history into the resolved phone conversation and retire that empty
        // duplicate thread. This keeps one Inbox row per actual number.
        if (legacyContactId) {
          const [legacyConversations] = await connection.execute<
            (RowDataPacket & { id: string })[]
          >(
            `SELECT id FROM conversations WHERE account_id=? AND contact_id=?
             LIMIT 1 FOR UPDATE`,
            [accountId, legacyContactId]
          );
          const legacyConversationId = legacyConversations[0]?.id;
          if (legacyConversationId && legacyConversationId !== conversationId) {
            await connection.execute(
              'UPDATE messages SET conversation_id=? WHERE conversation_id=?',
              [conversationId, legacyConversationId]
            );
            await connection.execute(
              'UPDATE whatsapp_outbox SET conversation_id=? WHERE conversation_id=?',
              [conversationId, legacyConversationId]
            );
            await connection.execute(
              'DELETE FROM conversations WHERE id=? AND account_id=?',
              [legacyConversationId, accountId]
            );
          }
          await connection.execute(
            `UPDATE contact_phone_identities SET contact_id=?,source='whatsapp'
             WHERE account_id=? AND phone_key IN (${phoneAliases.map(() => '?').join(',')})`,
            [contactId, accountId, ...phoneAliases]
          );
        }
        const id = randomUUID();
        const dedupeKey = messageDedupeKey(conversationId, externalId);
        const [insertResult] = await connection.execute<
          import('mysql2').ResultSetHeader
        >(
          `INSERT IGNORE INTO messages(id,conversation_id,sender_type,content_type,content_text,media_url,message_id,dedupe_key,status,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            conversationId,
            direction,
            contentType,
            body.text ? String(body.text) : null,
            mediaUrl,
            externalId,
            dedupeKey,
            direction === 'customer' ? 'delivered' : 'sent',
            new Date(String(body.timestamp ?? new Date().toISOString())),
          ]
        );
        const inserted = insertResult.affectedRows > 0;
        if (!inserted && mediaUrl) {
          await connection.execute(
            `UPDATE messages SET media_url=COALESCE(?,media_url),
             content_text=COALESCE(NULLIF(?,''),content_text)
             WHERE conversation_id=? AND dedupe_key=?`,
            [mediaUrl, String(body.text ?? ''), conversationId, dedupeKey]
          );
        }
        if (inserted) {
          await connection.execute(
            `UPDATE conversations SET last_message_text=?,last_message_at=?,unread_count=unread_count+?,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
            [
              String(body.text ?? `[${contentType}]`),
              new Date(String(body.timestamp ?? new Date().toISOString())),
              // A sync snapshot imports existing WhatsApp history. It must
              // never create a new unread conversation merely because the
              // browser/worker was restarted.
              direction === 'customer' && !body.historical ? 1 : 0,
              conversationId,
            ]
          );
        }
        const [stored] = await connection.execute<
          (RowDataPacket & { id: string })[]
        >('SELECT id FROM messages WHERE dedupe_key=? LIMIT 1', [dedupeKey]);
        return {
          messageId: stored[0]?.id ?? id,
          conversationId,
          contactId,
          duplicate: !inserted,
          inserted,
        };
      });
      // Imported history belongs in the Inbox but should not interrupt the
      // team. New customer messages receive the normal realtime/browser/push
      // notification path.
      if (result.inserted && direction === 'customer' && !body.historical) {
        // QR Worker messages bypass the old in-process WhatsApp listener.
        // Run the same safe, contact-scoped confirmation handler here so a
        // reply of CONFIRMAR/REAGENDAR works for individual appointments.
        if (contentType === 'text' && body.text) {
          const messageText = String(body.text);
          const ownerCommandReply = await handleOwnerInboxCommand({
            accountId,
            userId,
            contactId: result.contactId,
            conversationId: result.conversationId,
            phone: normalized,
            text: messageText,
          }).catch((ownerCommandError) => {
            console.error('[whatsapp-bridge] owner command failed:', ownerCommandError);
            return null;
          });
          if (ownerCommandReply) {
            const message = {
              text: ownerCommandReply,
              contentType: 'text',
              senderType: 'bot' as const,
            };
            // Commands must reach the owner's phone immediately. The outbox is
            // only a fallback because shared hosting has no persistent queue worker.
            if (remoteWhatsAppWorker.enabled()) {
              await remoteWhatsAppWorker.send({
                accountId,
                userId,
                conversationId: result.conversationId,
                message,
              }).catch((remoteError) => {
                console.error('[whatsapp-bridge] remote owner command response failed:', remoteError);
                return enqueueWhatsAppMessage({
                  accountId,
                  userId,
                  conversationId: result.conversationId,
                  requestKey: `owner-command:${externalId}`,
                  payload: message,
                });
              });
            } else {
              await enqueueWhatsAppMessage({
                accountId,
                userId,
                conversationId: result.conversationId,
                requestKey: `owner-command:${externalId}`,
                payload: message,
              });
            }
          } else {
          const appointmentRequest = /\b(reagendar|remarcar|alterar|mudar|cancelar|cancela)\b/i.test(
            messageText.normalize('NFD').replace(/\p{Diacritic}/gu, '')
          );
          const reschedule = await handleWhatsAppRescheduleReply({
            accountId,
            contactId: result.contactId,
            messageText,
            conversationId: result.conversationId,
            sourceMessageId: externalId,
          }).catch((rescheduleError) => {
            console.error('[whatsapp-bridge] appointment reschedule failed:', rescheduleError);
            return null;
          });
          const automaticReply = reschedule?.replyText ??
            (appointmentRequest
              ? 'Recebemos o seu pedido. A nossa equipa irá verificar a marcação e responder por aqui em breve.'
              : null);
          if (automaticReply) {
            const message = {
              text: automaticReply,
              contentType: 'text',
              senderType: 'bot' as const,
            };
            if (remoteWhatsAppWorker.enabled()) {
              await remoteWhatsAppWorker.send({
                accountId,
                userId,
                conversationId: result.conversationId,
                message,
              }).catch((remoteError) => {
                console.error('[whatsapp-bridge] remote appointment response failed:', remoteError);
                return enqueueWhatsAppMessage({
                  accountId,
                  userId,
                  conversationId: result.conversationId,
                  requestKey: `appointment-reschedule:${externalId}`,
                  payload: message,
                });
              });
            } else {
              await enqueueWhatsAppMessage({
                accountId,
                userId,
                conversationId: result.conversationId,
                requestKey: `appointment-reschedule:${externalId}`,
                payload: message,
              });
            }
          } else {
            const db = await createClient();
            await handleAppointmentConfirmationReply({
              db,
              accountId,
              contactId: result.contactId,
              messageText,
              conversationId: result.conversationId,
              sourceMessageId: externalId,
            }).catch((confirmationError) => {
              console.error('[whatsapp-bridge] appointment confirmation failed:', confirmationError);
            });
          }
          }
        }
        await notifyAccountEvent({
          accountId,
          type: 'new_message_received',
          category: 'inbox',
          priority: 'high',
          title: `Nova mensagem de ${String(body.name ?? normalized)}`,
          body: String(body.text ?? 'Nova mensagem recebida.'),
          actionUrl: `/inbox?c=${result.conversationId}`,
          contactId: result.contactId,
          dedupeKey: `whatsapp-incoming:${externalId}`,
        }).catch((notificationError) => {
          console.error(
            '[whatsapp-bridge] inbox notification failed:',
            notificationError
          );
        });

        // QR/WhatsApp Web traffic enters through this bridge instead of the
        // Meta webhook. Without this dispatch, the Inbox could display an
        // enabled AI assistant that never received an inbound event at all.
        // Keep historical sync out of the bot and leave non-text events to
        // the deterministic handlers above, exactly as the Meta path does.
        if (
          contentType === 'text' &&
          !body.historical &&
          String(body.text ?? '').trim() &&
          // Appointment commands already have deterministic, auditable
          // responders above. Never let the AI add a second answer.
          !/\b(confirmar|reagendar|remarcar|alterar|mudar|cancelar|cancela)\b/i.test(
            String(body.text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
          )
        ) {
          await dispatchInboundToAiReply({
            accountId,
            conversationId: result.conversationId,
            contactId: result.contactId,
            configOwnerUserId: userId,
          });
        }
      }
      return Response.json(result);
    }

    if (action === 'persist_outgoing') {
      const conversationId = String(body.conversationId);
      const externalId = String(body.messageId ?? '');
      if (!externalId) throw new Error('messageId is required.');
      const dedupeKey = messageDedupeKey(conversationId, externalId);
      const result = await transaction(async (connection) => {
        const id = randomUUID();
        const [insertResult] = await connection.execute<
          import('mysql2').ResultSetHeader
        >(
          `INSERT IGNORE INTO messages(id,conversation_id,sender_type,content_type,content_text,media_url,template_name,message_id,dedupe_key,status,reply_to_message_id,interactive_payload)
           SELECT ?,v.id,?,?,?,?,?,?,?,'sent',?,? FROM conversations v WHERE v.id=? AND v.account_id=?`,
          [
            id,
            String(body.senderType ?? 'agent'),
            String(body.contentType ?? 'text'),
            body.text ? String(body.text) : null,
            body.mediaUrl ? String(body.mediaUrl) : null,
            body.templateName ? String(body.templateName) : null,
            externalId,
            dedupeKey,
            body.replyToMessageId ? String(body.replyToMessageId) : null,
            body.interactivePayload
              ? JSON.stringify(body.interactivePayload)
              : null,
            conversationId,
            accountId,
          ]
        );
        if (insertResult.affectedRows > 0) {
          await connection.execute(
            'UPDATE conversations SET last_message_text=?,last_message_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?',
            [
              String(body.text ?? `[${body.contentType ?? 'text'}]`),
              conversationId,
              accountId,
            ]
          );
        }
        const [stored] = await connection.execute<
          (RowDataPacket & { id: string })[]
        >('SELECT id FROM messages WHERE dedupe_key=? LIMIT 1', [dedupeKey]);
        if (!stored[0]) throw new Error('Conversation not found.');
        return {
          messageId: stored[0].id,
          duplicate: insertResult.affectedRows === 0,
        };
      });
      return Response.json(result);
    }

    if (action === 'ack') {
      const status = String(body.status);
      if (!['sent', 'delivered', 'read', 'failed'].includes(status)) {
        throw new Error('Invalid acknowledgement status.');
      }
      await mutate(
        `UPDATE messages m
         JOIN conversations v ON v.id=m.conversation_id
         SET m.status=CASE
           WHEN m.status='read' THEN 'read'
           WHEN m.status='delivered' AND ?='sent' THEN 'delivered'
           WHEN m.status IN ('sent','delivered','read') AND ?='failed' THEN m.status
           ELSE ? END
         WHERE m.message_id=? AND v.account_id=?`,
        [status, status, status, String(body.messageId), accountId]
      );
      return Response.json({ success: true });
    }
    throw new Error('Unsupported action.');
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Bridge request failed.',
      },
      { status: 400 }
    );
  }
}
