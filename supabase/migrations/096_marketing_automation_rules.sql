-- Marketing automation rules for recurring WhatsApp campaigns.

CREATE TABLE IF NOT EXISTS marketing_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('birthday', 'inactivity')),
  days_before INTEGER NOT NULL DEFAULT 0 CHECK (days_before >= 0 AND days_before <= 30),
  inactivity_days INTEGER NOT NULL DEFAULT 30 CHECK (inactivity_days >= 1 AND inactivity_days <= 730),
  send_time TIME NOT NULL DEFAULT '09:00',
  message_text TEXT NOT NULL CHECK (char_length(btrim(message_text)) > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_automation_rules_account
  ON marketing_automation_rules(account_id, is_active, trigger_type);

ALTER TABLE marketing_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view marketing automation rules"
  ON marketing_automation_rules;
CREATE POLICY "Members can view marketing automation rules"
  ON marketing_automation_rules FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS "Agents can create marketing automation rules"
  ON marketing_automation_rules;
CREATE POLICY "Agents can create marketing automation rules"
  ON marketing_automation_rules FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Agents can update marketing automation rules"
  ON marketing_automation_rules;
CREATE POLICY "Agents can update marketing automation rules"
  ON marketing_automation_rules FOR UPDATE
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Agents can delete marketing automation rules"
  ON marketing_automation_rules;
CREATE POLICY "Agents can delete marketing automation rules"
  ON marketing_automation_rules FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON marketing_automation_rules;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON marketing_automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS marketing_automation_dispatch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES marketing_automation_rules(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  run_key TEXT NOT NULL,
  scheduled_message_id UUID REFERENCES scheduled_whatsapp_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_id, contact_id, run_key)
);

CREATE INDEX IF NOT EXISTS idx_marketing_automation_dispatch_account
  ON marketing_automation_dispatch_log(account_id, created_at DESC);

ALTER TABLE marketing_automation_dispatch_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view marketing automation dispatch log"
  ON marketing_automation_dispatch_log;
CREATE POLICY "Members can view marketing automation dispatch log"
  ON marketing_automation_dispatch_log FOR SELECT
  USING (is_account_member(account_id));
