-- Finance integrity: transactional cash register, lifecycle audit and reversals.

ALTER TABLE finance_vouchers DROP CONSTRAINT IF EXISTS finance_vouchers_status_check;
ALTER TABLE finance_vouchers ADD CONSTRAINT finance_vouchers_status_check
  CHECK (status IN ('pending', 'active', 'used', 'expired', 'cancelled'));

ALTER TABLE finance_client_packs DROP CONSTRAINT IF EXISTS finance_client_packs_status_check;
ALTER TABLE finance_client_packs ADD CONSTRAINT finance_client_packs_status_check
  CHECK (status IN ('pending', 'active', 'consumed', 'expired', 'cancelled'));

ALTER TABLE finance_sales
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS finance_cash_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  cash_session_id UUID NOT NULL REFERENCES finance_cash_sessions(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'deposit', 'withdrawal', 'expense', 'refund', 'adjustment'
  )),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  reference TEXT,
  sale_id UUID REFERENCES finance_sales(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES finance_payments(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_cash_movements_session_idx
  ON finance_cash_movements(cash_session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS finance_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'sale', 'payment', 'cash_session', 'cash_movement', 'voucher', 'pack', 'wallet'
  )),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_audit_account_date_idx
  ON finance_audit_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_audit_entity_idx
  ON finance_audit_events(entity_type, entity_id, created_at DESC);

ALTER TABLE finance_cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_cash_movements_select ON finance_cash_movements;
CREATE POLICY finance_cash_movements_select ON finance_cash_movements FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS finance_cash_movements_manage ON finance_cash_movements;
CREATE POLICY finance_cash_movements_manage ON finance_cash_movements FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS finance_audit_events_select ON finance_audit_events;
CREATE POLICY finance_audit_events_select ON finance_audit_events FOR SELECT
  USING (is_account_member(account_id));

CREATE OR REPLACE FUNCTION finance_asset_initial_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'finance_vouchers' THEN
    IF NEW.issued_sale_id IS NULL THEN RETURN NEW; END IF;
    SELECT status INTO v_status FROM finance_sales WHERE id = NEW.issued_sale_id;
  ELSE
    IF NEW.sale_id IS NULL THEN RETURN NEW; END IF;
    SELECT status INTO v_status FROM finance_sales WHERE id = NEW.sale_id;
  END IF;
  NEW.status := CASE WHEN v_status = 'paid' THEN 'active' ELSE 'pending' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_voucher_initial_status_trigger ON finance_vouchers;
CREATE TRIGGER finance_voucher_initial_status_trigger
  BEFORE INSERT ON finance_vouchers FOR EACH ROW EXECUTE FUNCTION finance_asset_initial_status();
DROP TRIGGER IF EXISTS finance_pack_initial_status_trigger ON finance_client_packs;
CREATE TRIGGER finance_pack_initial_status_trigger
  BEFORE INSERT ON finance_client_packs FOR EACH ROW EXECUTE FUNCTION finance_asset_initial_status();

CREATE OR REPLACE FUNCTION sync_finance_assets_after_payment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE finance_vouchers SET status = 'active', updated_at = NOW()
    WHERE issued_sale_id = NEW.id AND status = 'pending';
    UPDATE finance_client_packs SET status = 'active'
    WHERE sale_id = NEW.id AND status = 'pending';
    IF NEW.appointment_id IS NOT NULL THEN
      UPDATE clinic_appointments SET paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
      WHERE id = NEW.appointment_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_finance_assets_after_payment_trigger ON finance_sales;
CREATE TRIGGER sync_finance_assets_after_payment_trigger
  AFTER UPDATE OF status ON finance_sales FOR EACH ROW
  EXECUTE FUNCTION sync_finance_assets_after_payment();

CREATE OR REPLACE FUNCTION prevent_duplicate_appointment_sale()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.appointment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM finance_sales
    WHERE account_id = NEW.account_id
      AND appointment_id = NEW.appointment_id
      AND status NOT IN ('voided', 'refunded')
  ) THEN
    RAISE EXCEPTION 'This appointment already has an active sale';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_appointment_sale_trigger ON finance_sales;
CREATE TRIGGER prevent_duplicate_appointment_sale_trigger
  BEFORE INSERT ON finance_sales FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_appointment_sale();

CREATE UNIQUE INDEX IF NOT EXISTS finance_sales_active_appointment_unique
  ON finance_sales(account_id, appointment_id)
  WHERE appointment_id IS NOT NULL AND status NOT IN ('voided', 'refunded');

