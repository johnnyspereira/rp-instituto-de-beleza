-- Named financial accounts, opening positions and atomic internal transfers.

CREATE TABLE IF NOT EXISTS finance_fund_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'bank', 'other')),
  institution TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_fund_accounts_name_unique
  ON finance_fund_accounts(account_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS finance_fund_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_account_id UUID NOT NULL REFERENCES finance_fund_accounts(id) ON DELETE RESTRICT,
  destination_account_id UUID NOT NULL REFERENCES finance_fund_accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_account_id <> destination_account_id)
);

CREATE TABLE IF NOT EXISTS finance_fund_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  fund_account_id UUID NOT NULL REFERENCES finance_fund_accounts(id) ON DELETE RESTRICT,
  cash_session_id UUID REFERENCES finance_cash_sessions(id) ON DELETE SET NULL,
  transfer_id UUID REFERENCES finance_fund_transfers(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'opening_reconciliation', 'deposit', 'withdrawal', 'expense',
    'refund', 'tip', 'payment', 'transfer', 'adjustment'
  )),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  reference TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_fund_transactions_account_date
  ON finance_fund_transactions(account_id, fund_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_fund_transfers_account_date
  ON finance_fund_transfers(account_id, created_at DESC);

ALTER TABLE finance_cash_sessions
  ADD COLUMN IF NOT EXISTS opening_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE finance_fund_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_fund_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_fund_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_fund_accounts_select ON finance_fund_accounts
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY finance_fund_accounts_insert ON finance_fund_accounts
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY finance_fund_accounts_update ON finance_fund_accounts
  FOR UPDATE USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY finance_fund_transfers_select ON finance_fund_transfers
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY finance_fund_transactions_select ON finance_fund_transactions
  FOR SELECT USING (is_account_member(account_id));

GRANT SELECT, INSERT, UPDATE ON finance_fund_accounts TO authenticated;
GRANT SELECT ON finance_fund_transfers, finance_fund_transactions TO authenticated;

CREATE OR REPLACE FUNCTION get_finance_fund_accounts()
RETURNS TABLE (
  id UUID, name TEXT, account_type TEXT, institution TEXT, currency TEXT,
  is_active BOOLEAN, balance NUMERIC
)
LANGUAGE SQL SECURITY INVOKER SET search_path = public AS $$
  SELECT a.id, a.name, a.account_type, a.institution, a.currency, a.is_active,
    COALESCE(SUM(
      CASE t.direction WHEN 'credit' THEN t.amount ELSE -t.amount END
    ), 0)::NUMERIC(14,2) AS balance
  FROM finance_fund_accounts a
  LEFT JOIN finance_fund_transactions t ON t.fund_account_id = a.id
  WHERE is_account_member(a.account_id) AND a.is_active
  GROUP BY a.id
  ORDER BY CASE a.account_type WHEN 'cash' THEN 0 WHEN 'bank' THEN 1 ELSE 2 END,
    lower(a.name);
$$;

CREATE OR REPLACE FUNCTION open_finance_cash_session_v3(
  p_opening_positions JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS finance_cash_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account_id UUID;
  v_session finance_cash_sessions;
  v_position JSONB;
  v_fund_account finance_fund_accounts;
  v_name TEXT;
  v_type TEXT;
  v_amount NUMERIC(14,2);
  v_balance NUMERIC(14,2);
  v_difference NUMERIC(14,2);
  v_cash NUMERIC(14,2) := 0;
  v_breakdown JSONB := '{}'::jsonb;
BEGIN
  SELECT account_id INTO v_account_id
  FROM profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_account_id IS NULL OR NOT is_account_member(v_account_id, 'agent') THEN
    RAISE EXCEPTION 'Sem permissÃ£o para abrir o caixa';
  END IF;
  IF jsonb_typeof(COALESCE(p_opening_positions, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_opening_positions, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos uma origem de fundos';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtext(v_account_id::TEXT), hashtext('finance_cash')
  );
  IF EXISTS (
    SELECT 1 FROM finance_cash_sessions
    WHERE account_id = v_account_id AND status = 'open'
  ) THEN RAISE EXCEPTION 'JÃ¡ existe um caixa aberto'; END IF;

  INSERT INTO finance_cash_sessions(
    account_id, opened_by_user_id, opening_amount, notes
  ) VALUES (v_account_id, auth.uid(), 0, NULLIF(btrim(p_notes), ''))
  RETURNING * INTO v_session;

  FOR v_position IN SELECT value FROM jsonb_array_elements(p_opening_positions)
  LOOP
    v_name := NULLIF(btrim(v_position->>'name'), '');
    v_type := COALESCE(NULLIF(v_position->>'account_type', ''), 'bank');
    v_amount := COALESCE((v_position->>'amount')::NUMERIC, 0);
    IF v_name IS NULL OR v_type NOT IN ('cash', 'bank', 'other') OR v_amount < 0 THEN
      RAISE EXCEPTION 'PosiÃ§Ã£o financeira invÃ¡lida';
    END IF;

    INSERT INTO finance_fund_accounts(
      account_id, name, account_type, institution, currency, created_by_user_id
    ) VALUES (
      v_account_id, v_name, v_type, NULLIF(btrim(v_position->>'institution'), ''),
      COALESCE(NULLIF(v_position->>'currency', ''), 'EUR'), auth.uid()
    )
    ON CONFLICT (account_id, lower(btrim(name))) DO UPDATE SET
      account_type = EXCLUDED.account_type,
      institution = COALESCE(EXCLUDED.institution, finance_fund_accounts.institution),
      is_active = true,
      updated_at = now()
    RETURNING * INTO v_fund_account;

    SELECT COALESCE(SUM(CASE direction WHEN 'credit' THEN amount ELSE -amount END), 0)
      INTO v_balance
    FROM finance_fund_transactions WHERE fund_account_id = v_fund_account.id;
    v_difference := v_amount - v_balance;
    IF abs(v_difference) >= 0.01 THEN
      INSERT INTO finance_fund_transactions(
        account_id, fund_account_id, cash_session_id, direction,
        transaction_type, amount, description, created_by_user_id
      ) VALUES (
        v_account_id, v_fund_account.id, v_session.id,
        CASE WHEN v_difference > 0 THEN 'credit' ELSE 'debit' END,
        'opening_reconciliation', abs(v_difference),
        'ConferÃªncia de saldo na abertura', auth.uid()
      );
    END IF;
    IF v_type = 'cash' THEN v_cash := v_cash + v_amount; END IF;
    v_breakdown := jsonb_set(
      v_breakdown, ARRAY[v_fund_account.id::TEXT],
      jsonb_build_object('name', v_name, 'account_type', v_type, 'amount', v_amount)
    );
  END LOOP;

  UPDATE finance_cash_sessions SET
    opening_amount = v_cash, opening_breakdown = v_breakdown
  WHERE id = v_session.id RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION transfer_finance_funds(
  p_source_account_id UUID,
  p_destination_account_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL
)
RETURNS finance_fund_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source finance_fund_accounts;
  v_destination finance_fund_accounts;
  v_transfer finance_fund_transfers;
  v_balance NUMERIC(14,2);
BEGIN
  IF p_source_account_id = p_destination_account_id OR COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'TransferÃªncia invÃ¡lida';
  END IF;
  SELECT * INTO v_source FROM finance_fund_accounts
    WHERE id = p_source_account_id FOR UPDATE;
  SELECT * INTO v_destination FROM finance_fund_accounts
    WHERE id = p_destination_account_id FOR UPDATE;
  IF NOT FOUND OR v_source.account_id IS DISTINCT FROM v_destination.account_id
     OR NOT is_account_member(v_source.account_id, 'agent') THEN
    RAISE EXCEPTION 'Contas financeiras invÃ¡lidas';
  END IF;
  IF v_source.currency <> v_destination.currency THEN
    RAISE EXCEPTION 'As contas devem utilizar a mesma moeda';
  END IF;
  SELECT COALESCE(SUM(CASE direction WHEN 'credit' THEN amount ELSE -amount END), 0)
    INTO v_balance FROM finance_fund_transactions
    WHERE fund_account_id = v_source.id;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'Saldo insuficiente na conta de origem'; END IF;

  INSERT INTO finance_fund_transfers(
    account_id, source_account_id, destination_account_id, amount,
    currency, description, created_by_user_id
  ) VALUES (
    v_source.account_id, v_source.id, v_destination.id, p_amount,
    v_source.currency, NULLIF(btrim(p_description), ''), auth.uid()
  ) RETURNING * INTO v_transfer;

  INSERT INTO finance_fund_transactions(
    account_id, fund_account_id, transfer_id, direction, transaction_type,
    amount, description, created_by_user_id
  ) VALUES
  (v_source.account_id, v_source.id, v_transfer.id, 'debit', 'transfer',
    p_amount, 'TransferÃªncia para ' || v_destination.name, auth.uid()),
  (v_source.account_id, v_destination.id, v_transfer.id, 'credit', 'transfer',
    p_amount, 'TransferÃªncia de ' || v_source.name, auth.uid());
  RETURN v_transfer;
END;
$$;

GRANT EXECUTE ON FUNCTION get_finance_fund_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION open_finance_cash_session_v3(JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_finance_funds(UUID, UUID, NUMERIC, TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'finance_fund_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE finance_fund_transactions;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
