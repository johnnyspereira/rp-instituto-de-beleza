-- Evolve the private treasury into an owner-only CRM financial hub.

ALTER TABLE finance_payables
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES clinic_appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cash_movement_id UUID REFERENCES finance_cash_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS installment_group_id UUID,
  ADD COLUMN IF NOT EXISTS installment_number INTEGER NOT NULL DEFAULT 1 CHECK (installment_number > 0),
  ADD COLUMN IF NOT EXISTS installment_count INTEGER NOT NULL DEFAULT 1 CHECK (installment_count > 0),
  ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'weekly', 'monthly', 'quarterly', 'yearly')),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'appointment', 'sale', 'voucher', 'deal', 'recurring'));

ALTER TABLE finance_receivable_schedules
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES clinic_appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES finance_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS installment_group_id UUID,
  ADD COLUMN IF NOT EXISTS installment_number INTEGER NOT NULL DEFAULT 1 CHECK (installment_number > 0),
  ADD COLUMN IF NOT EXISTS installment_count INTEGER NOT NULL DEFAULT 1 CHECK (installment_count > 0),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'appointment', 'sale', 'voucher', 'deal'));

DROP INDEX IF EXISTS finance_receivable_schedules_open_sale_idx;
CREATE INDEX IF NOT EXISTS finance_payables_crm_links_idx
  ON finance_payables(account_id, contact_id, appointment_id, deal_id);
CREATE INDEX IF NOT EXISTS finance_receivables_crm_links_idx
  ON finance_receivable_schedules(account_id, contact_id, appointment_id, sale_id, voucher_id, deal_id);
CREATE UNIQUE INDEX IF NOT EXISTS finance_payables_installment_unique_idx
  ON finance_payables(installment_group_id, installment_number)
  WHERE installment_group_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS finance_receivables_installment_unique_idx
  ON finance_receivable_schedules(installment_group_id, installment_number)
  WHERE installment_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION settle_owner_payable(
  p_payable_id UUID,
  p_payment_method TEXT DEFAULT 'bank_transfer',
  p_payment_reference TEXT DEFAULT NULL,
  p_cash_session_id UUID DEFAULT NULL
)
RETURNS finance_payables
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payable finance_payables;
  v_movement finance_cash_movements;
BEGIN
  SELECT * INTO v_payable FROM finance_payables WHERE id = p_payable_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_payable.account_id, 'owner') THEN
    RAISE EXCEPTION 'Conta não encontrada';
  END IF;
  IF v_payable.status <> 'pending' THEN RAISE EXCEPTION 'A conta já foi liquidada'; END IF;

  IF p_payment_method = 'cash' THEN
    IF p_cash_session_id IS NULL THEN RAISE EXCEPTION 'Abra ou selecione o caixa para pagar em dinheiro'; END IF;
    SELECT * INTO v_movement FROM add_finance_cash_movement(
      p_cash_session_id, 'expense', v_payable.amount,
      v_payable.description, COALESCE(NULLIF(BTRIM(p_payment_reference), ''), v_payable.document_reference)
    );
  END IF;

  UPDATE finance_payables SET
    status = 'paid', paid_at = now(), payment_method = p_payment_method,
    payment_reference = NULLIF(BTRIM(p_payment_reference), ''),
    cash_movement_id = v_movement.id
  WHERE id = v_payable.id RETURNING * INTO v_payable;
  RETURN v_payable;
END;
$$;

CREATE OR REPLACE FUNCTION settle_owner_receivable(
  p_receivable_id UUID,
  p_payment_method TEXT DEFAULT 'bank_transfer',
  p_payment_reference TEXT DEFAULT NULL,
  p_cash_session_id UUID DEFAULT NULL
)
RETURNS finance_receivable_schedules
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_receivable finance_receivable_schedules;
  v_sale finance_sales;
  v_payment finance_payments;
BEGIN
  SELECT * INTO v_receivable FROM finance_receivable_schedules WHERE id = p_receivable_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_receivable.account_id, 'owner') THEN
    RAISE EXCEPTION 'Prestação não encontrada';
  END IF;
  IF v_receivable.status <> 'pending' THEN RAISE EXCEPTION 'A prestação já foi liquidada'; END IF;

  IF v_receivable.sale_id IS NOT NULL THEN
    SELECT * INTO v_sale FROM finance_sales WHERE id = v_receivable.sale_id FOR UPDATE;
    IF NOT FOUND OR v_sale.account_id <> v_receivable.account_id THEN RAISE EXCEPTION 'Venda inválida'; END IF;
    IF v_receivable.amount > v_sale.balance_due THEN RAISE EXCEPTION 'O valor excede o saldo da venda'; END IF;
    PERFORM add_finance_payment_secure(
      v_sale.id, p_payment_method, v_receivable.amount, p_cash_session_id,
      NULLIF(BTRIM(p_payment_reference), ''), NULL, 'Recebido pela tesouraria privada'
    );
    SELECT * INTO v_payment FROM finance_payments
      WHERE sale_id = v_sale.id ORDER BY created_at DESC LIMIT 1;
  ELSIF p_payment_method = 'cash' AND p_cash_session_id IS NOT NULL THEN
    PERFORM add_finance_cash_movement(
      p_cash_session_id, 'deposit', v_receivable.amount,
      v_receivable.description, NULLIF(BTRIM(p_payment_reference), '')
    );
  END IF;

  UPDATE finance_receivable_schedules SET
    status = 'received', received_at = now(), payment_method = p_payment_method,
    payment_reference = NULLIF(BTRIM(p_payment_reference), ''), payment_id = v_payment.id
  WHERE id = v_receivable.id RETURNING * INTO v_receivable;
  RETURN v_receivable;
END;
$$;

GRANT EXECUTE ON FUNCTION settle_owner_payable(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION settle_owner_receivable(UUID, TEXT, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