CREATE OR REPLACE FUNCTION audit_finance_sale_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO finance_audit_events(account_id, entity_type, entity_id, action, actor_user_id, metadata)
    VALUES(NEW.account_id, 'sale', NEW.id, 'created', auth.uid(), jsonb_build_object(
      'status', NEW.status, 'total', NEW.total_amount, 'paid', NEW.paid_amount
    ));
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO finance_audit_events(account_id, entity_type, entity_id, action, actor_user_id, reason, metadata)
    VALUES(NEW.account_id, 'sale', NEW.id, 'status_changed', auth.uid(),
      COALESCE(NEW.refund_reason, NEW.void_reason),
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'paid', NEW.paid_amount));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_finance_sale_status_trigger ON finance_sales;
CREATE TRIGGER audit_finance_sale_status_trigger
  AFTER INSERT OR UPDATE OF status ON finance_sales FOR EACH ROW
  EXECUTE FUNCTION audit_finance_sale_status();

CREATE OR REPLACE FUNCTION audit_finance_payment_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO finance_audit_events(account_id, entity_type, entity_id, action, actor_user_id, metadata)
  VALUES(NEW.account_id, 'payment', NEW.id, 'received', NEW.received_by_user_id,
    jsonb_build_object('sale_id', NEW.sale_id, 'method', NEW.method, 'amount', NEW.amount));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_finance_payment_insert_trigger ON finance_payments;
CREATE TRIGGER audit_finance_payment_insert_trigger
  AFTER INSERT ON finance_payments FOR EACH ROW EXECUTE FUNCTION audit_finance_payment_insert();

