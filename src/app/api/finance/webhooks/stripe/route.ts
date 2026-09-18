import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';

import { getStripeClient, getStripeWebhookSecret } from '@/lib/finance/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Stripe signature.' },
      { status: 400 }
    );
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    event = getStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret()
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid Stripe webhook signature.',
      },
      { status: 400 }
    );
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status === 'paid') {
      const db = createAdminClient();
      const { error } = await db.rpc('confirm_external_payment_link', {
        p_provider: 'stripe',
        p_external_session_id: session.id,
        p_external_payment_intent_id:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
        p_payload: {
          event_id: event.id,
          payment_status: session.payment_status,
          amount_total: session.amount_total,
          currency: session.currency,
          customer_email: session.customer_details?.email,
          metadata: session.metadata,
        },
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    const db = createAdminClient();
    await db
      .from('finance_payment_links')
      .update({
        status: 'expired',
        provider_payload: {
          event_id: event.id,
          payment_status: session.payment_status,
          amount_total: session.amount_total,
          currency: session.currency,
          metadata: session.metadata,
        },
      })
      .eq('provider', 'stripe')
      .eq('external_session_id', session.id)
      .neq('status', 'paid');
  }

  return NextResponse.json({ received: true });
}
