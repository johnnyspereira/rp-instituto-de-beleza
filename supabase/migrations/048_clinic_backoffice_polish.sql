-- ============================================================
-- 048_clinic_backoffice_polish.sql
--
-- Backoffice polish for the clinic agenda:
--   * client/service references for operational lookup;
--   * richer service catalogue flags inspired by clinic backoffices;
--   * professional online-booking profile and working hours;
--   * time blocks to reserve/close slots in the agenda.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS client_reference TEXT;

WITH account_offsets AS (
  SELECT
    account_id,
    COALESCE(
      MAX(
        CASE
          WHEN client_reference ~ '^[0-9]+$' THEN client_reference::INTEGER
          ELSE NULL
        END
      ),
      0
    ) AS offset_value
  FROM contacts
  GROUP BY account_id
),
numbered AS (
  SELECT
    c.id,
    COALESCE(o.offset_value, 0) AS offset_value,
    ROW_NUMBER() OVER (
      PARTITION BY c.account_id
      ORDER BY c.created_at, c.id
    ) AS row_number
  FROM contacts c
  LEFT JOIN account_offsets o ON o.account_id = c.account_id
  WHERE NULLIF(BTRIM(c.client_reference), '') IS NULL
)
UPDATE contacts c
SET client_reference = LPAD((numbered.offset_value + numbered.row_number)::TEXT, 6, '0')
FROM numbered
WHERE c.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_client_reference
  ON contacts(account_id, client_reference)
  WHERE client_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION assign_contact_client_reference()
RETURNS TRIGGER AS $$
DECLARE
  next_ref INTEGER;