CREATE OR REPLACE FUNCTION get_finance_cash_snapshot(p_cash_session_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_session finance_cash_sessions;
  v_cash_received NUMERIC(12,2);
  v_deposits NUMERIC(12,2);
  v_outflows NUMERIC(12,2);
BEGIN
  SELECT * INTO v_session FROM finance_cash_sessions WHERE id = p_cash_session_id;
  IF NOT FOUND OR NOT is_account_member(v_session.account_id) THEN
    RAISE EXCEPTION 'Cash session not found';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_received
  FROM finance_payments
  WHERE cash_session_id = v_session.id AND method = 'cash'
    AND status IN ('confirmed', 'refunded');
  SELECT COALESCE(SUM(amount), 0) INTO v_deposits
  FROM finance_cash_movements
  WHERE cash_session_id = v_session.id AND movement_type IN ('deposit', 'adjustment');
  SELECT COALESCE(SUM(amount), 0) INTO v_outflows
  FROM finance_cash_movements
  WHERE cash_session_id = v_session.id AND movement_type IN ('withdrawal', 'expense', 'refund');
  RETURN jsonb_build_object(
    'opening_amount', v_session.opening_amount,
    'cash_received', v_cash_received,
    'deposits', v_deposits,
    'outflows', v_outflows,
    'expected_amount', v_session.opening_amount + v_cash_received + v_deposits - v_outflows
  );
END;
$$;

CREATE OR REPLACE FUNCTION open_finance_cash_session(
  p_opening_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS finance_cash_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_account_id UUID; v_result finance_cash_sessions;
BEGIN
  SELECT account_id INTO v_account_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_account_id IS NULL OR NOT is_account_member(v_account_id, 'agent') THEN
    RAISE EXCEPTION 'Not authorised to open the cash register';
  END IF;
  IF COALESCE(p_opening_amount, -1) < 0 THEN RAISE EXCEPTION 'Invalid opening amount'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_account_id::TEXT), hashtext('finance_cash'));
  IF EXISTS (SELECT 1 FROM finance_cash_sessions WHERE account_id = v_account_id AND status = 'open') THEN
    RAISE EXCEPTION 'The cash register is already open';
  END IF;
  INSERT INTO finance_cash_sessions(account_id, opened_by_user_id, opening_amount, notes)
  VALUES(v_account_id, auth.uid(), p_opening_amount, NULLIF(BTRIM(p_notes), ''))
  RETURNING * INTO v_result;
  INSERT INTO finance_audit_events(account_id, entity_type, entity_id, action, actor_user_id, metadata)
  VALUES(v_account_id, 'cash_session', v_result.id, 'opened', auth.uid(),
    jsonb_build_object('opening_amount', p_opening_amount));
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION close_finance_cash_session(
  p_cash_session_id UUID,
  p_counted_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS finance_cash_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session finance_cash_sessions; v_snapshot JSONB; v_expected NUMERIC(12,2);
BEGIN
  SELECT * INTO v_session FROM finance_cash_sessions WHERE id = p_cash_session_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_session.account_id, 'agent') THEN
    RAISE EXCEPTION 'Cash session not found';
  END IF;
  IF v_session.status <> 'open' THEN RAISE EXCEPTION 'Cash session is already closed'; END IF;
  IF COALESCE(p_counted_amount, -1) < 0 THEN RAISE EXCEPTION 'Invalid counted amount'; END IF;
  v_snapshot := get_finance_cash_snapshot(v_session.id);
  v_expected := (v_snapshot ->> 'expected_amount')::NUMERIC;
  UPDATE finance_cash_sessions
  SET status = 'closed', closed_by_user_id = auth.uid(),
      closing_counted_amount = p_counted_amount, expected_amount = v_expected,
      difference_amount = p_counted_amount - v_expected,
      notes = CONCAT_WS(E'\n', NULLIF(notes, ''), NULLIF(BTRIM(p_notes), '')),
      closed_at = NOW()
  WHERE id = v_session.id RETURNING * INTO v_session;
  INSERT INTO finance_audit_events(account_id, entity_type, entity_id, action, actor_user_id, metadata)
  VALUES(v_session.account_id, 'cash_session', v_session.id, 'closed', auth.uid(),
    v_snapshot || jsonb_build_object('counted_amount', p_counted_amount, 'difference', p_counted_amount - v_expected));
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION add_finance_cash_movement(
  p_cash_session_id UUID,
  p_movement_type TEXT,
  p_amount NUMERIC,
  p_description TEXT,
  p_reference TEXT DEFAULT NULL
)
RETURNS finance_cash_movements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session finance_cash_sessions; v_result finance_cash_movements;
BEGIN
  SELECT * INTO v_session FROM finance_cash_sessions WHERE id = p_cash_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'open' OR NOT is_account_member(v_session.account_id, 'agent') THEN
    RAISE EXCEPTION 'Open cash session not found';
  END IF;
  IF p_movement_type NOT IN ('deposit', 'withdrawal', 'expense', 'adjustment')
     OR COALESCE(p_amount, 0) <= 0 OR NULLIF(BTRIM(p_description), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid cash movement';
  END IF;
  INSERT INTO finance_cash_movements(
    account_id, cash_session_id, movement_type, amount, description, reference, created_by_user_id
  ) VALUES (
    v_session.account_id, v_session.id, p_movement_type, p_amount,
    BTRIM(p_description), NULLIF(BTRIM(p_reference), ''), auth.uid()
  ) RETURNING * INTO v_result;
  INSERT INTO finance_audit_events(account_id, entity_type, entity_id, action, actor_user_id, metadata)
  VALUES(v_session.account_id, 'cash_movement', v_result.id, p_movement_type, auth.uid(),
    jsonb_build_object('amount', p_amount, 'cash_session_id', v_session.id));
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION reverse_finance_sale(
  p_sale_id UUID,
  p_mode TEXT,
  p_reason TEXT
)
RETURNS finance_sales LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_sale finance_sales;
  v_payment finance_payments;
  v_item finance_sale_items;
  v_wallet finance_client_wallets;
  v_balance NUMERIC(12,2);
  v_stock INTEGER;
  v_current_cash_session UUID;
BEGIN
  SELECT * INTO v_sale FROM finance_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_sale.account_id, 'agent') THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF p_mode NOT IN ('void', 'refund') OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Mode and reason are required';
  END IF;
  IF v_sale.status IN ('voided', 'refunded') THEN RAISE EXCEPTION 'Sale has already been reversed'; END IF;
  IF p_mode = 'void' AND v_sale.paid_amount > 0 THEN RAISE EXCEPTION 'A sale with payments must be refunded'; END IF;
  IF p_mode = 'refund' AND NOT is_account_member(v_sale.account_id, 'admin') THEN
    RAISE EXCEPTION 'Only administrators can refund payments';
  END IF;
  IF p_mode = 'refund' AND v_sale.paid_amount <= 0 THEN RAISE EXCEPTION 'This sale has no payment to refund'; END IF;

  IF EXISTS (
    SELECT 1 FROM finance_vouchers
    WHERE issued_sale_id = v_sale.id AND (
      status IN ('used', 'expired') OR current_balance < initial_balance
      OR (voucher_type = 'service' AND COALESCE(remaining_uses, 0) < 1)
    )
  ) OR EXISTS (
    SELECT 1 FROM finance_client_packs p
    WHERE p.sale_id = v_sale.id AND EXISTS (
      SELECT 1 FROM finance_client_pack_balances b
      WHERE b.client_pack_id = p.id AND b.used_sessions > 0
    )
  ) THEN
    RAISE EXCEPTION 'A benefit from this sale has already been used';
  END IF;

  IF EXISTS (
    SELECT 1 FROM finance_payments WHERE sale_id = v_sale.id AND method = 'cash' AND status = 'confirmed'
  ) THEN
    SELECT id INTO v_current_cash_session FROM finance_cash_sessions
    WHERE account_id = v_sale.account_id AND status = 'open' FOR UPDATE;
    IF v_current_cash_session IS NULL THEN RAISE EXCEPTION 'Open the cash register to refund a cash payment'; END IF;
  END IF;

  FOR v_payment IN SELECT * FROM finance_payments WHERE sale_id = v_sale.id AND status = 'confirmed' FOR UPDATE LOOP
    IF v_payment.method = 'voucher' THEN
      UPDATE finance_vouchers
      SET current_balance = LEAST(initial_balance, current_balance + v_payment.amount),
          status = 'active', updated_at = NOW()
      WHERE account_id = v_sale.account_id AND UPPER(code) = UPPER(v_payment.reference_code);
    ELSIF v_payment.method = 'client_credit' THEN
      SELECT * INTO v_wallet FROM finance_client_wallets
      WHERE account_id = v_sale.account_id AND contact_id = v_sale.contact_id
        AND currency = v_sale.currency FOR UPDATE;
      IF FOUND THEN
        UPDATE finance_client_wallets SET balance = balance + v_payment.amount, updated_at = NOW()
        WHERE id = v_wallet.id RETURNING balance INTO v_balance;
        INSERT INTO finance_wallet_transactions(
          account_id, wallet_id, transaction_type, amount, balance_after,
          sale_id, performed_by_user_id, description, metadata
        ) VALUES (
          v_sale.account_id, v_wallet.id, 'refund', v_payment.amount, v_balance,
          v_sale.id, auth.uid(), 'Reembolso da venda #' || v_sale.sale_number,
          jsonb_build_object('original_payment_id', v_payment.id)
        );
      END IF;
    ELSIF v_payment.method = 'cash' THEN
      INSERT INTO finance_cash_movements(
        account_id, cash_session_id, movement_type, amount, description,
        sale_id, payment_id, created_by_user_id
      ) VALUES (
        v_sale.account_id, v_current_cash_session, 'refund', v_payment.amount,
        'Reembolso da venda #' || v_sale.sale_number, v_sale.id, v_payment.id, auth.uid()
      );
    END IF;
    UPDATE finance_payments SET status = CASE WHEN p_mode = 'refund' THEN 'refunded' ELSE 'voided' END
    WHERE id = v_payment.id;
  END LOOP;

  FOR v_item IN
    SELECT * FROM finance_sale_items
    WHERE sale_id = v_sale.id AND item_type = 'product'
  LOOP
    UPDATE clinic_products SET stock_quantity = stock_quantity + CEIL(v_item.quantity)::INTEGER, updated_at = NOW()
    WHERE id = v_item.source_id AND account_id = v_sale.account_id
    RETURNING stock_quantity INTO v_stock;
    INSERT INTO finance_stock_movements(account_id, product_id, sale_id, user_id, movement_type, quantity, stock_after)
    VALUES(v_sale.account_id, v_item.source_id, v_sale.id, auth.uid(), 'return', CEIL(v_item.quantity)::INTEGER, v_stock);
  END LOOP;

  UPDATE finance_vouchers SET status = 'cancelled', updated_at = NOW()
  WHERE issued_sale_id = v_sale.id AND status IN ('pending', 'active');
  UPDATE finance_client_packs SET status = 'cancelled'
  WHERE sale_id = v_sale.id AND status IN ('pending', 'active');

  UPDATE finance_sales
  SET status = CASE WHEN p_mode = 'refund' THEN 'refunded' ELSE 'voided' END,
      paid_amount = 0, balance_due = 0,
      voided_at = CASE WHEN p_mode = 'void' THEN NOW() ELSE voided_at END,
      refunded_at = CASE WHEN p_mode = 'refund' THEN NOW() ELSE refunded_at END,
      void_reason = CASE WHEN p_mode = 'void' THEN BTRIM(p_reason) ELSE void_reason END,
      refund_reason = CASE WHEN p_mode = 'refund' THEN BTRIM(p_reason) ELSE refund_reason END,
      reversed_by_user_id = auth.uid(), updated_at = NOW()
  WHERE id = v_sale.id RETURNING * INTO v_sale;

  IF v_sale.appointment_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM finance_sales WHERE appointment_id = v_sale.appointment_id AND status = 'paid')
     AND NOT EXISTS (SELECT 1 FROM finance_appointment_benefits WHERE appointment_id = v_sale.appointment_id AND status = 'consumed') THEN
    UPDATE clinic_appointments SET paid_at = NULL, updated_at = NOW() WHERE id = v_sale.appointment_id;
  END IF;
  RETURN v_sale;
