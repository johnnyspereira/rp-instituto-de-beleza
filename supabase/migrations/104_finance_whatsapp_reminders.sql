ALTER TABLE finance_reminder_settings
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;

ALTER TABLE finance_reminder_settings DROP CONSTRAINT IF EXISTS finance_reminder_settings_whatsapp_phone_check;
ALTER TABLE finance_reminder_settings ADD CONSTRAINT finance_reminder_settings_whatsapp_phone_check
  CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^\+?[1-9][0-9]{6,14}$');

CREATE TABLE IF NOT EXISTS finance_reminder_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL UNIQUE REFERENCES notifications(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  whatsapp_message_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS finance_reminder_deliveries_due_idx ON finance_reminder_deliveries(status,next_attempt_at)
  WHERE status IN ('pending','failed');
ALTER TABLE finance_reminder_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_reminder_deliveries_owner_select ON finance_reminder_deliveries;
CREATE POLICY finance_reminder_deliveries_owner_select ON finance_reminder_deliveries FOR SELECT
  USING (is_account_member(account_id,'owner'));
GRANT SELECT ON finance_reminder_deliveries TO authenticated;
NOTIFY pgrst, 'reload schema';
