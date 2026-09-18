import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const { data, error } = await admin
      .from('support_tickets')
      .select(
        '*,messages:support_ticket_messages(id,body,author_type,created_at)'
      )
      .eq('account_id', access.account_id)
      .eq('contact_id', access.contact_id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return Response.json({ tickets: data ?? [] });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limit = checkRateLimit(
      `portal-support:${request.headers.get('x-forwarded-for') || 'unknown'}`,
      { limit: 12, windowMs: 60_000 }
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const body = (await request.json().catch(() => null)) as {
      ticketId?: string;
      subject?: string;
      message?: string;
      category?: string;
      priority?: string;
    } | null;
    const message = body?.message?.trim() || '';
    if (!message || message.length > 5000)
      return Response.json({ error: 'Mensagem inválida.' }, { status: 400 });
    let ticketId = body?.ticketId;
    if (ticketId) {
      const { data: ticket } = await admin
        .from('support_tickets')
        .select('id')
        .eq('id', ticketId)
        .eq('account_id', access.account_id)
        .eq('contact_id', access.contact_id)
        .maybeSingle();
      if (!ticket)
        return Response.json(
          { error: 'Ticket não encontrado.' },
          { status: 404 }
        );
    } else {
      const subject = body?.subject?.trim() || '';
      if (subject.length < 3 || subject.length > 160)
        return Response.json(
          { error: 'Informe um assunto válido.' },
          { status: 400 }
        );
      const { data, error } = await admin
        .from('support_tickets')
        .insert({
          account_id: access.account_id,
          contact_id: access.contact_id,
          subject,
          category: body?.category || 'general',
          priority: ['low', 'normal', 'high', 'urgent'].includes(
            body?.priority || ''
          )
            ? body?.priority
            : 'normal',
          source: 'portal',
        })
        .select('id')
        .single();
      if (error) throw error;
      ticketId = data.id;
    }
    const { error } = await admin.from('support_ticket_messages').insert({
      ticket_id: ticketId,
      account_id: access.account_id,
      contact_id: access.contact_id,
      author_type: 'client',
      body: message,
    });
    if (error) throw error;
    await admin
      .from('support_tickets')
      .update({ status: 'open', updated_at: new Date().toISOString() })
      .eq('id', ticketId);
    return Response.json({ ok: true, ticketId });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
