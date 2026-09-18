-- Complete clinic finance/POS foundation.
-- Sales, split/partial payments, cash sessions, packs, vouchers and stock.

CREATE TABLE IF NOT EXISTS finance_cash_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  opened_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
  closing_counted_amount NUMERIC(12,2),
  expected_amount NUMERIC(12,2),
  difference_amount NUMERIC(12,2),
  notes TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_one_open_cash_session
  ON finance_cash_sessions(account_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS finance_cash_sessions_account_date
  ON finance_cash_sessions(account_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS finance_pack_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  reference TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  validity_days INTEGER NOT NULL DEFAULT 365 CHECK (validity_days > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_pack_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pack_id UUID NOT NULL REFERENCES finance_pack_catalog(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES clinic_services(id) ON DELETE RESTRICT,
  sessions INTEGER NOT NULL CHECK (sessions > 0),
  UNIQUE(pack_id, service_id)
);

CREATE TABLE IF NOT EXISTS finance_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_number BIGINT GENERATED ALWAYS AS IDENTITY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES clinic_appointments(id) ON DELETE SET NULL,
  cash_session_id UUID REFERENCES finance_cash_sessions(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'partially_paid', 'paid', 'voided', 'refunded'
  )),
  currency TEXT NOT NULL DEFAULT 'EUR',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_due NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_sales_account_number
  ON finance_sales(account_id, sale_number);
CREATE INDEX IF NOT EXISTS finance_sales_account_date
  ON finance_sales(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_sales_contact
  ON finance_sales(contact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS finance_sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES finance_sales(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN (
    'service', 'product', 'pack', 'voucher', 'custom'
  )),
  source_id UUID,
  name_snapshot TEXT NOT NULL,
  reference_snapshot TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_sale_items_sale ON finance_sale_items(sale_id);

CREATE TABLE IF NOT EXISTS finance_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES finance_sales(id) ON DELETE CASCADE,
  cash_session_id UUID REFERENCES finance_cash_sessions(id) ON DELETE SET NULL,
  received_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN (
    'cash', 'card', 'mb_way', 'multibanco', 'bank_transfer',
    'voucher', 'client_credit', 'other'
  )),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN (
    'pending', 'confirmed', 'voided', 'refunded'
  )),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference_code TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_payments_sale ON finance_payments(sale_id);
CREATE INDEX IF NOT EXISTS finance_payments_account_date
  ON finance_payments(account_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS finance_vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  issued_sale_id UUID REFERENCES finance_sales(id) ON DELETE SET NULL,
  owner_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  initial_balance NUMERIC(12,2) NOT NULL CHECK (initial_balance > 0),
  current_balance NUMERIC(12,2) NOT NULL CHECK (current_balance >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'used', 'expired', 'cancelled'
  )),
  recipient_name TEXT,
  message TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, code)
);

CREATE INDEX IF NOT EXISTS finance_vouchers_contact
  ON finance_vouchers(owner_contact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS finance_client_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES finance_pack_catalog(id) ON DELETE RESTRICT,
  sale_id UUID REFERENCES finance_sales(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'consumed', 'expired', 'cancelled'
  )),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_client_pack_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_pack_id UUID NOT NULL REFERENCES finance_client_packs(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES clinic_services(id) ON DELETE RESTRICT,
  total_sessions INTEGER NOT NULL CHECK (total_sessions > 0),
  used_sessions INTEGER NOT NULL DEFAULT 0 CHECK (used_sessions >= 0),
  remaining_sessions INTEGER NOT NULL CHECK (remaining_sessions >= 0),
  UNIQUE(client_pack_id, service_id)
);

CREATE TABLE IF NOT EXISTS finance_stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES clinic_products(id) ON DELETE RESTRICT,
  sale_id UUID REFERENCES finance_sales(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'sale', 'return', 'adjustment', 'purchase'
  )),
  quantity INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'finance_cash_sessions', 'finance_pack_catalog', 'finance_pack_items',
    'finance_sales', 'finance_sale_items', 'finance_payments',
    'finance_vouchers', 'finance_client_packs',
    'finance_client_pack_balances', 'finance_stock_movements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- Account-owned tables.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'finance_cash_sessions', 'finance_pack_catalog', 'finance_sales',
    'finance_sale_items', 'finance_payments', 'finance_vouchers',
    'finance_client_packs', 'finance_stock_movements'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_select ON %I FOR SELECT USING (is_account_member(account_id))',
      table_name, table_name
    );
    EXECUTE format(
      'CREATE POLICY %I_insert ON %I FOR INSERT WITH CHECK (is_account_member(account_id, ''agent''))',
      table_name, table_name
    );
    EXECUTE format(
      'CREATE POLICY %I_update ON %I FOR UPDATE USING (is_account_member(account_id, ''agent'')) WITH CHECK (is_account_member(account_id, ''agent''))',
      table_name, table_name
    );
    EXECUTE format(
      'CREATE POLICY %I_delete ON %I FOR DELETE USING (is_account_member(account_id, ''admin''))',
      table_name, table_name
    );
  END LOOP;
