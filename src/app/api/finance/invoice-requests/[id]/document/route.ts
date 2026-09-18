import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

async function authorisedRequest(id: string) {
  const session = await createClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) return { error: 'Não autorizado.', status: 401 } as const;
  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('account_id,account_role')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile || !['owner', 'admin'].includes(profile.account_role)) {
    return { error: 'Sem permissão para gerir faturas.', status: 403 } as const;
  }
  const { data: invoiceRequest } = await admin
    .from('finance_invoice_requests')
    .select('id,account_id,invoice_document_path,invoice_file_name')
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .maybeSingle();
  if (!invoiceRequest)
    return { error: 'Pedido não encontrado.', status: 404 } as const;
  return { admin, profile, user: auth.user, invoiceRequest };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorisedRequest(id);
  if ('error' in auth)
    return Response.json({ error: auth.error }, { status: auth.status });
  if (!auth.invoiceRequest.invoice_document_path) {
    return Response.json({ error: 'Documento não anexado.' }, { status: 404 });
  }
  const { data, error } = await auth.admin.storage
    .from('finance-invoices')
    .createSignedUrl(auth.invoiceRequest.invoice_document_path, 60, {
      download: auth.invoiceRequest.invoice_file_name || 'fatura.pdf',
    });
  if (error || !data?.signedUrl)
    return Response.json(
      { error: error?.message || 'Documento indisponível.' },
      { status: 500 }
    );
  return Response.redirect(data.signedUrl, 302);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorisedRequest(id);
  if ('error' in auth)
    return Response.json({ error: auth.error }, { status: auth.status });
  const { admin, profile, user, invoiceRequest } = auth;

  const form = await request.formData();
  const file = form.get('file');
  const invoiceNumber = String(form.get('invoiceNumber') || '').trim();
  const notes = String(form.get('notes') || '').trim();
  if (
    !(file instanceof File) ||
    file.type !== 'application/pdf' ||
    file.size > MAX_PDF_BYTES
  ) {
    return Response.json(
      { error: 'Anexe um PDF com até 10 MB.' },
      { status: 400 }
    );
  }
  if (!invoiceNumber)
    return Response.json(
      { error: 'Informe o número da fatura.' },
      { status: 400 }
    );

  const safeName =
    file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'fatura.pdf';
  const path = `${profile.account_id}/${invoiceRequest.id}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await admin.storage
    .from('finance-invoices')
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadError)
    return Response.json({ error: uploadError.message }, { status: 500 });

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from('finance_invoice_requests')
    .update({
      status: 'issued',
      invoice_number: invoiceNumber.slice(0, 120),
      invoice_document_url: null,
      invoice_document_path: path,
      invoice_file_name: safeName,
      invoice_file_size: file.size,
      invoice_uploaded_at: now,
      admin_notes: notes.slice(0, 1000) || null,
      handled_by_user_id: user.id,
      processing_at: now,
      completed_at: now,
    })
    .eq('id', invoiceRequest.id);
  if (updateError) {
    await admin.storage.from('finance-invoices').remove([path]);
    return Response.json({ error: updateError.message }, { status: 500 });
  }
  if (invoiceRequest.invoice_document_path) {
    await admin.storage
      .from('finance-invoices')
      .remove([invoiceRequest.invoice_document_path]);
  }
  return Response.json({ ok: true });
}
