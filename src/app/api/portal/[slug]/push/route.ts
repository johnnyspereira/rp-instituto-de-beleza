import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';

type SubscriptionBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const body = (await request
      .json()
      .catch(() => null)) as SubscriptionBody | null;
    if (!body?.endpoint || !body.keys?.p256dh || !body.keys.auth) {
      return Response.json({ error: 'Subscrição inválida.' }, { status: 400 });
    }
    const { error } = await admin.from('push_subscriptions').upsert(
      {
        account_id: access.account_id,
        owner_type: 'portal_contact',
        user_id: null,
        contact_id: access.contact_id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: request.headers.get('user-agent'),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
