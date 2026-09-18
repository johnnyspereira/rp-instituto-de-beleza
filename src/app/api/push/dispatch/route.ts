import { supabaseAdmin } from '@/lib/flows/admin-client';
import { sendPush, type StoredPushSubscription } from '@/lib/push/server';

type WebhookPayload = {
  table?: 'notifications' | 'portal_notifications';
  record?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-push-secret') !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const payload = (await request
    .json()
    .catch(() => null)) as WebhookPayload | null;
  const record = payload?.record;
  if (!record || !payload?.table)
    return Response.json({ error: 'Payload inválido.' }, { status: 400 });

  const admin = supabaseAdmin();
  let query = admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth');
  let url = '/notifications';
  if (payload.table === 'notifications') {
    if (typeof record.user_id !== 'string')
      return Response.json({ ok: true, sent: 0 });
    query = query.eq('owner_type', 'crm_user').eq('user_id', record.user_id);
    if (
      typeof record.action_url === 'string' &&
      record.action_url.startsWith('/')
    )
      url = record.action_url;
  } else {
    if (typeof record.contact_id !== 'string')
      return Response.json({ ok: true, sent: 0 });
    query = query
      .eq('owner_type', 'portal_contact')
      .eq('contact_id', record.contact_id);
    let slug = 'cliente';
    if (typeof record.account_id === 'string') {
      const { data: portalSettings } = await admin
        .from('client_portal_settings')
        .select('slug')
        .eq('account_id', record.account_id)
        .maybeSingle();
      if (portalSettings?.slug) slug = portalSettings.slug;
    }
    const tab =
      typeof record.action_tab === 'string'
        ? `?tab=${encodeURIComponent(record.action_tab)}`
        : '';
    url = `/portal/${encodeURIComponent(slug)}${tab}`;
  }
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const subscriptions = (data ?? []) as StoredPushSubscription[];
  await sendPush(subscriptions, {
    title: typeof record.title === 'string' ? record.title : 'Nova notificação',
    body: typeof record.body === 'string' ? record.body : null,
    url,
    tag: typeof record.id === 'string' ? record.id : undefined,
  });
  return Response.json({ ok: true, sent: subscriptions.length });
}
