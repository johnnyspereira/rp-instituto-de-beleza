import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createPortalAuthClient } from '@/lib/portal/auth';

export class PortalError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export async function requirePortalAccess(slug: string) {
  const sessionClient = await createPortalAuthClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) throw new PortalError('Authentication required', 401);

  const admin = supabaseAdmin();
  const { data: settings } = await admin
    .from('client_portal_settings')
    .select('*')
    .ilike('slug', slug.trim())
    .eq('enabled', true)
    .maybeSingle();
  if (!settings) throw new PortalError('Portal unavailable', 404);

  const { data: access } = await admin
    .from('client_portal_access')
    .select(
      'id,account_id,contact_id,auth_user_id,portal_auth_email,requires_password_change'
    )
    .eq('account_id', settings.account_id)
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!access) throw new PortalError('Client access not linked', 403);
  if (
    !access.portal_auth_email ||
    user.email?.toLowerCase() !== access.portal_auth_email.toLowerCase()
  ) {
    throw new PortalError('Portal identity is not isolated', 403);
  }
  return { admin, sessionClient, user, settings, access };
}

export function portalErrorResponse(error: unknown) {
  const status = error instanceof PortalError ? error.status : 500;
  const message =
    error instanceof PortalError ? error.message : 'Internal server error';
  if (!(error instanceof PortalError)) console.error('[client-portal]', error);
  return Response.json({ error: message }, { status });
}
