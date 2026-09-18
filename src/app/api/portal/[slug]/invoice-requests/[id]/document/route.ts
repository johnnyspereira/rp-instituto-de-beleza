import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const { data: invoice } = await admin
      .from('finance_invoice_requests')
      .select('invoice_document_path,invoice_file_name,status')
      .eq('id', id)
      .eq('account_id', access.account_id)
      .eq('contact_id', access.contact_id)
      .eq('status', 'issued')
      .maybeSingle();
    if (!invoice?.invoice_document_path) {
      return Response.json(
        { error: 'Documento ainda não disponível.' },
        { status: 404 }
      );
    }
    const { data, error } = await admin.storage
      .from('finance-invoices')
      .createSignedUrl(invoice.invoice_document_path, 60, {
        download: invoice.invoice_file_name || 'fatura.pdf',
      });
    if (error || !data?.signedUrl)
      throw error || new Error('Signed URL unavailable');
    return Response.redirect(data.signedUrl, 302);
  } catch (error) {
    return portalErrorResponse(error);
  }
}
