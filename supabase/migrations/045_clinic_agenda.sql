-- ============================================================
-- 045_clinic_agenda.sql
--
-- Foundation for the vertical clinic module:
--   * clinic_services: service/procedure catalogue with duration,
--     price, colour, and active flag.
--   * clinic_appointments: internal agenda rows linked to contacts,
--     services and team members.
--
-- RLS mirrors the account-sharing model:
--   * every account member can read;
--   * services are settings-class and require admin+ to modify;
--   * appointments are operational and require agent+ to modify.
-- ============================================================

CREATE TABLE IF NOT EXISTS clinic_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  color TEXT NOT NULL DEFAULT '#7c3aed',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_services_account_active
  ON clinic_services(account_id, is_active, name);

ALTER TABLE clinic_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_services_select ON clinic_services;
DROP POLICY IF EXISTS clinic_services_insert ON clinic_services;
DROP POLICY IF EXISTS clinic_services_update ON clinic_services;
DROP POLICY IF EXISTS clinic_services_delete ON clinic_services;

CREATE POLICY clinic_services_select ON clinic_services FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY clinic_services_insert ON clinic_services FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY clinic_services_update ON clinic_services FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY clinic_services_delete ON clinic_services FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON clinic_services;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinic_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clinic_appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  service_id UUID REFERENCES clinic_services(id) ON DELETE SET NULL,
  professional_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'confirmed',
    'completed',
    'cancelled',
    'no_show'
  )),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN (
    'manual',
    'public_link',
    'whatsapp',
    'automation'
  )),
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  notes TEXT,
  confirmation_sent_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX IF NOT EXISTS idx_clinic_appointments_account_start
  ON clinic_appointments(account_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_clinic_appointments_contact
  ON clinic_appointments(contact_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_appointments_professional
  ON clinic_appointments(professional_profile_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_clinic_appointments_status
  ON clinic_appointments(account_id, status, scheduled_start);

ALTER TABLE clinic_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_appointments_select ON clinic_appointments;
DROP POLICY IF EXISTS clinic_appointments_insert ON clinic_appointments;
DROP POLICY IF EXISTS clinic_appointments_update ON clinic_appointments;
DROP POLICY IF EXISTS clinic_appointments_delete ON clinic_appointments;

CREATE POLICY clinic_appointments_select ON clinic_appointments FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY clinic_appointments_insert ON clinic_appointments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY clinic_appointments_update ON clinic_appointments FOR UPDATE
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY clinic_appointments_delete ON clinic_appointments FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON clinic_appointments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinic_appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
