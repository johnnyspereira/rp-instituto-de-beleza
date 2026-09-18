import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

type SubscriptionBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request
    .json()
    .catch(() => null)) as SubscriptionBody | null;
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys.auth) {
    return Response.json({ error: 'Subscrição inválida.' }, { status: 400 });
  }
  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile?.account_id)
    return Response.json({ error: 'Conta não encontrada.' }, { status: 403 });
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      account_id: profile.account_id,
      owner_type: 'crm_user',
      user_id: user.id,
      contact_id: null,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: request.headers.get('user-agent'),
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
  } | null;
  if (!body?.endpoint)
    return Response.json({ error: 'Endpoint inválido.' }, { status: 400 });
  await supabaseAdmin()
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', body.endpoint);
  return Response.json({ ok: true });
}