END $$;

-- Child tables inherit tenancy through their parent.
DROP POLICY IF EXISTS finance_pack_items_member ON finance_pack_items;
CREATE POLICY finance_pack_items_member ON finance_pack_items FOR ALL USING (
  EXISTS (SELECT 1 FROM finance_pack_catalog p WHERE p.id = pack_id AND is_account_member(p.account_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM finance_pack_catalog p WHERE p.id = pack_id AND is_account_member(p.account_id, 'agent'))
);

DROP POLICY IF EXISTS finance_client_pack_balances_member ON finance_client_pack_balances;
CREATE POLICY finance_client_pack_balances_member ON finance_client_pack_balances FOR ALL USING (
  EXISTS (SELECT 1 FROM finance_client_packs p WHERE p.id = client_pack_id AND is_account_member(p.account_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM finance_client_packs p WHERE p.id = client_pack_id AND is_account_member(p.account_id, 'agent'))
);

CREATE OR REPLACE FUNCTION create_finance_sale(
  p_contact_id UUID,
  p_appointment_id UUID,
  p_cash_session_id UUID,
  p_currency TEXT,
  p_items JSONB,
  p_payments JSONB DEFAULT '[]'::JSONB,
  p_sale_discount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS finance_sales
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_sale finance_sales;
  v_item JSONB;
  v_payment JSONB;
  v_subtotal NUMERIC(12,2) := 0;
  v_item_discount NUMERIC(12,2) := 0;
  v_tax NUMERIC(12,2) := 0;
  v_total NUMERIC(12,2) := 0;
  v_paid NUMERIC(12,2) := 0;
  v_line_base NUMERIC(12,2);
  v_line_tax NUMERIC(12,2);
  v_line_total NUMERIC(12,2);
  v_product_stock INTEGER;
  v_pack finance_pack_catalog;
  v_client_pack_id UUID;
  v_voucher finance_vouchers;
  v_voucher_code TEXT;
BEGIN
  SELECT account_id INTO v_account_id
  FROM profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_account_id IS NULL OR NOT is_account_member(v_account_id, 'agent') THEN
    RAISE EXCEPTION 'Not authorised to create sales';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale requires at least one item';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE((v_item->>'quantity')::NUMERIC, 0) <= 0 OR COALESCE((v_item->>'unit_price')::NUMERIC, -1) < 0 THEN
      RAISE EXCEPTION 'Invalid sale item quantity or price';
    END IF;
    v_line_base := ROUND((v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC, 2);
    IF COALESCE((v_item->>'discount_amount')::NUMERIC, 0) < 0
      OR COALESCE((v_item->>'discount_amount')::NUMERIC, 0) > v_line_base THEN
      RAISE EXCEPTION 'Item discount cannot exceed its line total';
    END IF;
    IF COALESCE((v_item->>'tax_rate')::NUMERIC, 0) < 0
      OR COALESCE((v_item->>'tax_rate')::NUMERIC, 0) > 100 THEN
      RAISE EXCEPTION 'Invalid item tax rate';
    END IF;
    v_item_discount := v_item_discount + COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
    v_tax := v_tax + ROUND(GREATEST(v_line_base - COALESCE((v_item->>'discount_amount')::NUMERIC, 0), 0) * COALESCE((v_item->>'tax_rate')::NUMERIC, 0) / 100, 2);
    v_subtotal := v_subtotal + v_line_base;
  END LOOP;

  p_sale_discount := GREATEST(COALESCE(p_sale_discount, 0), 0);
  IF p_sale_discount + v_item_discount > v_subtotal THEN
    RAISE EXCEPTION 'Discount cannot exceed subtotal';
  END IF;
  v_total := ROUND(v_subtotal - v_item_discount - p_sale_discount + v_tax, 2);

  FOR v_payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::JSONB)) LOOP
    IF COALESCE((v_payment->>'amount')::NUMERIC, 0) <= 0 THEN
      RAISE EXCEPTION 'Payment amount must be positive';
    END IF;
    v_paid := v_paid + (v_payment->>'amount')::NUMERIC;
  END LOOP;
  IF v_paid > v_total THEN RAISE EXCEPTION 'Payments exceed sale total'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_payments, '[]'::JSONB)) payment
    WHERE payment->>'method' = 'cash'
  ) AND NOT EXISTS (
    SELECT 1 FROM finance_cash_sessions
    WHERE id = p_cash_session_id AND account_id = v_account_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'An open cash session is required for cash payments';
  END IF;

  INSERT INTO finance_sales (
    account_id, contact_id, appointment_id, cash_session_id,
    created_by_user_id, status, currency, subtotal, discount_amount,
    tax_amount, total_amount, paid_amount, balance_due, notes, completed_at
  ) VALUES (
    v_account_id, p_contact_id, p_appointment_id, p_cash_session_id,
    auth.uid(), CASE WHEN v_paid = 0 THEN 'open' WHEN v_paid < v_total THEN 'partially_paid' ELSE 'paid' END,
    COALESCE(NULLIF(p_currency, ''), 'EUR'), v_subtotal, v_item_discount + p_sale_discount,
    v_tax, v_total, v_paid, v_total - v_paid, p_notes,
    CASE WHEN v_paid = v_total THEN NOW() ELSE NULL END
  ) RETURNING * INTO v_sale;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_line_base := ROUND((v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC, 2);
    v_line_tax := ROUND(GREATEST(v_line_base - COALESCE((v_item->>'discount_amount')::NUMERIC, 0), 0) * COALESCE((v_item->>'tax_rate')::NUMERIC, 0) / 100, 2);
    v_line_total := GREATEST(v_line_base - COALESCE((v_item->>'discount_amount')::NUMERIC, 0), 0) + v_line_tax;

    INSERT INTO finance_sale_items (
      sale_id, account_id, item_type, source_id, name_snapshot,
      reference_snapshot, quantity, unit_price, discount_amount,
      tax_rate, tax_amount, line_total, metadata
    ) VALUES (
      v_sale.id, v_account_id, v_item->>'item_type', NULLIF(v_item->>'source_id', '')::UUID,
      v_item->>'name', v_item->>'reference', (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price')::NUMERIC, COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
      COALESCE((v_item->>'tax_rate')::NUMERIC, 0), v_line_tax, v_line_total,
      COALESCE(v_item->'metadata', '{}'::JSONB)
    );

    IF v_item->>'item_type' = 'product' THEN
      UPDATE clinic_products
      SET stock_quantity = stock_quantity - CEIL((v_item->>'quantity')::NUMERIC)::INTEGER,
          updated_at = NOW()
      WHERE id = (v_item->>'source_id')::UUID
        AND account_id = v_account_id
        AND stock_quantity >= CEIL((v_item->>'quantity')::NUMERIC)::INTEGER
      RETURNING stock_quantity INTO v_product_stock;
      IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient product stock'; END IF;
      INSERT INTO finance_stock_movements (
        account_id, product_id, sale_id, user_id, movement_type, quantity, stock_after
      ) VALUES (
        v_account_id, (v_item->>'source_id')::UUID, v_sale.id, auth.uid(), 'sale',
        -CEIL((v_item->>'quantity')::NUMERIC)::INTEGER, v_product_stock
      );
    ELSIF v_item->>'item_type' = 'pack' THEN
      IF p_contact_id IS NULL THEN RAISE EXCEPTION 'Packs require a client'; END IF;
      SELECT * INTO v_pack FROM finance_pack_catalog
      WHERE id = (v_item->>'source_id')::UUID AND account_id = v_account_id AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Pack not found'; END IF;
      FOR counter IN 1..CEIL((v_item->>'quantity')::NUMERIC)::INTEGER LOOP
        INSERT INTO finance_client_packs (
          account_id, contact_id, pack_id, sale_id, expires_at
        ) VALUES (
          v_account_id, p_contact_id, v_pack.id, v_sale.id,
          NOW() + make_interval(days => v_pack.validity_days)
        ) RETURNING id INTO v_client_pack_id;
        INSERT INTO finance_client_pack_balances (
          client_pack_id, service_id, total_sessions, remaining_sessions
        ) SELECT v_client_pack_id, service_id, sessions, sessions
          FROM finance_pack_items WHERE pack_id = v_pack.id;
      END LOOP;
    ELSIF v_item->>'item_type' = 'voucher' THEN
      v_voucher_code := UPPER(COALESCE(NULLIF(v_item->'metadata'->>'code', ''), SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 10)));
      INSERT INTO finance_vouchers (
        account_id, issued_sale_id, owner_contact_id, code,
        initial_balance, current_balance, currency, recipient_name,
        message, expires_at
      ) VALUES (
        v_account_id, v_sale.id, p_contact_id, v_voucher_code,
        COALESCE(NULLIF(v_item->'metadata'->>'face_value', '')::NUMERIC, (v_item->>'unit_price')::NUMERIC),
        COALESCE(NULLIF(v_item->'metadata'->>'face_value', '')::NUMERIC, (v_item->>'unit_price')::NUMERIC),
        v_sale.currency, v_item->'metadata'->>'recipient_name',
        v_item->'metadata'->>'message',
        CASE WHEN NULLIF(v_item->'metadata'->>'validity_days', '') IS NULL THEN NULL
          ELSE NOW() + make_interval(days => (v_item->'metadata'->>'validity_days')::INTEGER) END
      );
    END IF;
  END LOOP;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::JSONB)) LOOP
    IF v_payment->>'method' = 'voucher' THEN
      SELECT * INTO v_voucher FROM finance_vouchers
      WHERE account_id = v_account_id AND code = UPPER(v_payment->>'reference_code')
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
        AND current_balance >= (v_payment->>'amount')::NUMERIC
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Voucher unavailable or insufficient'; END IF;
      UPDATE finance_vouchers SET
        current_balance = current_balance - (v_payment->>'amount')::NUMERIC,
        status = CASE WHEN current_balance - (v_payment->>'amount')::NUMERIC = 0 THEN 'used' ELSE 'active' END,
        updated_at = NOW()
      WHERE id = v_voucher.id;
    END IF;
    INSERT INTO finance_payments (
      account_id, sale_id, cash_session_id, received_by_user_id,
      method, amount, reference_code, notes
    ) VALUES (
      v_account_id, v_sale.id, p_cash_session_id, auth.uid(),
      v_payment->>'method', (v_payment->>'amount')::NUMERIC,
      v_payment->>'reference_code', v_payment->>'notes'
    );
  END LOOP;

  IF p_appointment_id IS NOT NULL AND v_sale.status = 'paid' THEN
    UPDATE clinic_appointments SET paid_at = NOW(), updated_at = NOW()
    WHERE id = p_appointment_id AND account_id = v_account_id;
  END IF;
  RETURN v_sale;
