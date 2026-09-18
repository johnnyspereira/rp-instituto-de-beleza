-- Universal benefit codes for agenda redemption.
-- A gift voucher or pack can be redeemed by a different contact than its buyer.

ALTER TABLE finance_client_packs
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS pin_code TEXT;

UPDATE finance_client_packs
SET code = 'PCK-' || UPPER(SUBSTRING(REPLACE(id::TEXT, '-', '') FROM 1 FOR 10))
WHERE code IS NULL;

UPDATE finance_client_packs
SET pin_code = LPAD(FLOOR(RANDOM() * 1000000)::INTEGER::TEXT, 6, '0')
WHERE pin_code IS NULL;

ALTER TABLE finance_client_packs ALTER COLUMN code SET NOT NULL;
ALTER TABLE finance_client_packs ALTER COLUMN pin_code SET NOT NULL;
ALTER TABLE finance_client_packs DROP CONSTRAINT IF EXISTS finance_client_packs_pin_code_check;
ALTER TABLE finance_client_packs ADD CONSTRAINT finance_client_packs_pin_code_check
  CHECK (pin_code ~ '^[0-9]{4,8}$');
CREATE UNIQUE INDEX IF NOT EXISTS finance_client_packs_account_code
  ON finance_client_packs(account_id, UPPER(code));

CREATE OR REPLACE FUNCTION prepare_finance_client_pack_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.code := UPPER(COALESCE(NULLIF(TRIM(NEW.code), ''),
    'PCK-' || SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 10)));
  NEW.pin_code := COALESCE(NULLIF(TRIM(NEW.pin_code), ''),
    LPAD(FLOOR(RANDOM() * 1000000)::INTEGER::TEXT, 6, '0'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_finance_client_pack_code_trigger ON finance_client_packs;
CREATE TRIGGER prepare_finance_client_pack_code_trigger
  BEFORE INSERT ON finance_client_packs
  FOR EACH ROW EXECUTE FUNCTION prepare_finance_client_pack_code();

CREATE OR REPLACE FUNCTION lookup_finance_benefit_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_account_id UUID;
  v_voucher finance_vouchers;
  v_pack finance_client_packs;
  v_pack_name TEXT;
  v_total INTEGER;
  v_remaining INTEGER;
BEGIN
  SELECT account_id INTO v_account_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_account_id IS NULL OR NOT is_account_member(v_account_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT * INTO v_voucher FROM finance_vouchers
  WHERE account_id = v_account_id
    AND UPPER(code) = UPPER(TRIM(p_code))
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (current_balance > 0 OR COALESCE(remaining_uses, 0) > 0)
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_voucher.id,
      'kind', 'voucher',
      'voucher_type', v_voucher.voucher_type,
      'code', v_voucher.code,
      'label', CASE WHEN v_voucher.voucher_type = 'service'
        THEN 'Voucher de modalidade' ELSE 'Cartão presente' END,
      'balance', v_voucher.current_balance,
      'currency', v_voucher.currency,
      'remaining_uses', v_voucher.remaining_uses,
      'service_id', v_voucher.service_id,
      'expires_at', v_voucher.expires_at,
      'requires_pin', TRUE
    );
  END IF;

  SELECT p, c.name INTO v_pack, v_pack_name
  FROM finance_client_packs p
  JOIN finance_pack_catalog c ON c.id = p.pack_id
  WHERE p.account_id = v_account_id
    AND UPPER(p.code) = UPPER(TRIM(p_code))
    AND p.status = 'active'
    AND (p.expires_at IS NULL OR p.expires_at > NOW())
  LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(SUM(total_sessions), 0), COALESCE(SUM(remaining_sessions), 0)
    INTO v_total, v_remaining
    FROM finance_client_pack_balances WHERE client_pack_id = v_pack.id;
    RETURN jsonb_build_object(
      'id', v_pack.id,
      'kind', 'pack',
      'code', v_pack.code,
      'label', v_pack_name,
      'total_sessions', v_total,
      'remaining_sessions', v_remaining,
      'expires_at', v_pack.expires_at,
      'requires_pin', TRUE
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_appointment_benefit_code(
  p_appointment_id UUID,
  p_code TEXT,
  p_pin TEXT
)
RETURNS finance_appointment_benefits
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_appointment clinic_appointments;
  v_voucher finance_vouchers;
  v_pack finance_client_packs;
  v_balance finance_client_pack_balances;
  v_result finance_appointment_benefits;
  v_reserved_amount NUMERIC(12,2);
  v_reserved_sessions INTEGER;
  v_voucher_found BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_appointment FROM clinic_appointments
  WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_appointment.account_id, 'agent') THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
  IF v_appointment.contact_id IS NULL THEN RAISE EXCEPTION 'Appointment requires a client'; END IF;

  SELECT * INTO v_voucher FROM finance_vouchers
  WHERE account_id = v_appointment.account_id
    AND UPPER(code) = UPPER(TRIM(p_code))
    AND pin_code = TRIM(p_pin)
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
  FOR UPDATE;
  v_voucher_found := FOUND;

  UPDATE finance_appointment_benefits
  SET status = 'released', released_at = NOW(), updated_at = NOW()
  WHERE appointment_id = p_appointment_id AND status = 'reserved';

  IF v_voucher_found THEN
    IF v_voucher.voucher_type = 'service' AND (
      v_voucher.service_id IS DISTINCT FROM v_appointment.service_id
      OR COALESCE(v_voucher.remaining_uses, 0) < 1
    ) THEN RAISE EXCEPTION 'Voucher is not valid for this service'; END IF;

    IF v_voucher.voucher_type = 'service' THEN
      v_reserved_amount := v_appointment.price;
    ELSE
      SELECT COALESCE(SUM(reserved_amount), 0) INTO v_reserved_amount
      FROM finance_appointment_benefits
      WHERE voucher_id = v_voucher.id AND status = 'reserved';
      v_reserved_amount := LEAST(v_appointment.price, v_voucher.current_balance - v_reserved_amount);
      IF v_reserved_amount <= 0 THEN RAISE EXCEPTION 'Voucher has no available balance'; END IF;
    END IF;

    INSERT INTO finance_appointment_benefits (
      account_id, appointment_id, contact_id, benefit_type, voucher_id,
      service_id, reserved_amount, created_by_user_id
    ) VALUES (
      v_appointment.account_id, v_appointment.id, v_appointment.contact_id,
      'voucher', v_voucher.id, v_appointment.service_id, v_reserved_amount, auth.uid()
    ) RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  SELECT * INTO v_pack FROM finance_client_packs
  WHERE account_id = v_appointment.account_id
    AND UPPER(code) = UPPER(TRIM(p_code))
    AND pin_code = TRIM(p_pin)
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid benefit code or PIN'; END IF;

  SELECT * INTO v_balance FROM finance_client_pack_balances
  WHERE client_pack_id = v_pack.id AND service_id = v_appointment.service_id
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
    'pack', v_pack.id, v_balance.id, v_appointment.service_id, 1, auth.uid()
  ) RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_finance_benefit_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reserve_appointment_benefit_code(UUID, TEXT, TEXT) TO authenticated;

-- Make the new RPCs immediately visible to PostgREST after the migration.
NOTIFY pgrst, 'reload schema';
