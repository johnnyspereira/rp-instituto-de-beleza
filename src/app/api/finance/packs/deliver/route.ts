import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendLocalEmail } from '@/lib/email/smtp';
import { packDeliveryEmail } from '@/lib/email/templates';
import { notifyAccountEvent } from '@/lib/notifications/account-events';
import { getPublicUrl } from '@/lib/public-url';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const session = await createClient();
  const { data: auth } = await session.auth.getUser();
  const internalPaymentDelivery = request.headers.get('x-internal-payment-key') === process.env.SUMUP_API_KEY;
  if (!auth.user && !internalPaymentDelivery)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    saleId?: string;
  } | null;
  if (!body?.saleId)
    return Response.json({ error: 'Venda inválida.' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: profile } = auth.user
    ? await db.from('profiles').select('account_id,account_role').eq('user_id', auth.user.id).maybeSingle()
    : { data: null };
  if (!internalPaymentDelivery && (!profile || !['owner', 'admin', 'agent'].includes(profile.account_role)))
    return Response.json({ error: 'Sem permissão.' }, { status: 403 });

  const { data: saleScope } = await db.from('finance_sales').select('account_id').eq('id', body.saleId).maybeSingle();
  const accountId = profile?.account_id || saleScope?.account_id;
  if (!accountId || (!internalPaymentDelivery && accountId !== profile?.account_id)) return Response.json({ error: 'Venda não encontrada.' }, { status: 404 });

  const [{ data: account }, { data: packs, error }] = await Promise.all([
    db
      .from('accounts')
      .select('name,logo_url')
      .eq('id', accountId)
      .maybeSingle(),
    db
      .from('finance_client_packs')
      .select(
        'id,contact_id,code,pin_code,status,expires_at,contact:contacts(name,email),pack:finance_pack_catalog(name),balances:finance_client_pack_balances(total_sessions,remaining_sessions,service:clinic_services(name))'
      )
      .eq('account_id', accountId)
      .eq('sale_id', body.saleId)
      .eq('status', 'active'),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!(packs ?? []).length)
    return Response.json({
      sent: 0,
      skipped: 0,
      failures: [],
      notApplicable: true,
    });

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  const portalUrl = getPublicUrl('/portal', new URL(request.url).origin);
  for (const item of packs ?? []) {
    const contact = Array.isArray(item.contact)
      ? item.contact[0]
      : item.contact;
    const pack = Array.isArray(item.pack) ? item.pack[0] : item.pack;
    const balances = Array.isArray(item.balances) ? item.balances : [];
    if (!contact?.email) {
      skipped += 1;
      continue;
    }
    try {
      await sendLocalEmail({
        to: contact.email,
        profile: 'finance',
        ...packDeliveryEmail({
          businessName: account?.name || 'RP Instituto de Beleza',
          logoUrl: account?.logo_url,
          clientName: contact.name,
          packName: pack?.name || 'Pack de sessões',
          code: item.code,
          pin: item.pin_code,
          expiresAt: item.expires_at,
          sessions: balances.map((balance) => {
            const service = Array.isArray(balance.service)
              ? balance.service[0]
              : balance.service;
            return {
              service: service?.name || 'Sessão',
              total: Number(balance.total_sessions),
            };
          }),
          portalUrl,
        }),
      });
      sent += 1;
    } catch (cause) {
      failures.push(cause instanceof Error ? cause.message : 'Falha no email.');
    }
  }

  try {
    await notifyAccountEvent({
      accountId,
      type: failures.length ? 'pack_delivery_failed' : 'pack_delivery_sent',
      category: 'finance',
      priority: failures.length ? 'high' : 'normal',
      title: failures.length
        ? 'Falha no envio de pack'
        : 'Pack enviado por email',
      body: `${sent} enviado(s), ${skipped} sem email${failures.length ? `, ${failures.length} falhou(aram)` : ''}.`,
      actionUrl: '/benefits',
      dedupeKey: `pack-delivery:${body.saleId}:${failures.length ? 'failed' : 'sent'}`,
      metadata: { saleId: body.saleId, sent, skipped, failures },
    });
  } catch (notificationError) {
    console.error('[pack-delivery] notification failed:', notificationError);
  }
  return Response.json({ sent, skipped, failures });
}
