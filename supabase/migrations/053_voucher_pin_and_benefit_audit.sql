-- Gift cards, service vouchers, PIN validation and complete benefit audit.

ALTER TABLE finance_vouchers
  ADD COLUMN IF NOT EXISTS voucher_type TEXT NOT NULL DEFAULT 'gift_card',
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES clinic_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pin_code TEXT,
  ADD COLUMN IF NOT EXISTS remaining_uses INTEGER;

ALTER TABLE finance_vouchers DROP CONSTRAINT IF EXISTS finance_vouchers_voucher_type_check;
ALTER TABLE finance_vouchers ADD CONSTRAINT finance_vouchers_voucher_type_check
  CHECK (voucher_type IN ('gift_card', 'service'));
ALTER TABLE finance_vouchers DROP CONSTRAINT IF EXISTS finance_vouchers_pin_code_check;
ALTER TABLE finance_vouchers ADD CONSTRAINT finance_vouchers_pin_code_check
  CHECK (pin_code IS NULL OR pin_code ~ '^[0-9]{4,8}$');
UPDATE finance_vouchers
SET pin_code = LPAD(FLOOR(RANDOM() * 1000000)::INTEGER::TEXT, 6, '0')
WHERE pin_code IS NULL;
ALTER TABLE finance_vouchers ALTER COLUMN pin_code SET NOT NULL;

