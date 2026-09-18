-- Connect agenda appointments to vouchers and client packs.
-- Benefits are reserved first, then consumed or released explicitly.

CREATE TABLE IF NOT EXISTS finance_appointment_benefits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES clinic_appointments(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  benefit_type TEXT NOT NULL CHECK (benefit_type IN ('voucher', 'pack')),
  voucher_id UUID REFERENCES finance_vouchers(id) ON DELETE RESTRICT,
  client_pack_id UUID REFERENCES finance_client_packs(id) ON DELETE RESTRICT,
  client_pack_balance_id UUID REFERENCES finance_client_pack_balances(id) ON DELETE RESTRICT,
  service_id UUID REFERENCES clinic_services(id) ON DELETE SET NULL,
  reserved_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  reserved_sessions INTEGER NOT NULL DEFAULT 0 CHECK (reserved_sessions >= 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'released')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (benefit_type = 'voucher' AND voucher_id IS NOT NULL AND client_pack_id IS NULL AND client_pack_balance_id IS NULL)
    OR
    (benefit_type = 'pack' AND voucher_id IS NULL AND client_pack_id IS NOT NULL AND client_pack_balance_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_appointment_one_active_benefit
  ON finance_appointment_benefits(appointment_id)
  WHERE status IN ('reserved', 'consumed');
CREATE INDEX IF NOT EXISTS finance_appointment_benefits_contact
  ON finance_appointment_benefits(contact_id, created_at DESC);

ALTER TABLE finance_appointment_benefits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_appointment_benefits_select ON finance_appointment_benefits;
DROP POLICY IF EXISTS finance_appointment_benefits_insert ON finance_appointment_benefits;
DROP POLICY IF EXISTS finance_appointment_benefits_update ON finance_appointment_benefits;
DROP POLICY IF EXISTS finance_appointment_benefits_delete ON finance_appointment_benefits;
CREATE POLICY finance_appointment_benefits_select ON finance_appointment_benefits
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY finance_appointment_benefits_insert ON finance_appointment_benefits
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY finance_appointment_benefits_update ON finance_appointment_benefits
  FOR UPDATE USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY finance_appointment_benefits_delete ON finance_appointment_benefits
  FOR DELETE USING (is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION set_appointment_benefit(
  p_appointment_id UUID,
  p_benefit_type TEXT,
  p_source_id UUID DEFAULT NULL
)
RETURNS finance_appointment_benefits
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_appointment clinic_appointments;
  v_result finance_appointment_benefits;
  v_voucher finance_vouchers;
  v_client_pack finance_client_packs;
  v_balance finance_client_pack_balances;
  v_reserved_amount NUMERIC(12,2);
  v_reserved_sessions INTEGER;
BEGIN
  SELECT * INTO v_appointment FROM clinic_appointments
  WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_appointment.account_id, 'agent') THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
  IF v_appointment.contact_id IS NULL THEN
    RAISE EXCEPTION 'Appointment requires a client';
  END IF;

  UPDATE finance_appointment_benefits
  SET status = 'released', released_at = NOW(), updated_at = NOW()
  WHERE appointment_id = p_appointment_id AND status = 'reserved';

  IF p_benefit_type = 'direct' OR p_source_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_benefit_type = 'voucher' THEN
    SELECT * INTO v_voucher FROM finance_vouchers
    WHERE id = p_source_id
      AND account_id = v_appointment.account_id
      AND owner_contact_id = v_appointment.contact_id
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Voucher unavailable for this client'; END IF;

    SELECT COALESCE(SUM(reserved_amount), 0) INTO v_reserved_amount
    FROM finance_appointment_benefits
    WHERE voucher_id = v_voucher.id AND status = 'reserved';
    v_reserved_amount := LEAST(
      v_appointment.price,
      v_voucher.current_balance - v_reserved_amount
    );
    IF v_reserved_amount <= 0 THEN
      RAISE EXCEPTION 'Voucher has no available balance';
    END IF;

    INSERT INTO finance_appointment_benefits (
      account_id, appointment_id, contact_id, benefit_type, voucher_id,
      service_id, reserved_amount, created_by_user_id
    ) VALUES (
      v_appointment.account_id, v_appointment.id, v_appointment.contact_id,
      'voucher', v_voucher.id, v_appointment.service_id,
      v_reserved_amount, auth.uid()
    ) RETURNING * INTO v_result;
  ELSIF p_benefit_type = 'pack' THEN
    SELECT * INTO v_client_pack FROM finance_client_packs
    WHERE id = p_source_id
      AND account_id = v_appointment.account_id
      AND contact_id = v_appointment.contact_id
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pack unavailable for this client'; END IF;

    SELECT * INTO v_balance FROM finance_client_pack_balances
    WHERE client_pack_id = v_client_pack.id
      AND service_id = v_appointment.service_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pack does not include this service'; END IF;

    SELECT COALESCE(SUM(reserved_sessions), 0) INTO v_reserved_sessions
    FROM finance_appointment_benefits
    WHERE client_pack_balance_id = v_balance.id AND status = 'reserved';
    IF v_balance.remaining_sessions - v_reserved_sessions < 1 THEN
      RAISE EXCEPTION 'Pack has no available sessions';
    END IF;

    INSERT INTO finance_appointment_benefits (
      account_id, appointment_id, contact_id, benefit_type, client_pack_id,
      client_pack_balance_id, service_id, reserved_sessions, created_by_user_id
    ) VALUES (
      v_appointment.account_id, v_appointment.id, v_appointment.contact_id,
      'pack', v_client_pack.id, v_balance.id, v_appointment.service_id, 1,
      auth.uid()
    ) RETURNING * INTO v_result;
  ELSE
    RAISE EXCEPTION 'Invalid appointment benefit type';
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION settle_appointment_benefit(
  p_appointment_id UUID,
  p_action TEXT
)
RETURNS finance_appointment_benefits
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_benefit finance_appointment_benefits;
  v_remaining INTEGER;
BEGIN
  SELECT * INTO v_benefit FROM finance_appointment_benefits
  WHERE appointment_id = p_appointment_id AND status = 'reserved'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT is_account_member(v_benefit.account_id, 'agent') THEN
    RAISE EXCEPTION 'Appointment benefit not found';
  END IF;

  IF p_action = 'release' THEN
    UPDATE finance_appointment_benefits
    SET status = 'released', released_at = NOW(), updated_at = NOW()
    WHERE id = v_benefit.id RETURNING * INTO v_benefit;
    RETURN v_benefit;
  END IF;
  IF p_action <> 'consume' THEN RAISE EXCEPTION 'Invalid settlement action'; END IF;

  IF v_benefit.benefit_type = 'voucher' THEN
    UPDATE finance_vouchers
    SET current_balance = current_balance - v_benefit.reserved_amount,
      status = CASE WHEN current_balance - v_benefit.reserved_amount = 0 THEN 'used' ELSE 'active' END,
      updated_at = NOW()
    WHERE id = v_benefit.voucher_id
      AND current_balance >= v_benefit.reserved_amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'Voucher balance changed and is insufficient'; END IF;
  ELSE
    UPDATE finance_client_pack_balances
    SET used_sessions = used_sessions + v_benefit.reserved_sessions,
      remaining_sessions = remaining_sessions - v_benefit.reserved_sessions
    WHERE id = v_benefit.client_pack_balance_id
      AND remaining_sessions >= v_benefit.reserved_sessions
    RETURNING remaining_sessions INTO v_remaining;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pack balance changed and is insufficient'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM finance_client_pack_balances
      WHERE client_pack_id = v_benefit.client_pack_id AND remaining_sessions > 0
    ) THEN
      UPDATE finance_client_packs SET status = 'consumed'
      WHERE id = v_benefit.client_pack_id;
    END IF;
  END IF;

  UPDATE finance_appointment_benefits
  SET status = 'consumed', consumed_at = NOW(), updated_at = NOW()
  WHERE id = v_benefit.id RETURNING * INTO v_benefit;
  UPDATE clinic_appointments SET paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
  WHERE id = p_appointment_id;
  RETURN v_benefit;
END;
$$;

GRANT EXECUTE ON FUNCTION set_appointment_benefit(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION settle_appointment_benefit(UUID, TEXT) TO authenticated;
