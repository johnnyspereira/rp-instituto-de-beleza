-- Visual library for sales scripts, links and reusable media assets.

CREATE TABLE IF NOT EXISTS message_library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  category TEXT NOT NULL DEFAULT 'Geral',
  item_type TEXT NOT NULL DEFAULT 'text'
    CHECK (item_type IN ('text', 'link', 'image', 'video', 'document', 'audio')),
  content_text TEXT,
  asset_url TEXT,
  caption TEXT,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT message_library_has_content CHECK (
    NULLIF(BTRIM(COALESCE(content_text, '')), '') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(asset_url, '')), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_message_library_items_account_category
  ON message_library_items(account_id, category, title);

CREATE INDEX IF NOT EXISTS idx_message_library_items_account_favorite
  ON message_library_items(account_id, is_favorite, updated_at DESC);

ALTER TABLE message_library_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view message library items"
  ON message_library_items;
CREATE POLICY "Members can view message library items"
  ON message_library_items FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS "Agents can create message library items"
  ON message_library_items;
CREATE POLICY "Agents can create message library items"
  ON message_library_items FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent') AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Agents can update message library items"
  ON message_library_items;
CREATE POLICY "Agents can update message library items"
  ON message_library_items FOR UPDATE
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Admins can delete message library items"
  ON message_library_items;
CREATE POLICY "Admins can delete message library items"
  ON message_library_items FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON message_library_items;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON message_library_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_library_items;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
