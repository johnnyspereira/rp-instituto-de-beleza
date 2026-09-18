import { NextResponse, type NextRequest } from 'next/server';

import { getStripeClient, toStripeAmount } from '@/lib/finance/stripe';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    saleId?: string;
  } | null;
  const saleId = body?.saleId;

  if (!saleId) {
    return NextResponse.json({ error: 'saleId is required' }, { status: 400 });
  }

  const { data: sale, error: saleError } = await supabase
    .from('finance_sales')
    .select('*, contact:contacts(*)')
    .eq('id', saleId)
    .single();

  if (saleError || !sale) {
    return NextResponse.json(
      { error: saleError?.message || 'Sale not found' },
      { status: 404 }
    );
  }

  const amount = Number(sale.balance_due ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: 'This sale has no pending balance.' },
      { status: 400 }
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const currency = String(sale.currency || 'EUR').toUpperCase();
  const description = `Cobrança da venda #${sale.sale_number}`;

  const { data: link, error: linkError } = await supabase
    .from('finance_payment_links')
    .insert({
      account_id: sale.account_id,
      sale_id: sale.id,
      contact_id: sale.contact_id ?? null,
      provider: 'stripe',
      status: 'pending',
      amount,
      currency,
      description,
      external_reference: `sale-${sale.id}`,
      created_by_user_id: user.id,
    })
    .select('*')
    .single();

  if (linkError || !link) {
    return NextResponse.json(
      { error: linkError?.message || 'Could not create payment link.' },
      { status: 500 }
    );
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${origin}/business-hub?payment=success&sale=${sale.id}`,
      cancel_url: `${origin}/business-hub?payment=cancelled&sale=${sale.id}`,
      customer_email: sale.contact?.email || undefined,
      client_reference_id: link.id,
      metadata: {
        account_id: sale.account_id,
        sale_id: sale.id,
        payment_link_id: link.id,
      },
      payment_intent_data: {
        metadata: {
          account_id: sale.account_id,
          sale_id: sale.id,
          payment_link_id: link.id,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toStripeAmount(amount, currency),
            product_data: {
              name: description,
              description:
                sale.contact?.name || sale.contact?.phone || 'Cliente CRM',
            },
          },
        },
      ],
    });

    const { data: updated, error: updateError } = await supabase
      .from('finance_payment_links')
      .update({
        payment_url: session.url,
        external_session_id: session.id,
        external_payment_intent_id:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
        provider_payload: {
          checkout_session_id: session.id,
          mode: session.mode,
        },
      })
      .eq('id', link.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || 'Could not save Stripe session.' },
        { status: 500 }
      );
    }

    await supabase.from('business_integration_settings').upsert(
      {
        account_id: sale.account_id,
        category: 'payments',
        provider: 'stripe',
        display_name: 'Stripe',
        status: 'active',
        connected_at: new Date().toISOString(),
        config: {
          mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')
            ? 'live'
            : 'test',
        },
      },
      { onConflict: 'account_id,category,provider' }
    );

    return NextResponse.json({ paymentLink: updated, checkoutUrl: session.url });
  } catch (error) {
    await supabase
      .from('finance_payment_links')
      .update({
        status: 'failed',
        provider_payload: {
          error: error instanceof Error ? error.message : 'Stripe error',
        },
      })
      .eq('id', link.id);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not create Stripe checkout.',
      },
      { status: 500 }
    );
  }
}
