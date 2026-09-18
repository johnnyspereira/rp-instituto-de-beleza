-- Exclusive campaigns published by the backoffice and joined in Portal 360.
CREATE TABLE IF NOT EXISTS portal_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  badge_text TEXT,
  benefit_text TEXT,
  terms TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS portal_campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES portal_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('joined','contacted','converted','cancelled')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS portal_campaigns_account_status_idx ON portal_campaigns(account_id,status,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS portal_campaign_enrollments_campaign_idx ON portal_campaign_enrollments(account_id,campaign_id,joined_at DESC);
ALTER TABLE portal_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_campaign_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_campaigns_staff_select ON portal_campaigns FOR SELECT USING (is_account_member(account_id));
CREATE POLICY portal_campaigns_staff_insert ON portal_campaigns FOR INSERT WITH CHECK (is_account_member(account_id,'agent'));
CREATE POLICY portal_campaigns_staff_update ON portal_campaigns FOR UPDATE USING (is_account_member(account_id,'agent')) WITH CHECK (is_account_member(account_id,'agent'));
CREATE POLICY portal_campaigns_staff_delete ON portal_campaigns FOR DELETE USING (is_account_member(account_id,'admin'));
CREATE POLICY portal_campaign_enrollments_staff_select ON portal_campaign_enrollments FOR SELECT USING (is_account_member(account_id));
CREATE POLICY portal_campaign_enrollments_staff_update ON portal_campaign_enrollments FOR UPDATE USING (is_account_member(account_id,'agent')) WITH CHECK (is_account_member(account_id,'agent'));

CREATE TRIGGER portal_campaigns_updated_at BEFORE UPDATE ON portal_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER portal_campaign_enrollments_updated_at BEFORE UPDATE ON portal_campaign_enrollments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
GRANT SELECT,INSERT,UPDATE,DELETE ON portal_campaigns TO authenticated;
GRANT SELECT,UPDATE ON portal_campaign_enrollments TO authenticated;
NOTIFY pgrst, 'reload schema';
