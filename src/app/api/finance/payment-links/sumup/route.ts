import { NextResponse, type NextRequest } from 'next/server';
import { getSumUpCredentials, sumUpRequest } from '@/lib/finance/sumup';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type SumUpCheckout = {
  id?: string;
  hosted_checkout_url?: string;
  status?: string;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { saleId?: string } | null;
  if (!body?.saleId) return NextResponse.json({ error: 'saleId é obrigatório.' }, { status: 400 });

  const { data: sale, error: saleError } = await supabase
    .from('finance_sales')
    .select('*, contact:contacts(*)')
    .eq('id', body.saleId)
    .single();
  if (saleError || !sale) return NextResponse.json({ error: saleError?.message || 'Venda não encontrada.' }, { status: 404 });

  const amount = Number(sale.balance_due ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Esta venda não tem valor pendente.' }, { status: 400 });

  const currency = String(sale.currency || 'EUR').toUpperCase();
  // The hosted checkout is customer-facing. Keep its wording professional and
  // discreet: service details remain in the CRM/receipt, never on SumUp.
  const description = 'Prestação de serviços';
  const admin = createAdminClient();
  const { data: link, error: linkError } = await admin
    .from('finance_payment_links')
    .insert({
      account_id: sale.account_id,
      sale_id: sale.id,
      contact_id: sale.contact_id ?? null,
      provider: 'sumup',
      status: 'pending',
      amount,
      currency,
      description,
      external_reference: `sale-${sale.id}`,
      created_by_user_id: user.id,
    })
    .select('*')
    .single();
  if (linkError || !link) return NextResponse.json({ error: linkError?.message || 'Não foi possível criar a cobrança.' }, { status: 500 });

  try {
    const { merchantCode } = getSumUpCredentials();
    const origin = process.env.NEXT_PUBLIC_APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const response = await sumUpRequest('/v0.1/checkouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(amount.toFixed(2)),
        checkout_reference: link.id,
        currency,
        description,
        merchant_code: merchantCode,
        redirect_url: `${origin}/business-hub?payment=sumup`,
        return_url: `${origin}/api/finance/webhooks/sumup`,
        hosted_checkout: { enabled: true },
      }),
    });
    const checkout = await response.json().catch(() => ({})) as SumUpCheckout & { message?: string; param?: string };
    if (!response.ok || !checkout.id || !checkout.hosted_checkout_url) {
      throw new Error(`${checkout.message || 'A SumUp não devolveu um checkout válido.'}${checkout.param ? ` (${checkout.param})` : ''}`);
    }

    const { error: updateError } = await admin
      .from('finance_payment_links')
      .update({
        payment_url: checkout.hosted_checkout_url,
        external_session_id: checkout.id,
        provider_payload: { checkout_status: checkout.status ?? 'PENDING' },
      })
      .eq('id', link.id);
    if (updateError) throw new Error(updateError.message);
    const { data: updated, error: readError } = await admin
      .from('finance_payment_links')
      .select('*')
      .eq('id', link.id)
      .single();
    if (readError || !updated)
      throw new Error(
        readError?.message || 'O checkout foi guardado, mas a cobrança não foi encontrada.'
      );

    await admin.from('business_integration_settings').upsert({
      account_id: sale.account_id,
      category: 'payments',
      provider: 'sumup',
      display_name: 'SumUp',
      status: 'active',
      connected_at: new Date().toISOString(),
      config: { mode: process.env.SUMUP_API_KEY?.startsWith('sumup_test_') ? 'test' : 'live', merchant_code: merchantCode.slice(-4) },
    }, { onConflict: 'account_id,category,provider' });

    return NextResponse.json({ paymentLink: updated, checkoutUrl: checkout.hosted_checkout_url });
  } catch (error) {
    await admin.from('finance_payment_links').update({ status: 'failed', provider_payload: { error: error instanceof Error ? error.message : 'Erro SumUp' } }).eq('id', link.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível criar o checkout SumUp.' }, { status: 500 });
  }
}
