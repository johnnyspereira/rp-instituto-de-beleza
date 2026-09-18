import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { buildSubjectDataPackage } from '@/lib/privacy/data-package';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    const db = supabaseAdmin();
    const { data: request } = await db
      .from('privacy_data_subject_requests')
      .select('id,contact_id,identity_verified_at')
      .eq('account_id', ctx.accountId)
      .eq('id', id)
      .single();
    if (!request)
      return Response.json(
        { error: 'Pedido não encontrado.' },
        { status: 404 }
      );
    if (!request.identity_verified_at || !request.contact_id)
      return Response.json(
        { error: 'Confirme a identidade e associe o pedido a um cliente.' },
        { status: 409 }
      );

    const document = await buildSubjectDataPackage(
      db,
      ctx.accountId,
      request.contact_id
    );
    const now = new Date().toISOString();
    await db
      .from('privacy_data_subject_requests')
      .update({ export_generated_at: now })
      .eq('id', id);
    await db.from('privacy_audit_events').insert({
      id: crypto.randomUUID(),
      account_id: ctx.accountId,
      actor_user_id: ctx.userId,
      action: 'dsr_export_generated',
      entity_type: 'data_subject_request',
      entity_id: id,
      metadata: { contact_id: request.contact_id, format: document.format },
    });
    return new Response(JSON.stringify(document, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="pacote-rgpd-${id}.json"`,
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
