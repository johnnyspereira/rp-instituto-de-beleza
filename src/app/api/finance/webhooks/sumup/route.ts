import { NextResponse, type NextRequest } from 'next/server';
import { sendLocalEmail } from '@/lib/email/smtp';
import { brandedEmail } from '@/lib/email/templates';
import { notifyAccountEvent } from '@/lib/notifications/account-events';
import { sumUpRequest } from '@/lib/finance/sumup';
import { getPublicUrl } from '@/lib/public-url';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type Webhook = { id?: string; event_type?: string };
type Checkout = { id?: string; status?: string; transaction_id?: string; amount?: number; currency?: string; checkout_reference?: string };

export async function POST(request: NextRequest) {
  const event = await request.json().catch(() => null) as Webhook | null;
  if (!event?.id) return NextResponse.json({ error: 'Evento SumUp inválido.' }, { status: 400 });
  try {
    const response = await sumUpRequest(`/v0.1/checkouts/${encodeURIComponent(event.id)}`);
    const checkout = await response.json().catch(() => ({})) as Checkout;
    if (!response.ok || !checkout.id) return NextResponse.json({ error: 'Não foi possível confirmar o checkout na SumUp.' }, { status: 400 });

    const db = createAdminClient();
    if (checkout.status === 'PAID') {
      const { data: paymentLink } = await db
        .from('finance_payment_links')
        .select('id,status,account_id,sale_id,contact_id,amount,currency,description')
        .eq('provider', 'sumup')
        .eq('external_session_id', checkout.id)
        .maybeSingle();
      // SumUp may retry a webhook. A paid link has already produced the
      // payment, receipt notification and customer email.
      if (paymentLink?.status === 'paid') return NextResponse.json({ received: true });
      const { error } = await db.rpc('confirm_external_payment_link', {
        p_provider: 'sumup',
        p_external_session_id: checkout.id,
        p_external_payment_intent_id: checkout.transaction_id ?? null,
        p_payload: { event_type: event.event_type ?? null, status: checkout.status, amount: checkout.amount, currency: checkout.currency, checkout_reference: checkout.checkout_reference },
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      if (paymentLink?.account_id && paymentLink.contact_id) {
        const [{ data: account }, { data: contact }, { data: portal }] = await Promise.all([
          db.from('accounts').select('name,logo_url').eq('id', paymentLink.account_id).maybeSingle(),
          db.from('contacts').select('name,email').eq('id', paymentLink.contact_id).maybeSingle(),
          db.from('client_portal_settings').select('slug,enabled').eq('account_id', paymentLink.account_id).maybeSingle(),
        ]);
        const business = account?.name || 'RP Instituto de Beleza';
        const clientName = contact?.name || 'Cliente';
        const amount = new Intl.NumberFormat('pt-PT', {
          style: 'currency',
          currency: paymentLink.currency || 'EUR',
        }).format(Number(paymentLink.amount));
        const portalUrl = getPublicUrl('/portal?tab=finance', new URL(request.url).origin);
        const receiptText = `O pagamento de ${amount} foi confirmado. Pode consultar e descarregar o seu recibo no Portal do Cliente.`;

        try {
          if (portal?.enabled !== false) {
            await db.from('portal_notifications').insert({
              account_id: paymentLink.account_id,
              contact_id: paymentLink.contact_id,
              type: 'payment',
              title: 'Pagamento confirmado',
              body: receiptText,
              action_tab: 'finance',
              metadata: {
                sale_id: paymentLink.sale_id,
                payment_link_id: paymentLink.id,
                provider: 'sumup',
              },
            });
          }
        } catch (notificationError) {
          console.error('[sumup-webhook] portal notification failed:', notificationError);
        }
        try {
          if (contact?.email) {
            await sendLocalEmail({
              to: contact.email,
              profile: 'finance',
              subject: `${business} · Pagamento confirmado`,
              text: `Olá, ${clientName}.\n\nRecebemos o seu pagamento de ${amount}. A sua compra está confirmada.\n\n${paymentLink.description || 'Compra'}\n\nConsulte ou descarregue o recibo: ${portalUrl}\n\nAté breve,\n${business}`,
              html: brandedEmail({
                businessName: business,
                logoUrl: account?.logo_url,
                eyebrow: 'Pagamento confirmado',
                preheader: `Recebemos o seu pagamento de ${amount}.`,
                title: 'A sua compra está confirmada',
                greeting: `Olá, ${clientName}.`,
                message: 'Obrigado. O pagamento foi recebido com sucesso e o seu recibo já está disponível no Portal do Cliente.',
                details: [
                  { label: 'Compra', value: paymentLink.description || 'Pagamento online' },
                  { label: 'Método', value: 'Pagamento online SumUp' },
                ],
                highlight: { label: 'Valor pago', value: amount },
                action: { label: 'Ver recibo e compra', url: portalUrl },
                notice: 'Se esta compra incluir um voucher ou pack, receberá também a respetiva confirmação e acesso assim que for emitido.',
              }),
            });
          }
        } catch (emailError) {
          console.error('[sumup-webhook] confirmation email failed:', emailError);
        }
        if (paymentLink.sale_id) {
          const origin = new URL(request.url).origin;
          const headers = {
            'Content-Type': 'application/json',
            'x-internal-payment-key': process.env.SUMUP_API_KEY || '',
          };
          const deliveryResults = await Promise.allSettled([
            fetch(`${origin}/api/finance/vouchers/deliver`, {
              method: 'POST', headers, body: JSON.stringify({ saleId: paymentLink.sale_id }),
            }),
            fetch(`${origin}/api/finance/packs/deliver`, {
              method: 'POST', headers, body: JSON.stringify({ saleId: paymentLink.sale_id }),
            }),
          ]);
          deliveryResults.forEach((result, index) => {
            if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.ok))
              console.error(`[sumup-webhook] ${index === 0 ? 'voucher' : 'pack'} delivery failed`, result);
          });
        }
        try {
          await notifyAccountEvent({
            accountId: paymentLink.account_id,
            type: 'sumup_payment_received',
            category: 'finance',
            priority: 'high',
            title: 'Pagamento online SumUp recebido',
            body: `${clientName} pagou ${amount}${paymentLink.description ? ` · ${paymentLink.description}` : ''}.`,
            actionUrl: paymentLink.sale_id
              ? `/finance?tab=sales#sale-${paymentLink.sale_id}`
              : '/finance?tab=sales',
            contactId: paymentLink.contact_id,
            dedupeKey: `sumup-payment-received:${paymentLink.id}`,
            metadata: {
              saleId: paymentLink.sale_id,
              paymentLinkId: paymentLink.id,
              amount: paymentLink.amount,
              currency: paymentLink.currency,
              provider: 'sumup',
            },
          });
        } catch (accountNotificationError) {
          console.error('[sumup-webhook] CRM notification failed:', accountNotificationError);
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao validar webhook SumUp.' }, { status: 500 });
  }
}