CREATE TABLE IF NOT EXISTS finance_benefit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  voucher_id UUID REFERENCES finance_vouchers(id) ON DELETE CASCADE,
  client_pack_id UUID REFERENCES finance_client_packs(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES clinic_appointments(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'issued', 'reserved', 'used', 'released', 'cancelled', 'adjusted'
  )),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  performed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name TEXT,
  approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_name TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((voucher_id IS NOT NULL) <> (client_pack_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS finance_benefit_logs_voucher
  ON finance_benefit_logs(voucher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_benefit_logs_pack
  ON finance_benefit_logs(client_pack_id, created_at DESC);
ALTER TABLE finance_benefit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_benefit_logs_select ON finance_benefit_logs;
DROP POLICY IF EXISTS finance_benefit_logs_insert ON finance_benefit_logs;
CREATE POLICY finance_benefit_logs_select ON finance_benefit_logs
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY finance_benefit_logs_insert ON finance_benefit_logs
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

INSERT INTO finance_benefit_logs (
  account_id, voucher_id, action, amount, performed_by_name, approved_by_name,
  metadata, created_at
)
SELECT v.account_id, v.id, 'issued', v.initial_balance, 'Migração', 'Migração',
  jsonb_build_object('source', 'existing_data'), v.created_at
FROM finance_vouchers v
WHERE NOT EXISTS (
  SELECT 1 FROM finance_benefit_logs l
  WHERE l.voucher_id = v.id AND l.action = 'issued'
);

INSERT INTO finance_benefit_logs (
  account_id, client_pack_id, action, performed_by_name, approved_by_name,
  metadata, created_at
)
SELECT p.account_id, p.id, 'issued', 'Migração', 'Migração',
  jsonb_build_object('source', 'existing_data'), p.created_at
FROM finance_client_packs p
WHERE NOT EXISTS (
  SELECT 1 FROM finance_benefit_logs l
  WHERE l.client_pack_id = p.id AND l.action = 'issued'
);

CREATE OR REPLACE FUNCTION finance_actor_name(p_user_id UUID)
RETURNS TEXT LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT COALESCE(full_name, email, 'Utilizador')
  FROM profiles WHERE user_id = p_user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION prepare_finance_voucher()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_metadata JSONB;
BEGIN
  SELECT metadata INTO v_metadata FROM finance_sale_items
  WHERE sale_id = NEW.issued_sale_id AND item_type = 'voucher'
  ORDER BY created_at DESC LIMIT 1;
  NEW.voucher_type := COALESCE(NULLIF(v_metadata->>'voucher_type', ''), 'gift_card');
  NEW.service_id := NULLIF(v_metadata->>'service_id', '')::UUID;
  NEW.pin_code := COALESCE(
    NULLIF(v_metadata->>'pin_code', ''),
    LPAD(FLOOR(RANDOM() * 1000000)::INTEGER::TEXT, 6, '0')
  );
  NEW.remaining_uses := CASE WHEN NEW.voucher_type = 'service' THEN 1 ELSE NULL END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_finance_voucher_trigger ON finance_vouchers;
CREATE TRIGGER prepare_finance_voucher_trigger
  BEFORE INSERT ON finance_vouchers
  FOR EACH ROW EXECUTE FUNCTION prepare_finance_voucher();

CREATE OR REPLACE FUNCTION log_finance_benefit_issuance()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_user UUID; v_name TEXT;
BEGIN
  v_user := auth.uid();
  v_name := finance_actor_name(v_user);
  IF TG_TABLE_NAME = 'finance_vouchers' THEN
    INSERT INTO finance_benefit_logs (
      account_id, voucher_id, action, amount, performed_by_user_id,
      performed_by_name, approved_by_user_id, approved_by_name, metadata
    ) VALUES (
      NEW.account_id, NEW.id, 'issued', NEW.initial_balance, v_user,
      v_name, v_user, v_name, jsonb_build_object('source', 'pos')
    );
  ELSE
    INSERT INTO finance_benefit_logs (
      account_id, client_pack_id, action, performed_by_user_id,
      performed_by_name, approved_by_user_id, approved_by_name, metadata
    ) VALUES (
      NEW.account_id, NEW.id, 'issued', v_user, v_name, v_user, v_name,
      jsonb_build_object('source', 'pos')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_voucher_issuance ON finance_vouchers;
CREATE TRIGGER log_voucher_issuance AFTER INSERT ON finance_vouchers
  FOR EACH ROW EXECUTE FUNCTION log_finance_benefit_issuance();
DROP TRIGGER IF EXISTS log_pack_issuance ON finance_client_packs;
CREATE TRIGGER log_pack_issuance AFTER INSERT ON finance_client_packs
  FOR EACH ROW EXECUTE FUNCTION log_finance_benefit_issuance();

CREATE OR REPLACE FUNCTION audit_appointment_benefit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_user UUID; v_name TEXT; v_action TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  v_action := CASE NEW.status
    WHEN 'reserved' THEN 'reserved'
    WHEN 'consumed' THEN 'used'
    ELSE 'released'
  END;
  v_user := auth.uid();
  v_name := finance_actor_name(v_user);
  INSERT INTO finance_benefit_logs (
    account_id, voucher_id, client_pack_id, appointment_id, action,
    amount, sessions, performed_by_user_id, performed_by_name,
    approved_by_user_id, approved_by_name, metadata
  ) VALUES (
    NEW.account_id, NEW.voucher_id, NEW.client_pack_id, NEW.appointment_id,
    v_action, NEW.reserved_amount, NEW.reserved_sessions, v_user, v_name,
    CASE WHEN NEW.status = 'consumed' THEN v_user ELSE NULL END,
    CASE WHEN NEW.status = 'consumed' THEN v_name ELSE NULL END,
    jsonb_build_object('benefit_id', NEW.id, 'service_id', NEW.service_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_appointment_benefit_trigger ON finance_appointment_benefits;
CREATE TRIGGER audit_appointment_benefit_trigger
  AFTER INSERT OR UPDATE OF status ON finance_appointment_benefits
  FOR EACH ROW EXECUTE FUNCTION audit_appointment_benefit();

CREATE OR REPLACE FUNCTION reserve_appointment_voucher(
  p_appointment_id UUID,
  p_code TEXT,
  p_pin TEXT
)
RETURNS finance_appointment_benefits
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_appointment clinic_appointments; v_voucher finance_vouchers; v_result finance_appointment_benefits;
BEGIN
  SELECT * INTO v_appointment FROM clinic_appointments
  WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_appointment.account_id, 'agent') THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
  SELECT * INTO v_voucher FROM finance_vouchers
  WHERE account_id = v_appointment.account_id
    AND UPPER(code) = UPPER(TRIM(p_code))
    AND pin_code = TRIM(p_pin)
    AND owner_contact_id = v_appointment.contact_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid voucher code or PIN'; END IF;
  IF v_voucher.voucher_type = 'service' AND (
    v_voucher.service_id IS DISTINCT FROM v_appointment.service_id
    OR COALESCE(v_voucher.remaining_uses, 0) < 1
  ) THEN
    RAISE EXCEPTION 'Voucher is not valid for this service';
  END IF;
  SELECT * INTO v_result
  FROM set_appointment_benefit(p_appointment_id, 'voucher', v_voucher.id);
  RETURN v_result;
END;
$$;

-- Service vouchers are consumed by use count; gift cards by balance.
CREATE OR REPLACE FUNCTION settle_appointment_benefit(
  p_appointment_id UUID,
  p_action TEXT
)
RETURNS finance_appointment_benefits
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_benefit finance_appointment_benefits; v_voucher finance_vouchers;
BEGIN
  SELECT * INTO v_benefit FROM finance_appointment_benefits
  WHERE appointment_id = p_appointment_id AND status = 'reserved' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT is_account_member(v_benefit.account_id, 'agent') THEN RAISE EXCEPTION 'Benefit not found'; END IF;
  IF p_action = 'release' THEN
    UPDATE finance_appointment_benefits SET status='released', released_at=NOW(), updated_at=NOW()
    WHERE id=v_benefit.id RETURNING * INTO v_benefit;
    RETURN v_benefit;
  END IF;
  IF p_action <> 'consume' THEN RAISE EXCEPTION 'Invalid settlement action'; END IF;
  IF v_benefit.benefit_type = 'voucher' THEN
    SELECT * INTO v_voucher FROM finance_vouchers WHERE id=v_benefit.voucher_id FOR UPDATE;
    IF v_voucher.voucher_type = 'service' THEN
      UPDATE finance_vouchers SET remaining_uses=remaining_uses-1,
        status=CASE WHEN remaining_uses-1=0 THEN 'used' ELSE 'active' END,
        current_balance=CASE WHEN remaining_uses-1=0 THEN 0 ELSE current_balance END,
        updated_at=NOW()
      WHERE id=v_voucher.id AND remaining_uses >= 1;
    ELSE
      UPDATE finance_vouchers SET current_balance=current_balance-v_benefit.reserved_amount,
        status=CASE WHEN current_balance-v_benefit.reserved_amount=0 THEN 'used' ELSE 'active' END,
        updated_at=NOW()
      WHERE id=v_voucher.id AND current_balance >= v_benefit.reserved_amount;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Voucher is no longer available'; END IF;
  ELSE
    UPDATE finance_client_pack_balances SET used_sessions=used_sessions+v_benefit.reserved_sessions,
      remaining_sessions=remaining_sessions-v_benefit.reserved_sessions
    WHERE id=v_benefit.client_pack_balance_id AND remaining_sessions >= v_benefit.reserved_sessions;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pack is no longer available'; END IF;
    IF NOT EXISTS (SELECT 1 FROM finance_client_pack_balances WHERE client_pack_id=v_benefit.client_pack_id AND remaining_sessions>0) THEN
      UPDATE finance_client_packs SET status='consumed' WHERE id=v_benefit.client_pack_id;
    END IF;
  END IF;
  UPDATE finance_appointment_benefits SET status='consumed', consumed_at=NOW(), updated_at=NOW()
  WHERE id=v_benefit.id RETURNING * INTO v_benefit;
  UPDATE clinic_appointments SET paid_at=COALESCE(paid_at,NOW()), updated_at=NOW() WHERE id=p_appointment_id;
  RETURN v_benefit;
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_appointment_voucher(UUID, TEXT, TEXT) TO authenticated;
