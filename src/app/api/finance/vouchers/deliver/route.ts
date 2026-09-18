import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendLocalEmail } from '@/lib/email/smtp';
import { voucherDeliveryEmail } from '@/lib/email/templates';
import { createVoucherEmailPdf } from '@/lib/finance/voucher-email-pdf';
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
    ? await db
        .from('profiles')
        .select('account_id,account_role')
        .eq('user_id', auth.user.id)
        .maybeSingle()
    : { data: null };
  if (!internalPaymentDelivery && (!profile || !['owner', 'admin', 'agent'].includes(profile.account_role)))
    return Response.json({ error: 'Sem permissão.' }, { status: 403 });

  const { data: saleScope } = await db.from('finance_sales').select('account_id').eq('id', body.saleId).maybeSingle();
  const accountId = profile?.account_id || saleScope?.account_id;
  if (!accountId || (!internalPaymentDelivery && accountId !== profile?.account_id))
    return Response.json({ error: 'Venda não encontrada.' }, { status: 404 });

  const [{ data: account }, { data: sale }, { data: vouchers, error }] = await Promise.all([
    db
      .from('accounts')
      .select('name,logo_url,public_url')
      .eq('id', accountId)
      .maybeSingle(),
    db
      .from('finance_sales')
      .select('id,status')
      .eq('id', body.saleId)
      .eq('account_id', accountId)
      .maybeSingle(),
    db
      .from('finance_vouchers')
      .select(
        'id,code,pin_code,voucher_type,initial_balance,currency,recipient_name,message,expires_at,status,owner:contacts(name,email),service:clinic_services(name)'
      )
      .eq('account_id', accountId)
      .eq('issued_sale_id', body.saleId)
      .in('status', ['active', 'pending']),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!sale) return Response.json({ error: 'Venda nao encontrada.' }, { status: 404 });
  if (!(vouchers ?? []).length)
    return Response.json({
      sent: 0,
      skipped: 0,
      failures: [],
      notApplicable: true,
    });

  const pendingVouchers = (vouchers ?? []).filter(
    (voucher) => voucher.status === 'pending'
  );
  if (pendingVouchers.length && sale.status === 'paid') {
    const { error: activationError } = await db
      .from('finance_vouchers')
      .update({ status: 'active' })
      .eq('account_id', accountId)
      .eq('issued_sale_id', body.saleId)
      .eq('status', 'pending');
    if (activationError)
      return Response.json({ error: activationError.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let attachments = 0;
  let attachmentBytes = 0;
  const failures: string[] = [];
  if (pendingVouchers.length && sale.status !== 'paid') {
    failures.push(
      'O voucher esta pendente porque a venda ainda nao foi paga. Registe ou confirme o pagamento antes de o enviar.'
    );
  }
  for (const voucher of vouchers ?? []) {
    if (voucher.status === 'pending' && sale.status !== 'paid') continue;
    const owner = Array.isArray(voucher.owner)
      ? voucher.owner[0]
      : voucher.owner;
    const service = Array.isArray(voucher.service)
      ? voucher.service[0]
      : voucher.service;
    if (!owner?.email) {
      skipped += 1;
      continue;
    }
    const benefit =
      voucher.voucher_type === 'service'
        ? service?.name || 'Voucher de serviço'
        : new Intl.NumberFormat('pt-PT', {
            style: 'currency',
            currency: voucher.currency || 'EUR',
          }).format(Number(voucher.initial_balance));
    const voucherUrl = getPublicUrl(
      `/voucher/${encodeURIComponent(voucher.id)}?pin=${encodeURIComponent(voucher.pin_code || '')}`,
      new URL(request.url).origin
    );
    try {
      const pdf = await createVoucherEmailPdf({
        businessName: account?.name || 'RP Instituto de Beleza',
        logoUrl: account?.logo_url,
        voucherUrl,
        code: voucher.code,
        pin: voucher.pin_code || '',
        benefit,
        recipientName: voucher.recipient_name || owner.name || 'Cliente',
        expiresAt: voucher.expires_at,
        message: voucher.message,
      });
      if (
        pdf.length < 1_000 ||
        pdf.subarray(0, 5).toString('ascii') !== '%PDF-'
      ) {
        throw new Error(
          `O PDF do voucher ${voucher.code} não foi gerado corretamente.`
        );
      }
      await sendLocalEmail({
        to: owner.email,
        profile: 'finance',
        ...voucherDeliveryEmail({
          businessName: account?.name || 'RP Instituto de Beleza',
          logoUrl: account?.logo_url,
          clientName: owner.name,
          recipientName: voucher.recipient_name,
          voucherUrl,
          code: voucher.code,
          pin: voucher.pin_code || '',
          benefit,
          expiresAt: voucher.expires_at,
          message: voucher.message,
        }),
        attachments: [
          {
            filename: `voucher-${voucher.code}.pdf`,
            content: pdf.toString('base64'),
            contentType: 'application/pdf',
            contentDisposition: 'attachment',
            encoding: 'base64',
          },
        ],
      });
      sent += 1;
      attachments += 1;
      attachmentBytes += pdf.length;
    } catch (cause) {
      failures.push(cause instanceof Error ? cause.message : 'Falha no email.');
    }
  }
  try {
    await notifyAccountEvent({
      accountId,
      type: failures.length
        ? 'voucher_delivery_failed'
        : 'voucher_delivery_sent',
      category: 'finance',
      priority: failures.length ? 'high' : 'normal',
      title: failures.length
        ? 'Falha no envio de voucher'
        : 'Voucher enviado por email',
      body: `${sent} enviado(s), ${skipped} sem email${failures.length ? `, ${failures.length} falhou(aram)` : ''}.`,
      actionUrl: '/benefits',
      dedupeKey: `voucher-delivery:${body.saleId}:${failures.length ? 'failed' : 'sent'}`,
      metadata: {
        saleId: body.saleId,
        sent,
        skipped,
        failures,
        attachments,
        attachmentBytes,
      },
    });
  } catch (notificationError) {
    console.error('[voucher-delivery] notification failed:', notificationError);
  }
  return Response.json({
    sent,
    skipped,
    failures,
    attachments,
    attachmentBytes,
  });
}