END;
$$;

CREATE OR REPLACE FUNCTION add_finance_payment(
  p_sale_id UUID,
  p_method TEXT,
  p_amount NUMERIC,
  p_cash_session_id UUID DEFAULT NULL,
  p_reference_code TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS finance_sales
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sale finance_sales;
  v_voucher finance_vouchers;
  v_paid NUMERIC(12,2);
BEGIN
  SELECT * INTO v_sale FROM finance_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_sale.account_id, 'agent') THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF v_sale.status NOT IN ('open', 'partially_paid') THEN RAISE EXCEPTION 'Sale does not accept payments'; END IF;
  IF p_amount <= 0 OR p_amount > v_sale.balance_due THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
  IF p_method = 'cash' AND NOT EXISTS (
    SELECT 1 FROM finance_cash_sessions WHERE id = p_cash_session_id
      AND account_id = v_sale.account_id AND status = 'open'
  ) THEN RAISE EXCEPTION 'An open cash session is required'; END IF;
  IF p_method = 'voucher' THEN
    SELECT * INTO v_voucher FROM finance_vouchers
    WHERE account_id = v_sale.account_id AND code = UPPER(p_reference_code)
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
      AND current_balance >= p_amount FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Voucher unavailable or insufficient'; END IF;
    UPDATE finance_vouchers SET current_balance = current_balance - p_amount,
      status = CASE WHEN current_balance - p_amount = 0 THEN 'used' ELSE 'active' END,
      updated_at = NOW() WHERE id = v_voucher.id;
  END IF;
  INSERT INTO finance_payments (
    account_id, sale_id, cash_session_id, received_by_user_id,
    method, amount, reference_code, notes
  ) VALUES (
    v_sale.account_id, v_sale.id, p_cash_session_id, auth.uid(),
    p_method, p_amount, p_reference_code, p_notes
  );
  v_paid := v_sale.paid_amount + p_amount;
  UPDATE finance_sales SET paid_amount = v_paid,
    balance_due = total_amount - v_paid,
    status = CASE WHEN v_paid = total_amount THEN 'paid' ELSE 'partially_paid' END,
    completed_at = CASE WHEN v_paid = total_amount THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE id = v_sale.id RETURNING * INTO v_sale;
  IF v_sale.appointment_id IS NOT NULL AND v_sale.status = 'paid' THEN
    UPDATE clinic_appointments SET paid_at = NOW(), updated_at = NOW()
    WHERE id = v_sale.appointment_id AND account_id = v_sale.account_id;
  END IF;
  RETURN v_sale;
END;
$$;

GRANT EXECUTE ON FUNCTION create_finance_sale(UUID, UUID, UUID, TEXT, JSONB, JSONB, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_finance_payment(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT) TO authenticated;