BEGIN
  IF NEW.client_reference IS NULL OR BTRIM(NEW.client_reference) = '' THEN
    SELECT COALESCE(
      MAX(
        CASE
          WHEN client_reference ~ '^[0-9]+$' THEN client_reference::INTEGER
          ELSE NULL
        END
      ),
      0
    ) + 1
    INTO next_ref
    FROM contacts
    WHERE account_id = NEW.account_id;

    NEW.client_reference := LPAD(next_ref::TEXT, 6, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_contact_client_reference ON contacts;
CREATE TRIGGER set_contact_client_reference
  BEFORE INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION assign_contact_client_reference();

ALTER TABLE clinic_services
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS online_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS iva_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS commissions_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS collaborators_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS personalize_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS details_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS commission_executant_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_responsible_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

WITH account_offsets AS (
  SELECT
    account_id,
    COALESCE(
      MAX(
        CASE
          WHEN reference ~ '^[0-9]+$' THEN reference::INTEGER
          ELSE NULL
        END
      ),
      0
    ) AS offset_value
  FROM clinic_services
  GROUP BY account_id
),
numbered AS (
  SELECT
    s.id,
    COALESCE(o.offset_value, 0) AS offset_value,
    ROW_NUMBER() OVER (
      PARTITION BY s.account_id
      ORDER BY s.created_at, s.id
    ) AS row_number
  FROM clinic_services s
  LEFT JOIN account_offsets o ON o.account_id = s.account_id
  WHERE NULLIF(BTRIM(s.reference), '') IS NULL
)
UPDATE clinic_services s
SET reference = LPAD((numbered.offset_value + numbered.row_number)::TEXT, 6, '0')
FROM numbered
WHERE s.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_services_account_reference
  ON clinic_services(account_id, reference)
  WHERE reference IS NOT NULL;

CREATE OR REPLACE FUNCTION assign_clinic_service_reference()
RETURNS TRIGGER AS $$
DECLARE
  next_ref INTEGER;
BEGIN
  IF NEW.reference IS NULL OR BTRIM(NEW.reference) = '' THEN
    SELECT COALESCE(
      MAX(
        CASE
          WHEN reference ~ '^[0-9]+$' THEN reference::INTEGER
          ELSE NULL
        END
      ),
      0
    ) + 1
    INTO next_ref
    FROM clinic_services
    WHERE account_id = NEW.account_id;

    NEW.reference := LPAD(next_ref::TEXT, 6, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_clinic_service_reference ON clinic_services;
CREATE TRIGGER set_clinic_service_reference
  BEFORE INSERT ON clinic_services
  FOR EACH ROW
  EXECUTE FUNCTION assign_clinic_service_reference();

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS professional_bio TEXT,
  ADD COLUMN IF NOT EXISTS professional_phone TEXT,
  ADD COLUMN IF NOT EXISTS professional_public_slug TEXT,
  ADD COLUMN IF NOT EXISTS professional_show_online BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS commission_executant_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_responsible_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS working_hours JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS online_booking_blocked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_account_professional_slug
  ON profiles(account_id, professional_public_slug)
  WHERE professional_public_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION set_member_professional_settings(
  p_user_id UUID,
  p_is_professional BOOLEAN,
  p_title TEXT,
  p_color TEXT,
  p_bio TEXT,
  p_phone TEXT,
  p_public_slug TEXT,
  p_show_online BOOLEAN,
  p_commission_executant_percent NUMERIC,
  p_commission_responsible_percent NUMERIC,
  p_working_hours JSONB,
  p_online_booking_blocked BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account UUID;
  v_caller_role account_role_enum;
  v_target_account UUID;
BEGIN
  SELECT account_id, account_role
  INTO v_caller_account, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only account admins can update professional settings'
      USING ERRCODE = '42501';
  END IF;

  SELECT account_id
  INTO v_target_account
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account IS NULL OR v_target_account <> v_caller_account THEN
    RAISE EXCEPTION 'Member not found in your account'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET
    is_professional = p_is_professional,
    professional_title = NULLIF(BTRIM(p_title), ''),
    professional_color = COALESCE(NULLIF(BTRIM(p_color), ''), '#7c3aed'),
    professional_bio = NULLIF(BTRIM(p_bio), ''),
    professional_phone = NULLIF(BTRIM(p_phone), ''),
    professional_public_slug = NULLIF(BTRIM(LOWER(p_public_slug)), ''),
    professional_show_online = p_show_online,
    commission_executant_percent = GREATEST(0, LEAST(100, COALESCE(p_commission_executant_percent, 0))),
    commission_responsible_percent = GREATEST(0, LEAST(100, COALESCE(p_commission_responsible_percent, 0))),
    working_hours = COALESCE(p_working_hours, '{}'::JSONB),
    online_booking_blocked = p_online_booking_blocked
  WHERE user_id = p_user_id
    AND account_id = v_caller_account;
END;
$$;

ALTER FUNCTION set_member_professional_settings(
  UUID,
  BOOLEAN,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  NUMERIC,
  NUMERIC,
  JSONB,
  BOOLEAN
) OWNER TO postgres;
REVOKE ALL ON FUNCTION set_member_professional_settings(
  UUID,
  BOOLEAN,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  NUMERIC,
  NUMERIC,
  JSONB,
  BOOLEAN
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_member_professional_settings(
  UUID,
  BOOLEAN,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  NUMERIC,
  NUMERIC,
  JSONB,
  BOOLEAN
) TO authenticated;

CREATE TABLE IF NOT EXISTS clinic_time_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  professional_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  room_id UUID REFERENCES clinic_rooms(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  is_online_block BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_clinic_time_blocks_account_start
  ON clinic_time_blocks(account_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_clinic_time_blocks_professional
  ON clinic_time_blocks(professional_profile_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_clinic_time_blocks_room
  ON clinic_time_blocks(room_id, starts_at);

ALTER TABLE clinic_time_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_time_blocks_select ON clinic_time_blocks;
DROP POLICY IF EXISTS clinic_time_blocks_insert ON clinic_time_blocks;
DROP POLICY IF EXISTS clinic_time_blocks_update ON clinic_time_blocks;
DROP POLICY IF EXISTS clinic_time_blocks_delete ON clinic_time_blocks;

CREATE POLICY clinic_time_blocks_select ON clinic_time_blocks FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY clinic_time_blocks_insert ON clinic_time_blocks FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY clinic_time_blocks_update ON clinic_time_blocks FOR UPDATE
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY clinic_time_blocks_delete ON clinic_time_blocks FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON clinic_time_blocks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinic_time_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