END;
$$;

-- Existing unpaid benefits become unavailable until their sale is settled.
UPDATE finance_vouchers v SET status = 'pending', updated_at = NOW()
FROM finance_sales s
WHERE v.issued_sale_id = s.id AND s.status IN ('open', 'partially_paid')
  AND v.status = 'active' AND v.current_balance = v.initial_balance;
UPDATE finance_client_packs p SET status = 'pending'
FROM finance_sales s
WHERE p.sale_id = s.id AND s.status IN ('open', 'partially_paid')
  AND p.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM finance_client_pack_balances b WHERE b.client_pack_id = p.id AND b.used_sessions > 0);

GRANT EXECUTE ON FUNCTION get_finance_cash_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION open_finance_cash_session(NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION close_finance_cash_session(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_finance_cash_movement(UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_finance_sale(UUID, TEXT, TEXT) TO authenticated;

-- Secure payment entry points. Voucher codes are identifiers; the PIN is the
-- authorisation secret and is validated while the voucher row is locked.
CREATE OR REPLACE FUNCTION create_finance_sale_secure(
  p_contact_id UUID,
  p_appointment_id UUID,
  p_cash_session_id UUID,
  p_currency TEXT,
  p_items JSONB,
  p_payments JSONB DEFAULT '[]'::JSONB,
  p_sale_discount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS finance_sales LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account_id UUID;
  v_payment JSONB;
BEGIN
  SELECT account_id INTO v_account_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_account_id IS NULL OR NOT is_account_member(v_account_id, 'agent') THEN
    RAISE EXCEPTION 'Not authorised to create sales';
  END IF;
  FOR v_payment IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::JSONB))
  LOOP
    IF v_payment->>'method' = 'voucher' AND NOT EXISTS (
      SELECT 1 FROM finance_vouchers
      WHERE account_id = v_account_id
        AND UPPER(code) = UPPER(v_payment->>'reference_code')
        AND pin_code = v_payment->>'pin_code'
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
        AND current_balance >= (v_payment->>'amount')::NUMERIC
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'Voucher code or PIN is invalid';
    END IF;
  END LOOP;
  RETURN create_finance_sale(
    p_contact_id, p_appointment_id, p_cash_session_id, p_currency,
    p_items, p_payments, p_sale_discount, p_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION add_finance_payment_secure(
  p_sale_id UUID,
  p_method TEXT,
  p_amount NUMERIC,
  p_cash_session_id UUID DEFAULT NULL,
  p_reference_code TEXT DEFAULT NULL,
  p_pin_code TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS finance_sales LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale finance_sales;
BEGIN
  SELECT * INTO v_sale FROM finance_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_sale.account_id, 'agent') THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;
  IF p_method = 'voucher' AND NOT EXISTS (
    SELECT 1 FROM finance_vouchers
    WHERE account_id = v_sale.account_id
      AND UPPER(code) = UPPER(p_reference_code)
      AND pin_code = p_pin_code
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
      AND current_balance >= p_amount
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Voucher code or PIN is invalid';
  END IF;
  RETURN add_finance_payment(
    p_sale_id, p_method, p_amount, p_cash_session_id, p_reference_code, p_notes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_finance_sale(UUID, UUID, UUID, TEXT, JSONB, JSONB, NUMERIC, TEXT) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION add_finance_payment(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION create_finance_sale_secure(UUID, UUID, UUID, TEXT, JSONB, JSONB, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_finance_payment_secure(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
