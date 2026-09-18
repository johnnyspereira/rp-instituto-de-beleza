-- Cash register 2.0: multichannel reconciliation, tips and auditable closings.

ALTER TABLE finance_cash_movements
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE finance_cash_movements
  DROP CONSTRAINT IF EXISTS finance_cash_movements_payment_method_check;
ALTER TABLE finance_cash_movements
  ADD CONSTRAINT finance_cash_movements_payment_method_check CHECK (
    payment_method IN (
      'cash', 'card', 'mb_way', 'multibanco', 'bank_transfer',
      'voucher', 'client_credit', 'other'
    )
  );

ALTER TABLE finance_cash_movements
  DROP CONSTRAINT IF EXISTS finance_cash_movements_movement_type_check;
ALTER TABLE finance_cash_movements
  ADD CONSTRAINT finance_cash_movements_movement_type_check CHECK (
    movement_type IN (
      'deposit', 'withdrawal', 'expense', 'refund', 'adjustment', 'tip'
    )
  );

ALTER TABLE finance_cash_sessions
  ADD COLUMN IF NOT EXISTS expected_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS closing_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS reconciliation_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE OR REPLACE FUNCTION add_finance_register_movement(
  p_cash_session_id UUID,
  p_movement_type TEXT,
  p_amount NUMERIC,
  p_description TEXT,
  p_reference TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
  p_category TEXT DEFAULT NULL
)
RETURNS finance_cash_movements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session finance_cash_sessions;
  v_result finance_cash_movements;
