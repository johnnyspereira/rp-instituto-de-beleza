import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendPush, type StoredPushSubscription } from '@/lib/push/server';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { getPublicUrl } from '@/lib/public-url';
import { enqueueWhatsAppMessage } from '@/lib/whatsapp/outbox';

type CreatedNotification = {
  id: string;
  account_id: string;
  user_id: string;
  title: string;
  body: string | null;
  action_url: string | null;
};
type Delivery = {
  id: string;
  account_id: string;
  recipient: string;
  attempts: number;
  notification: { title: string; body: string | null } | null;
};

type QueuedReminder = {
  id: string;
  whatsapp_message_id: string | null;
};

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected)
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  if (request.headers.get('x-cron-secret') !== expected)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc(
    'process_finance_operational_reminders',
    { p_now: new Date().toISOString() }
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  const created = (data ?? []) as CreatedNotification[];

  // A queue acknowledgement is not a WhatsApp delivery. Reconcile the
  // reminder with the message state written by the worker before creating
  // more work, so the UI and logs never call a queued alert "sent".
  const { data: awaiting } = await admin
    .from('finance_reminder_deliveries')
    .select('id,whatsapp_message_id')
    .in('status', ['queued', 'sending'])
    .not('whatsapp_message_id', 'is', null)
    .limit(100);
  const queuedDeliveries = (awaiting ?? []) as QueuedReminder[];
  const queuedMessageIds = queuedDeliveries
    .map((item) => item.whatsapp_message_id)
    .filter((id): id is string => Boolean(id));
  if (queuedMessageIds.length) {
    const { data: messages } = await admin
      .from('messages')
      .select('id,status')
      .in('id', queuedMessageIds);
    const statusByMessageId = new Map(
      (messages ?? []).map((message) => [message.id, message.status])
    );
    await Promise.all(
      queuedDeliveries.map((delivery) => {
        const status = delivery.whatsapp_message_id
          ? statusByMessageId.get(delivery.whatsapp_message_id)
          : null;
        if (status === 'sent')
          return admin
            .from('finance_reminder_deliveries')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', delivery.id);
        if (status === 'failed')
          return admin
            .from('finance_reminder_deliveries')
            .update({
              status: 'failed',
              last_error: 'O worker não conseguiu entregar a mensagem.',
              next_attempt_at: new Date(Date.now() + 5 * 60000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', delivery.id);
        return Promise.resolve({ error: null });
      })
    );
  }

  const accountIds = [...new Set(created.map((item) => item.account_id))];
  if (accountIds.length) {
    const { data: settings } = await admin
      .from('finance_reminder_settings')
      .select('account_id,whatsapp_enabled,whatsapp_phone')
      .in('account_id', accountIds)
      .eq('whatsapp_enabled', true);
    const byAccount = new Map(
      (settings ?? []).map((item) => [item.account_id, item])
    );
    const rows = created.flatMap((notification) => {
      const setting = byAccount.get(notification.account_id);
      return setting?.whatsapp_phone
        ? [
            {
              notification_id: notification.id,
              account_id: notification.account_id,
              channel: 'whatsapp',
              recipient: setting.whatsapp_phone,
            },
          ]
        : [];
    });
    if (rows.length)
      await admin.from('finance_reminder_deliveries').upsert(rows, {
        onConflict: 'notification_id',
        ignoreDuplicates: true,
      });
  }

  const userIds = [...new Set(created.map((item) => item.user_id))];
  if (userIds.length) {
    const { data: subscriptions } = await admin
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth,user_id')
      .eq('owner_type', 'crm_user')
      .in('user_id', userIds);
    await Promise.all(
      created.map((notification) =>
        sendPush(
          (subscriptions ?? []).filter(
            (item) => item.user_id === notification.user_id
          ) as StoredPushSubscription[],
          {
            title: notification.title,
            body: notification.body,
            url: notification.action_url || '/finance',
            tag: notification.id,
          }
        )
      )
    );
  }

  const { data: due } = await admin
    .from('finance_reminder_deliveries')
    .select(
      'id,account_id,recipient,attempts,notification:notifications(title,body)'
    )
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .lt('attempts', 5)
    .limit(25);
  let whatsappQueued = 0;
  let whatsappFailed = 0;
  const financeUrl = getPublicUrl('/finance', new URL(request.url).origin);
  for (const delivery of (due ?? []) as unknown as Delivery[]) {
    const { data: claim } = await admin
      .from('finance_reminder_deliveries')
      .update({
        status: 'sending',
        attempts: delivery.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();
    if (!claim) continue;
    try {
      const { conversationId } = await resolveConversationByPhone(
        admin,
        delivery.account_id,
        delivery.recipient,
        'Alertas financeiros'
      );
      const { data: owner } = await admin
        .from('profiles')
        .select('user_id')
        .eq('account_id', delivery.account_id)
        .eq('account_role', 'owner')
        .limit(1)
        .single();
      if (!owner?.user_id)
        throw new Error('ProprietÃ¡rio da conta nÃ£o encontrado.');
      const message = `🔔 *${delivery.notification?.title ?? 'Alerta financeiro'}*\n\n${delivery.notification?.body ?? ''}\n\nAbra o CRM: ${financeUrl}`;
      const queued = await enqueueWhatsAppMessage({
        accountId: delivery.account_id,
        userId: owner.user_id,
        conversationId,
        requestKey: `finance-reminder-${delivery.id}`,
        payload: { text: message, contentType: 'text', senderType: 'bot' },
      });
      await admin
        .from('finance_reminder_deliveries')
        .update({
          status: 'queued',
          sent_at: null,
          whatsapp_message_id: queued.messageId,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);
      whatsappQueued++;
      continue;

      /* Direct delivery is intentionally replaced by the durable outbox.
      const sent = remoteWhatsAppWorker.enabled()
        ? await remoteWhatsAppWorker.send({
            accountId: delivery.account_id,
            userId: owner.user_id,
            conversationId,
            message: { text: message, contentType: 'text', senderType: 'bot' },
          })
        : await engineSendText({
            accountId: delivery.account_id,
            userId: owner.user_id,
            conversationId,
            contactId,
            text: message,
          });
      await admin
        .from('finance_reminder_deliveries')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          whatsapp_message_id: 'whatsappMessageId' in sent ? sent.whatsappMessageId : sent.whatsapp_message_id,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);
      whatsappSent++;
      */
    } catch (error) {
      const delayMinutes = Math.min(60, 5 * 2 ** delivery.attempts);
      await admin
        .from('finance_reminder_deliveries')
        .update({
          status: 'failed',
          last_error: error instanceof Error ? error.message : String(error),
          next_attempt_at: new Date(
            Date.now() + delayMinutes * 60000
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);
      whatsappFailed++;
    }
  }
  return NextResponse.json({
    processed: created.length,
    pushed_to_users: userIds.length,
    whatsapp_queued: whatsappQueued,
    whatsapp_failed: whatsappFailed,
  });
}
