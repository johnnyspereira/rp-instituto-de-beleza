import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const { data, error } = await admin
      .from('portal_notifications')
      .select('*')
      .eq('account_id', access.account_id)
      .eq('contact_id', access.contact_id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return Response.json({ notifications: data ?? [] });
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
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      all?: boolean;
    } | null;
    let query = admin
      .from('portal_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('account_id', access.account_id)
      .eq('contact_id', access.contact_id)
      .is('read_at', null);
    if (!body?.all) {
      if (!body?.id)
        return Response.json(
          { error: 'Notificação inválida.' },
          { status: 400 }
        );
      query = query.eq('id', body.id);
    }
    const { error } = await query;
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
