-- One-to-one scheduled WhatsApp messages.

CREATE TABLE IF NOT EXISTS scheduled_whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text')),
  content_text TEXT NOT NULL CHECK (char_length(btrim(content_text)) > 0),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  whatsapp_message_id TEXT,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_whatsapp_messages_account_status_time
  ON scheduled_whatsapp_messages(account_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_whatsapp_messages_contact
  ON scheduled_whatsapp_messages(contact_id, scheduled_at DESC);

ALTER TABLE scheduled_whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view scheduled WhatsApp messages"
  ON scheduled_whatsapp_messages;
CREATE POLICY "Members can view scheduled WhatsApp messages"
  ON scheduled_whatsapp_messages FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS "Agents can create scheduled WhatsApp messages"
  ON scheduled_whatsapp_messages;
CREATE POLICY "Agents can create scheduled WhatsApp messages"
  ON scheduled_whatsapp_messages FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND auth.uid() = user_id
    AND scheduled_at > NOW()
  );

DROP POLICY IF EXISTS "Agents can update scheduled WhatsApp messages"
  ON scheduled_whatsapp_messages;
CREATE POLICY "Agents can update scheduled WhatsApp messages"
  ON scheduled_whatsapp_messages FOR UPDATE
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON scheduled_whatsapp_messages;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON scheduled_whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE scheduled_whatsapp_messages;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
