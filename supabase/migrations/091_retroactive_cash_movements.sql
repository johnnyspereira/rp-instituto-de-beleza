-- Allow cash/register movements to be recorded with a chosen occurrence date.
-- This supports forgotten cash entries without changing the closed-cash flow.

DROP FUNCTION IF EXISTS add_finance_register_movement(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION add_finance_register_movement(
  p_cash_session_id UUID,
  p_movement_type TEXT,
  p_amount NUMERIC,
  p_description TEXT,
  p_reference TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
  p_category TEXT DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS finance_cash_movements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session finance_cash_sessions;
  v_result finance_cash_movements;
  v_occurred_at TIMESTAMPTZ;
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

  v_occurred_at := COALESCE(p_occurred_at, NOW());

  IF p_movement_type NOT IN (
      'deposit', 'withdrawal', 'expense', 'adjustment', 'tip'
    )
     OR p_payment_method NOT IN (
      'cash', 'card', 'mb_way', 'multibanco', 'bank_transfer',
      'voucher', 'client_credit', 'other'
    )
     OR COALESCE(p_amount, 0) <= 0
     OR NULLIF(BTRIM(p_description), '') IS NULL
     OR v_occurred_at > NOW() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Invalid register movement';
  END IF;

  INSERT INTO finance_cash_movements(
    account_id, cash_session_id, movement_type, amount, description,
    reference, payment_method, category, created_by_user_id, created_at
  ) VALUES (
    v_session.account_id, v_session.id, p_movement_type, p_amount,
    BTRIM(p_description), NULLIF(BTRIM(p_reference), ''),
    p_payment_method, NULLIF(BTRIM(p_category), ''), auth.uid(),
    v_occurred_at
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
      'category', p_category,
      'occurred_at', v_occurred_at,
      'retroactive', v_occurred_at < NOW() - INTERVAL '10 minutes'
    )
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION add_finance_register_movement(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO authenticated;

NOTIFY pgrst, 'reload schema';
