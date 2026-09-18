-- Isolate Portal 360 identities from CRM team identities.
-- Clients still type their real email, but authentication uses an internal,
-- dedicated Supabase Auth identity that can never change a staff password.

ALTER TABLE client_portal_access
  ADD COLUMN IF NOT EXISTS portal_auth_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS client_portal_access_portal_auth_email_idx
  ON client_portal_access(LOWER(portal_auth_email))
  WHERE portal_auth_email IS NOT NULL;

COMMENT ON COLUMN client_portal_access.portal_auth_email IS
  'Internal login identity for Portal 360. Never expose this alias to clients.';

NOTIFY pgrst, 'reload schema';
