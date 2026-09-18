import { randomUUID } from 'node:crypto';

import { getSumUpCredentials, sumUpRequest } from '@/lib/finance/sumup';
import { notifyAccountEvent } from '@/lib/notifications/account-events';
import {
  portalErrorResponse,
  PortalError,
  requirePortalAccess,
} from '@/lib/portal/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const body = await request.json().catch(() => null);
    const campaignId =
      typeof body?.campaignId === 'string' ? body.campaignId : '';
    if (!campaignId) throw new PortalError('Campanha inválida.', 400);
    const now = new Date().toISOString();
    const { data: campaign } = await admin
      .from('portal_campaigns')
      .select('id,title,capacity,status,starts_at,ends_at,commerce_enabled,commerce_price,commerce_currency,commerce_item_type')
      .eq('id', campaignId)
      .eq('account_id', access.account_id)
      .eq('status', 'published')
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .maybeSingle();
    if (!campaign)
      throw new PortalError('Esta campanha já não está disponível.', 404);
    const { data: existing } = await admin
      .from('portal_campaign_enrollments')
      .select('id,status,sale_id')
      .eq('campaign_id', campaign.id)
      .eq('contact_id', access.contact_id)
      .maybeSingle();
    if (existing && existing.status !== 'cancelled' && (!campaign.commerce_enabled || existing.sale_id)) {
      return Response.json({ ok: true, duplicate: true });
    }
    if (campaign.capacity) {
      const { count } = await admin
        .from('portal_campaign_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .neq('status', 'cancelled');
      if ((count ?? 0) >= campaign.capacity)
        throw new PortalError(
          'Esta campanha já atingiu o limite de adesões.',
          409
        );
    }
    const enrollmentId = existing?.id || randomUUID();
    const enrollment = {
      account_id: access.account_id,
      campaign_id: campaign.id,
      contact_id: access.contact_id,
      status: existing?.status === 'cancelled' ? 'joined' : (existing?.status || 'joined'),
      joined_at: now,
    };
    const { error } = existing
      ? await admin
          .from('portal_campaign_enrollments')
          .update(enrollment)
          .eq('id', existing.id)
      : await admin
          .from('portal_campaign_enrollments')
          .insert({ id: enrollmentId, ...enrollment });
    if (error) throw error;
    await admin.from('portal_notifications').insert({
      account_id: access.account_id,
      contact_id: access.contact_id,
      type: 'campaign',
      title: 'Adesão registada',
      body: 'A sua adesão à campanha foi recebida. Entraremos em contacto consigo.',
      action_tab: 'campaigns',
      metadata: { campaign_id: campaign.id },
    });
    const { data: contact } = await admin
      .from('contacts')
      .select('name,phone,email')
      .eq('id', access.contact_id)
      .maybeSingle();
    const contactName = contact?.name || contact?.phone || 'Um cliente';
    const details = [contact?.phone, contact?.email]
      .filter(Boolean)
      .join(' · ');
    await notifyAccountEvent({
      accountId: access.account_id,
      type: 'portal_campaign_interest',
      category: 'broadcast',
      priority: 'high',
      title: 'Novo interesse numa campanha',
      body: `${contactName} aderiu à campanha “${campaign.title}”.`,
      actionUrl: `/portal-campaigns?campaign=${campaign.id}`,
      contactId: access.contact_id,
      dedupeKey: `campaign-interest:${campaign.id}:${enrollmentId}:${now}`,
      metadata: {
        campaign_id: campaign.id,
        campaign_title: campaign.title,
        enrollment_id: enrollmentId,
      },
      whatsappText: [
        '📣 *Novo interesse numa campanha*',
        '',
        `Cliente: *${contactName}*`,
        details ? `Contacto: ${details}` : '',
        `Campanha: *${campaign.title}*`,
        '',
        `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://rp-instituto.example'}/portal-campaigns?campaign=${campaign.id}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
    if (!campaign.commerce_enabled || !Number(campaign.commerce_price))
      return Response.json({ ok: true });

    const price = Number(campaign.commerce_price);
    const currency = String(campaign.commerce_currency || 'EUR').toUpperCase();
    const saleId = randomUUID();
    const { error: saleError } = await admin.from('finance_sales').insert({
      id: saleId,
      account_id: access.account_id,
      contact_id: access.contact_id,
      status: 'open',
      currency,
      subtotal: price,
      discount_amount: 0,
      tax_amount: 0,
      total_amount: price,
      paid_amount: 0,
      balance_due: price,
      notes: `Compra no Portal: campanha ${campaign.title}`,
    });
    if (saleError) throw saleError;
    const { error: itemError } = await admin.from('finance_sale_items').insert({
      id: randomUUID(), account_id: access.account_id, sale_id: saleId,
      item_type: campaign.commerce_item_type || 'service', name_snapshot: campaign.title,
      quantity: 1, unit_price: price, discount_amount: 0, tax_rate: 0, tax_amount: 0, line_total: price,
      metadata: { campaign_id: campaign.id },
    });
    if (itemError) throw itemError;
    const linkId = randomUUID();
    const { error: linkError } = await admin.from('finance_payment_links').insert({
      id: linkId, account_id: access.account_id, sale_id: saleId, contact_id: access.contact_id,
      provider: 'sumup', status: 'pending', amount: price, currency,
      description: campaign.title, external_reference: `campaign-${campaign.id}-${access.contact_id}`,
    });
    if (linkError) throw linkError;
    try {
      const { merchantCode } = getSumUpCredentials();
      const origin = new URL(request.url).origin;
      const checkoutResponse = await sumUpRequest('/v0.1/checkouts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(price.toFixed(2)), checkout_reference: linkId, currency, description: 'Prestação de serviços', merchant_code: merchantCode, redirect_url: `${origin}/portal/${encodeURIComponent(slug)}?tab=finance`, return_url: `${origin}/api/finance/webhooks/sumup`, hosted_checkout: { enabled: true } }),
      });
      const checkout = await checkoutResponse.json().catch(() => ({})) as { id?: string; hosted_checkout_url?: string; status?: string; message?: string };
      if (!checkoutResponse.ok || !checkout.id || !checkout.hosted_checkout_url) throw new Error(checkout.message || 'A SumUp não devolveu um checkout válido.');
      await admin.from('finance_payment_links').update({ payment_url: checkout.hosted_checkout_url, external_session_id: checkout.id, provider_payload: { checkout_status: checkout.status || 'PENDING', campaign_id: campaign.id } }).eq('id', linkId);
      await admin.from('portal_campaign_enrollments').update({ sale_id: saleId, status: 'converted' }).eq('id', enrollmentId);
      return Response.json({ ok: true, checkoutUrl: checkout.hosted_checkout_url });
    } catch (checkoutError) {
      await admin.from('finance_payment_links').update({ status: 'failed', provider_payload: { error: checkoutError instanceof Error ? checkoutError.message : 'Erro SumUp' } }).eq('id', linkId);
      throw checkoutError;
    }
  } catch (error) {
    return portalErrorResponse(error);
  }
}
