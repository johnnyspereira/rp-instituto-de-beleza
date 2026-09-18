-- Client Portal 360: profile self-service, referrals and auditable activity.

ALTER TABLE client_portal_settings
  ADD COLUMN IF NOT EXISTS profile_edit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS referrals_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Migration 062 introduced the audit function but older installations may not
-- have the trigger. Portal changes must appear in the same client timeline as
-- changes made by the team.
DROP TRIGGER IF EXISTS audit_client_profile_update_trigger ON contacts;
CREATE TRIGGER audit_client_profile_update_trigger
  AFTER UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION audit_client_profile_update();

CREATE INDEX IF NOT EXISTS client_portal_access_contact_idx
  ON client_portal_access(account_id, contact_id);

NOTIFY pgrst, 'reload schema';
