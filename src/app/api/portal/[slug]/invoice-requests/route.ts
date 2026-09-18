import {
  PortalError,
  portalErrorResponse,
  requirePortalAccess,
} from '@/lib/portal/server';

function required(value: unknown, label: string, max = 180) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new PortalError(`${label} é obrigatório.`, 400);
  return normalized.slice(0, max);
}

function optional(value: unknown, max = 240) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, settings, access, user } = await requirePortalAccess(slug);
    if (!settings.financial_enabled) {
      throw new PortalError('A área financeira está desativada.', 403);
    }
    const body = (await request.json()) as Record<string, unknown>;
    const saleId = required(body.saleId, 'Venda', 40);
    const { data: sale, error: saleError } = await admin
      .from('finance_sales')
      .select('id,status,paid_amount')
      .eq('id', saleId)
      .eq('account_id', access.account_id)
      .eq('contact_id', access.contact_id)
      .maybeSingle();
    if (saleError) throw saleError;
    if (!sale) throw new PortalError('Venda não encontrada.', 404);
    if (
      ['voided', 'refunded'].includes(sale.status) ||
      Number(sale.paid_amount) <= 0
    ) {
      throw new PortalError(
        'A fatura só pode ser solicitada para uma venda com pagamento.',
        400
      );
    }

    const values = {
      account_id: access.account_id,
      sale_id: sale.id,
      contact_id: access.contact_id,
      requested_by_auth_user_id: user.id,
      status: 'pending',
      fiscal_name: required(body.fiscalName, 'Nome fiscal'),
      tax_id: required(body.taxId, 'NIF', 40),
      email: required(body.email, 'Email', 254).toLowerCase(),
      address_line: optional(body.addressLine),
      postal_code: optional(body.postalCode, 30),
      city: optional(body.city, 120),
      country: optional(body.country, 80) || 'Portugal',
      client_notes: optional(body.notes, 1000),
      invoice_number: null,
      invoice_document_url: null,
      admin_notes: null,
      handled_by_user_id: null,
      processing_at: null,
      completed_at: null,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await admin
      .from('finance_invoice_requests')
      .select('id,status')
      .eq('account_id', access.account_id)
      .eq('sale_id', sale.id)
      .maybeSingle();
    if (existing && !['rejected', 'cancelled'].includes(existing.status)) {
      throw new PortalError(
        'Já existe um pedido de fatura para esta venda.',
        409
      );
    }
    const query = existing
      ? admin
          .from('finance_invoice_requests')
          .update(values)
          .eq('id', existing.id)
      : admin.from('finance_invoice_requests').insert(values);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return Response.json({ request: data }, { status: existing ? 200 : 201 });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const body = (await request.json()) as { requestId?: string };
    if (!body.requestId) throw new PortalError('Pedido não informado.', 400);
    const { data, error } = await admin
      .from('finance_invoice_requests')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', body.requestId)
      .eq('account_id', access.account_id)
      .eq('contact_id', access.contact_id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new PortalError('Este pedido já não pode ser cancelado.', 409);
    return Response.json({ ok: true });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
