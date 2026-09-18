import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

type ScheduledMessageRow = {
  id: string;
  account_id: string;
  user_id: string | null;
  contact_id: string;
  conversation_id: string | null;
  content_text: string;
  attempts: number;
};

function isAuthorized(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) return { ok: false, status: 503, error: 'cron not configured' };

  const supplied = request.headers.get('x-cron-secret') ?? '';
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);

  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true, status: 200, error: null };
}

export async function GET(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  const { data: due, error } = await admin
    .from('scheduled_whatsapp_messages')
    .select(
      'id, account_id, user_id, contact_id, conversation_id, content_text, attempts'
    )
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(25);

  if (error) {
    console.error('[scheduled-whatsapp] scan failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!due?.length) return NextResponse.json({ processed: 0, sent: 0 });

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const row of due as ScheduledMessageRow[]) {
    const { data: claimed, error: claimError } = await admin
      .from('scheduled_whatsapp_messages')
      .update({
        status: 'sending',
        attempts: Number(row.attempts ?? 0) + 1,
        last_error: null,
      })
      .eq('id', row.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();

    if (claimError) {
      console.error('[scheduled-whatsapp] claim failed:', claimError.message);
      continue;
    }
    if (!claimed) continue;

    processed++;

    try {
      const conversationId =
        row.conversation_id ??
        (await findOrCreateConversation({
          accountId: row.account_id,
          contactId: row.contact_id,
          userId: row.user_id,
        }));

      if (!conversationId) {
        throw new Error('Não foi possível abrir conversa para este cliente.');
      }

      const result = await sendScheduledText({
        accountId: row.account_id,
        userId: row.user_id,
        conversationId,
        contentText: row.content_text,
      });

      await admin
        .from('scheduled_whatsapp_messages')
        .update({
          status: 'sent',
          conversation_id: conversationId,
          sent_message_id: result.messageId,
          whatsapp_message_id: result.whatsappMessageId,
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', row.id);
      sent++;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao enviar mensagem.';
      console.error('[scheduled-whatsapp] send failed:', message);
      await admin
        .from('scheduled_whatsapp_messages')
        .update({
          status: 'failed',
          last_error: message,
        })
        .eq('id', row.id);
      failed++;
    }
  }

  return NextResponse.json({ processed, sent, failed });
}

async function findOrCreateConversation(input: {
  accountId: string;
  contactId: string;
  userId: string | null;
}) {
  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from('conversations')
    .select('id')
    .eq('account_id', input.accountId)
    .eq('contact_id', input.contactId)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await admin
    .from('conversations')
    .insert({
      account_id: input.accountId,
      user_id: input.userId,
      contact_id: input.contactId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[scheduled-whatsapp] conversation create failed:', error);
    return null;
  }

  return created.id as string;
}

async function sendScheduledText(input: {
  accountId: string;
  userId: string | null;
  conversationId: string;
  contentText: string;
}) {
  if (remoteWhatsAppWorker.enabled()) {
    if (!input.userId) {
      throw new Error('Usuário do agendamento não está disponível.');
    }
    const status = await remoteWhatsAppWorker.status({
      accountId: input.accountId,
      userId: input.userId,
      autoStart: true,
    });

    if (!status.connected) {
      throw new Error(
        status.lastError ||
          `Sessão WhatsApp QR indisponível (${status.state}).`
      );
    }

    return remoteWhatsAppWorker.send({
      accountId: input.accountId,
      userId: input.userId,
      conversationId: input.conversationId,
      message: {
        text: input.contentText,
        contentType: 'text',
        senderType: 'agent',
      },
    });
  }

  throw new Error('WHATSAPP_MODE deve ser remote_worker para processar mensagens agendadas.');
}
