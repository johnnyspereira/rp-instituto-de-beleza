-- Automated appointment confirmation and clinical anamnesis.

CREATE TABLE IF NOT EXISTS clinic_communication_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  clinic_address TEXT,
  directions TEXT,
  parking_info TEXT,
  payment_methods TEXT NOT NULL DEFAULT 'MB Way ou numerário',
  anamnesis_intro TEXT NOT NULL DEFAULT
    'O preenchimento é rápido e confidencial e ajuda-nos a personalizar o atendimento com segurança.',
  confirmation_reminder_hours INTEGER NOT NULL DEFAULT 24
    CHECK (confirmation_reminder_hours BETWEEN 1 AND 168),
  auto_send_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  auto_send_pending_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO clinic_communication_settings(account_id)
SELECT id FROM accounts ON CONFLICT(account_id) DO NOTHING;

ALTER TABLE clinic_communication_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_communication_settings_read ON clinic_communication_settings;
CREATE POLICY clinic_communication_settings_read ON clinic_communication_settings FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS clinic_communication_settings_manage ON clinic_communication_settings;
CREATE POLICY clinic_communication_settings_manage ON clinic_communication_settings FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON clinic_communication_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinic_communication_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clinic_anamnesis_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES clinic_appointments(id) ON DELETE SET NULL,
  service_id UUID REFERENCES clinic_services(id) ON DELETE SET NULL,
  public_token UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'reviewed', 'expired', 'revoked')),
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  birth_date DATE,
  selected_modalities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  answers JSONB NOT NULL DEFAULT '{}'::JSONB,
  health_consent BOOLEAN NOT NULL DEFAULT FALSE,
  privacy_consent BOOLEAN NOT NULL DEFAULT FALSE,
  signature_name TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS clinic_anamnesis_appointment_unique
  ON clinic_anamnesis_forms(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS clinic_anamnesis_contact_idx
  ON clinic_anamnesis_forms(account_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS clinic_anamnesis_pending_idx
  ON clinic_anamnesis_forms(account_id, status, expires_at);

ALTER TABLE clinic_anamnesis_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_anamnesis_members_read ON clinic_anamnesis_forms;
CREATE POLICY clinic_anamnesis_members_read ON clinic_anamnesis_forms FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS clinic_anamnesis_agents_manage ON clinic_anamnesis_forms;
CREATE POLICY clinic_anamnesis_agents_manage ON clinic_anamnesis_forms FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON clinic_anamnesis_forms;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinic_anamnesis_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE clinic_appointments
  ADD COLUMN IF NOT EXISTS confirmation_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anamnesis_form_id UUID REFERENCES clinic_anamnesis_forms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clinic_appointments_pending_confirmation_due_idx
  ON clinic_appointments(confirmation_requested_at, confirmation_reminder_sent_at)
  WHERE confirmation_status = 'pending' AND confirmation_reminder_sent_at IS NULL;

NOTIFY pgrst, 'reload schema';
