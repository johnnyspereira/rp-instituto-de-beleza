import { NextResponse, type NextRequest } from 'next/server';

import {
  issueFiscalDocument,
  supportedFiscalProvider,
} from '@/lib/finance/fiscal-providers';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createClient } from '@/lib/supabase/server';
import type { FinanceInvoiceRequest } from '@/types';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('account_id,account_role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile || !['owner', 'admin'].includes(profile.account_role)) {
    return NextResponse.json(
      { error: 'Sem permissão para emitir faturas.' },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
  };
  const requestedProvider = body.provider;

  const { data: invoiceRequest, error: invoiceError } = await admin
    .from('finance_invoice_requests')
    .select('*, sale:finance_sales(*, items:finance_sale_items(*)), contact:contacts(*)')
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .maybeSingle();

  if (invoiceError || !invoiceRequest) {
    return NextResponse.json(
      { error: invoiceError?.message || 'Pedido não encontrado.' },
      { status: 404 }
    );
  }

  const { data: integrations } = await admin
    .from('business_integration_settings')
    .select('*')
    .eq('account_id', profile.account_id)
    .eq('category', 'fiscal')
    .in('status', ['configured', 'active']);

  const configured =
    (requestedProvider
      ? integrations?.find((item) => item.provider === requestedProvider)
      : integrations?.find((item) => item.provider !== 'manual_fiscal') ??
        integrations?.find((item) => item.provider === 'manual_fiscal')) ?? null;

  if (!configured || !supportedFiscalProvider(configured.provider)) {
    return NextResponse.json(
      {
        error:
          'Configure Vendus, Moloni, InvoiceXpress ou Faturação manual na Central antes de emitir.',
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  try {
    await admin
      .from('finance_invoice_requests')
      .update({
        status: 'processing',
        fiscal_provider: configured.provider,
        fiscal_status: 'sent',
        fiscal_error: null,
        fiscal_sent_at: now,
        handled_by_user_id: user.id,
        processing_at: invoiceRequest.processing_at || now,
      })
      .eq('id', id);

    const result = await issueFiscalDocument({
      provider: configured.provider,
      invoiceRequest: invoiceRequest as FinanceInvoiceRequest,
      sale: invoiceRequest.sale,
      config: (configured.config ?? {}) as Record<string, unknown>,
    });

    const issued = result.status === 'issued';
    const documentPayload = {
      account_id: profile.account_id,
      invoice_request_id: invoiceRequest.id,
      sale_id: invoiceRequest.sale_id,
      contact_id: invoiceRequest.contact_id,
      provider: configured.provider,
      document_type: invoiceRequest.fiscal_document_type || 'invoice',
      status: issued ? 'issued' : 'queued',
      external_document_id: result.externalDocumentId,
      document_number: result.documentNumber,
      document_url: result.documentUrl,
      payload: result.payload,
      issued_at: issued ? now : null,
      created_by_user_id: user.id,
    };

    const { error: docError } = await admin
      .from('finance_fiscal_documents')
      .insert(documentPayload);

    if (docError) throw new Error(docError.message);

    const { error: updateError } = await admin
      .from('finance_invoice_requests')
      .update({
        status: issued ? 'issued' : 'processing',
        invoice_number: result.documentNumber,
        invoice_document_url: result.documentUrl,
        fiscal_document_id: result.externalDocumentId,
        fiscal_status: issued ? 'issued' : 'queued',
        fiscal_payload: result.payload,
        fiscal_issued_at: issued ? now : null,
        completed_at: issued ? now : null,
        admin_notes: issued
          ? `Documento emitido via ${configured.display_name}.`
          : `Documento enviado para emissão via ${configured.display_name}.`,
      })
      .eq('id', id);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      ok: true,
      status: issued ? 'issued' : 'queued',
      provider: configured.provider,
      documentNumber: result.documentNumber,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao emitir documento.';
    await admin
      .from('finance_invoice_requests')
      .update({
        fiscal_provider: configured.provider,
        fiscal_status: 'failed',
        fiscal_error: message,
        admin_notes: message,
      })
      .eq('id', id);

    await admin.from('finance_fiscal_documents').insert({
      account_id: profile.account_id,
      invoice_request_id: invoiceRequest.id,
      sale_id: invoiceRequest.sale_id,
      contact_id: invoiceRequest.contact_id,
      provider: configured.provider,
      document_type: invoiceRequest.fiscal_document_type || 'invoice',
      status: 'failed',
      error_message: message,
      payload: {
        invoice_request_id: invoiceRequest.id,
        provider: configured.provider,
      },
      created_by_user_id: user.id,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
