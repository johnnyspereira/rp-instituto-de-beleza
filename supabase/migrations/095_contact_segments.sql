-- Reusable contact audience segments for broadcast targeting.

CREATE TABLE IF NOT EXISTS contact_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_segments_account_name
  ON contact_segments(account_id, lower(name));

ALTER TABLE contact_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view contact segments" ON contact_segments;
CREATE POLICY "Members can view contact segments"
  ON contact_segments FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS "Agents can create contact segments" ON contact_segments;
CREATE POLICY "Agents can create contact segments"
  ON contact_segments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent') AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Agents can update contact segments" ON contact_segments;
CREATE POLICY "Agents can update contact segments"
  ON contact_segments FOR UPDATE
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Admins can delete contact segments" ON contact_segments;
CREATE POLICY "Admins can delete contact segments"
  ON contact_segments FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON contact_segments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON contact_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contact_segments;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