BEGIN
  SELECT * INTO v_session
  FROM finance_cash_sessions
  WHERE id = p_cash_session_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_session.status <> 'open'
     OR NOT is_account_member(v_session.account_id, 'agent') THEN
    RAISE EXCEPTION 'Open cash session not found';
  END IF;
  IF p_movement_type NOT IN (
      'deposit', 'withdrawal', 'expense', 'adjustment', 'tip'
    )
     OR p_payment_method NOT IN (
      'cash', 'card', 'mb_way', 'multibanco', 'bank_transfer',
      'voucher', 'client_credit', 'other'
    )
     OR COALESCE(p_amount, 0) <= 0
     OR NULLIF(BTRIM(p_description), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid register movement';
  END IF;

  INSERT INTO finance_cash_movements(
    account_id, cash_session_id, movement_type, amount, description,
    reference, payment_method, category, created_by_user_id
  ) VALUES (
    v_session.account_id, v_session.id, p_movement_type, p_amount,
    BTRIM(p_description), NULLIF(BTRIM(p_reference), ''),
    p_payment_method, NULLIF(BTRIM(p_category), ''), auth.uid()
  )
  RETURNING * INTO v_result;

  INSERT INTO finance_audit_events(
    account_id, entity_type, entity_id, action, actor_user_id, metadata
  ) VALUES (
    v_session.account_id, 'cash_movement', v_result.id,
    p_movement_type, auth.uid(),
    jsonb_build_object(
      'amount', p_amount,
      'cash_session_id', v_session.id,
      'payment_method', p_payment_method,
      'category', p_category
    )
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_finance_register_snapshot(
  p_cash_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_session finance_cash_sessions;
  v_payments JSONB;
  v_tips JSONB;
  v_cash_deposits NUMERIC(12,2);
  v_cash_outflows NUMERIC(12,2);
  v_cash_payments NUMERIC(12,2);
  v_cash_tips NUMERIC(12,2);
BEGIN
  SELECT * INTO v_session
  FROM finance_cash_sessions
  WHERE id = p_cash_session_id;
  IF NOT FOUND OR NOT is_account_member(v_session.account_id) THEN
    RAISE EXCEPTION 'Cash session not found';
  END IF;

  SELECT COALESCE(jsonb_object_agg(method, total), '{}'::JSONB)
  INTO v_payments
  FROM (
    SELECT method, ROUND(SUM(
      CASE WHEN status = 'refunded' THEN -amount ELSE amount END
    ), 2) AS total
    FROM finance_payments
    WHERE cash_session_id = v_session.id
      AND status IN ('confirmed', 'refunded')
    GROUP BY method
  ) totals;

  SELECT COALESCE(jsonb_object_agg(payment_method, total), '{}'::JSONB)
  INTO v_tips
  FROM (
    SELECT payment_method, ROUND(SUM(amount), 2) AS total
    FROM finance_cash_movements
    WHERE cash_session_id = v_session.id AND movement_type = 'tip'
    GROUP BY payment_method
  ) totals;

  v_cash_payments := COALESCE((v_payments ->> 'cash')::NUMERIC, 0);
  v_cash_tips := COALESCE((v_tips ->> 'cash')::NUMERIC, 0);

  SELECT COALESCE(SUM(amount), 0) INTO v_cash_deposits
  FROM finance_cash_movements
  WHERE cash_session_id = v_session.id
    AND payment_method = 'cash'
    AND movement_type IN ('deposit', 'adjustment');

  SELECT COALESCE(SUM(amount), 0) INTO v_cash_outflows
  FROM finance_cash_movements
  WHERE cash_session_id = v_session.id
    AND payment_method = 'cash'
    AND movement_type IN ('withdrawal', 'expense', 'refund');

  RETURN jsonb_build_object(
    'opening_amount', v_session.opening_amount,
    'cash_received', v_cash_payments + v_cash_tips,
    'deposits', v_cash_deposits,
    'outflows', v_cash_outflows,
    'expected_amount',
      v_session.opening_amount + v_cash_payments + v_cash_tips
      + v_cash_deposits - v_cash_outflows,
    'payments_by_method', v_payments,
    'tips_by_method', v_tips,
    'cash_deposits', v_cash_deposits,
    'cash_outflows', v_cash_outflows,
    'expected_cash',
      v_session.opening_amount + v_cash_payments + v_cash_tips
      + v_cash_deposits - v_cash_outflows
  );
END;
$$;

CREATE OR REPLACE FUNCTION close_finance_cash_session_v2(
  p_cash_session_id UUID,
  p_counted_breakdown JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS finance_cash_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session finance_cash_sessions;
  v_snapshot JSONB;
  v_expected JSONB;
  v_reconciliation JSONB := '{}'::JSONB;
  v_method TEXT;
  v_expected_value NUMERIC(12,2);
  v_counted_value NUMERIC(12,2);
  v_expected_cash NUMERIC(12,2);
  v_counted_cash NUMERIC(12,2);
BEGIN
  SELECT * INTO v_session
  FROM finance_cash_sessions
  WHERE id = p_cash_session_id
  FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_session.account_id, 'agent') THEN
    RAISE EXCEPTION 'Cash session not found';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Cash session is already closed';
  END IF;
  IF jsonb_typeof(COALESCE(p_counted_breakdown, '{}'::JSONB)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid counted breakdown';
  END IF;

  v_snapshot := get_finance_register_snapshot(v_session.id);
  v_expected := '{}'::JSONB;

  FOREACH v_method IN ARRAY ARRAY[
    'cash', 'card', 'mb_way', 'multibanco', 'bank_transfer', 'other'
  ] LOOP
    v_expected_value := CASE
      WHEN v_method = 'cash'
        THEN COALESCE((v_snapshot ->> 'expected_cash')::NUMERIC, 0)
      ELSE
        COALESCE((v_snapshot -> 'payments_by_method' ->> v_method)::NUMERIC, 0)
        + COALESCE((v_snapshot -> 'tips_by_method' ->> v_method)::NUMERIC, 0)
    END;
    v_expected := jsonb_set(
      v_expected, ARRAY[v_method], to_jsonb(v_expected_value)
    );
    v_counted_value := COALESCE((p_counted_breakdown ->> v_method)::NUMERIC, 0);
    IF v_counted_value < 0 THEN RAISE EXCEPTION 'Invalid counted amount'; END IF;
    v_reconciliation := jsonb_set(
      v_reconciliation,
      ARRAY[v_method],
      jsonb_build_object(
        'expected', v_expected_value,
        'counted', v_counted_value,
        'difference', v_counted_value - v_expected_value
      )
    );
  END LOOP;

  v_expected_cash := COALESCE((v_expected ->> 'cash')::NUMERIC, 0);
  v_counted_cash := COALESCE((p_counted_breakdown ->> 'cash')::NUMERIC, 0);

  UPDATE finance_cash_sessions
  SET status = 'closed',
      closed_by_user_id = auth.uid(),
      closing_counted_amount = v_counted_cash,
      expected_amount = v_expected_cash,
      difference_amount = v_counted_cash - v_expected_cash,
      expected_breakdown = v_expected,
      closing_breakdown = p_counted_breakdown,
      reconciliation_breakdown = v_reconciliation,
      notes = CONCAT_WS(E'\n', NULLIF(notes, ''), NULLIF(BTRIM(p_notes), '')),
      closed_at = NOW()
  WHERE id = v_session.id
  RETURNING * INTO v_session;

  INSERT INTO finance_audit_events(
    account_id, entity_type, entity_id, action, actor_user_id, metadata
  ) VALUES (
    v_session.account_id, 'cash_session', v_session.id, 'closed',
    auth.uid(), v_snapshot || jsonb_build_object(
      'counted_breakdown', p_counted_breakdown,
      'reconciliation', v_reconciliation
    )
  );
  RETURN v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION add_finance_register_movement(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION get_finance_register_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION close_finance_cash_session_v2(
  UUID, JSONB, TEXT
) TO authenticated;
