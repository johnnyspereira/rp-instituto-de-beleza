import { NextResponse, type NextRequest } from 'next/server';

import { sumUpRequest } from '@/lib/finance/sumup';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await createClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { id } = await params;
  const { data: link, error } = await session
    .from('finance_payment_links')
    .select('id,provider,status,external_session_id')
    .eq('id', id)
    .single();
  if (error || !link)
    return NextResponse.json({ error: error?.message || 'Cobrança não encontrada.' }, { status: 404 });
  if (link.status === 'paid')
    return NextResponse.json({ error: 'Uma cobrança paga não pode ser cancelada.' }, { status: 409 });
  if (['cancelled', 'expired'].includes(link.status))
    return NextResponse.json({ paymentLink: link });

  if (link.provider === 'sumup' && link.external_session_id) {
    const response = await sumUpRequest(
      `/v0.1/checkouts/${encodeURIComponent(link.external_session_id)}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { message?: string };
      return NextResponse.json(
        { error: payload.message || 'A SumUp não permitiu cancelar este checkout.' },
        { status: 502 }
      );
    }
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('finance_payment_links')
    .update({ status: 'cancelled', payment_url: null })
    .eq('id', link.id);
  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ cancelled: true });
}
