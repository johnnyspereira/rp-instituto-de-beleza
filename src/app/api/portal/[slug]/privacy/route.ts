import {
  PortalError,
  portalErrorResponse,
  requirePortalAccess,
} from '@/lib/portal/server';
import { notifyAccountEvent } from '@/lib/notifications/account-events';

const TYPES = new Set([
  'access',
  'rectification',
  'erasure',
  'restriction',
  'objection',
  'portability',
  'withdraw_consent',
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const { data, error } = await admin
      .from('privacy_data_subject_requests')
      .select('id,request_type,status,due_at,resolved_at,created_at')
      .eq('account_id', access.account_id)
      .eq('contact_id', access.contact_id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return Response.json({ requests: data ?? [] });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const body = (await request.json()) as {
      requestType?: string;
      details?: string;
    };
    if (!body.requestType || !TYPES.has(body.requestType))
      throw new PortalError('Selecione um direito válido.', 400);
    const { data: contact } = await admin
      .from('contacts')
      .select('name,email')
      .eq('id', access.contact_id)
      .eq('account_id', access.account_id)
      .single();
    const due = new Date();
    due.setMonth(due.getMonth() + 1);
    const { data, error } = await admin
      .from('privacy_data_subject_requests')
      .insert({
        id: crypto.randomUUID(),
        account_id: access.account_id,
        contact_id: access.contact_id,
        request_type: body.requestType,
        requester_name: contact?.name,
        requester_email: contact?.email,
        details:
          String(body.details || '')
            .trim()
            .slice(0, 5000) || null,
        source: 'client_portal',
        due_at: due.toISOString(),
      })
      .select('id,request_type,status,due_at,created_at')
      .single();
    if (error) throw error;
    await notifyAccountEvent({
      accountId: access.account_id,
      type: 'system',
      category: 'system',
      priority: 'high',
      title: `Novo pedido RGPD: ${body.requestType}`,
      body: `${contact?.name || contact?.email || 'Um cliente'} exerceu um direito de privacidade no Portal 360.`,
      actionUrl: '/settings?tab=privacy',
      contactId: access.contact_id,
      dedupeKey: `privacy-request:${data.id}`,
      metadata: { privacyRequestId: data.id, requestType: body.requestType },
    });
    return Response.json({ request: data }, { status: 201 });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
