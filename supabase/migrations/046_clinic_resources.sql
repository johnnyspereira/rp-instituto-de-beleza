-- ============================================================
-- 046_clinic_resources.sql
--
-- Moves clinic operations toward a proper backoffice model:
--   * team members can be marked as bookable professionals;
--   * rooms/resources can be configured and assigned to appointments;
--   * products can be configured separately from services.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_professional BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS professional_title TEXT,
  ADD COLUMN IF NOT EXISTS professional_color TEXT NOT NULL DEFAULT '#7c3aed';

CREATE TABLE IF NOT EXISTS clinic_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#0ea5e9',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_rooms_account_active
  ON clinic_rooms(account_id, is_active, name);

ALTER TABLE clinic_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_rooms_select ON clinic_rooms;
DROP POLICY IF EXISTS clinic_rooms_insert ON clinic_rooms;
DROP POLICY IF EXISTS clinic_rooms_update ON clinic_rooms;
DROP POLICY IF EXISTS clinic_rooms_delete ON clinic_rooms;

CREATE POLICY clinic_rooms_select ON clinic_rooms FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY clinic_rooms_insert ON clinic_rooms FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY clinic_rooms_update ON clinic_rooms FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY clinic_rooms_delete ON clinic_rooms FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON clinic_rooms;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinic_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clinic_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_products_account_active
  ON clinic_products(account_id, is_active, name);

ALTER TABLE clinic_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_products_select ON clinic_products;
DROP POLICY IF EXISTS clinic_products_insert ON clinic_products;
DROP POLICY IF EXISTS clinic_products_update ON clinic_products;
DROP POLICY IF EXISTS clinic_products_delete ON clinic_products;

CREATE POLICY clinic_products_select ON clinic_products FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY clinic_products_insert ON clinic_products FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY clinic_products_update ON clinic_products FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY clinic_products_delete ON clinic_products FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON clinic_products;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinic_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE clinic_appointments
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES clinic_rooms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_appointments_room
  ON clinic_appointments(room_id, scheduled_start);
