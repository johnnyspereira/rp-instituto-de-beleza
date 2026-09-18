-- Stripe payment links: checkout session tracking and idempotent webhook confirmation.

ALTER TABLE finance_payment_links
  ADD COLUMN IF NOT EXISTS external_session_id TEXT,
  ADD COLUMN IF NOT EXISTS external_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_payload JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS finance_payment_links_provider_session_unique
  ON finance_payment_links(provider, external_session_id)
  WHERE external_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_payment_links_provider_reference
  ON finance_payment_links(provider, external_reference);

CREATE OR REPLACE FUNCTION confirm_external_payment_link(
  p_provider TEXT,
  p_external_session_id TEXT,
  p_external_payment_intent_id TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS finance_payment_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link finance_payment_links;
  v_sale finance_sales;
  v_amount NUMERIC(12,2);
  v_paid NUMERIC(12,2);
BEGIN
  IF NULLIF(BTRIM(p_provider), '') IS NULL
     OR NULLIF(BTRIM(p_external_session_id), '') IS NULL THEN
    RAISE EXCEPTION 'Provider and external session id are required';
  END IF;

  SELECT * INTO v_link
  FROM finance_payment_links
  WHERE provider = p_provider
    AND external_session_id = p_external_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment link not found';
  END IF;

  IF v_link.status = 'paid' THEN
    RETURN v_link;
  END IF;

  IF v_link.sale_id IS NULL THEN
    RAISE EXCEPTION 'Payment link is not associated with a sale';
  END IF;

  SELECT * INTO v_sale
  FROM finance_sales
  WHERE id = v_link.sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF v_sale.status NOT IN ('open', 'partially_paid') THEN
    UPDATE finance_payment_links
    SET status = 'paid',
        paid_at = COALESCE(paid_at, NOW()),
        external_payment_intent_id = COALESCE(p_external_payment_intent_id, external_payment_intent_id),
        provider_payload = COALESCE(p_payload, '{}'::JSONB),
        updated_at = NOW()
    WHERE id = v_link.id
    RETURNING * INTO v_link;
    RETURN v_link;
  END IF;

  v_amount := LEAST(v_link.amount, v_sale.balance_due);

  IF v_amount <= 0 THEN
    UPDATE finance_payment_links
    SET status = 'paid',
        paid_at = COALESCE(paid_at, NOW()),
        external_payment_intent_id = COALESCE(p_external_payment_intent_id, external_payment_intent_id),
        provider_payload = COALESCE(p_payload, '{}'::JSONB),
        updated_at = NOW()
    WHERE id = v_link.id
    RETURNING * INTO v_link;
    RETURN v_link;
  END IF;

  INSERT INTO finance_payments (
    account_id,
    sale_id,
    cash_session_id,
    received_by_user_id,
    method,
    status,
    amount,
    reference_code,
    notes
  ) VALUES (
    v_sale.account_id,
    v_sale.id,
    NULL,
    v_link.created_by_user_id,
    'card',
    'confirmed',
    v_amount,
    COALESCE(p_external_payment_intent_id, p_external_session_id),
    'Pagamento confirmado automaticamente via ' || p_provider
  );

  v_paid := v_sale.paid_amount + v_amount;

  UPDATE finance_sales
  SET paid_amount = v_paid,
      balance_due = GREATEST(total_amount - v_paid, 0),
      status = CASE WHEN v_paid >= total_amount THEN 'paid' ELSE 'partially_paid' END,
      completed_at = CASE WHEN v_paid >= total_amount THEN NOW() ELSE completed_at END,
      updated_at = NOW()
  WHERE id = v_sale.id
  RETURNING * INTO v_sale;

  IF v_sale.appointment_id IS NOT NULL AND v_sale.status = 'paid' THEN
    UPDATE clinic_appointments
    SET paid_at = NOW(),
        updated_at = NOW()
    WHERE id = v_sale.appointment_id
      AND account_id = v_sale.account_id;
  END IF;

  UPDATE finance_payment_links
  SET status = 'paid',
      paid_at = COALESCE(paid_at, NOW()),
      external_payment_intent_id = COALESCE(p_external_payment_intent_id, external_payment_intent_id),
      provider_payload = COALESCE(p_payload, '{}'::JSONB),
      updated_at = NOW()
  WHERE id = v_link.id
  RETURNING * INTO v_link;

  RETURN v_link;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_external_payment_link(TEXT, TEXT, TEXT, JSONB)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
