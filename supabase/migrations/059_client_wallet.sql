-- A client wallet is not a voucher. It has its own balance and immutable ledger.
CREATE TABLE IF NOT EXISTS finance_client_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'EUR',
  balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, contact_id, currency)
);

CREATE TABLE IF NOT EXISTS finance_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES finance_client_wallets(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('credit', 'debit', 'refund', 'adjustment')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
  balance_after NUMERIC(12,2) NOT NULL CHECK (balance_after >= 0),
  referral_reward_id UUID REFERENCES referral_rewards(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES finance_sales(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES finance_payments(id) ON DELETE SET NULL,
  performed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referral_reward_id),
  UNIQUE(payment_id)
);

CREATE INDEX IF NOT EXISTS finance_wallet_transactions_wallet_idx
  ON finance_wallet_transactions(wallet_id, created_at DESC);

ALTER TABLE referral_rewards
  ADD COLUMN IF NOT EXISTS issued_wallet_id UUID REFERENCES finance_client_wallets(id) ON DELETE SET NULL;

ALTER TABLE finance_client_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_client_wallets_select ON finance_client_wallets;
CREATE POLICY finance_client_wallets_select ON finance_client_wallets FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS finance_client_wallets_manage ON finance_client_wallets;
CREATE POLICY finance_client_wallets_manage ON finance_client_wallets FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS finance_wallet_transactions_select ON finance_wallet_transactions;
CREATE POLICY finance_wallet_transactions_select ON finance_wallet_transactions FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS finance_wallet_transactions_insert ON finance_wallet_transactions;
CREATE POLICY finance_wallet_transactions_insert ON finance_wallet_transactions FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON finance_client_wallets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance_client_wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Move balances previously represented as special gift-card vouchers.
INSERT INTO finance_client_wallets(account_id, contact_id, currency, balance)
SELECT account_id, owner_contact_id, currency, SUM(current_balance)
FROM finance_vouchers
WHERE owner_contact_id IS NOT NULL
  AND message = 'Crédito acumulado do programa Indique & Ganhe'
  AND current_balance > 0
GROUP BY account_id, owner_contact_id, currency
ON CONFLICT (account_id, contact_id, currency) DO UPDATE
  SET balance = finance_client_wallets.balance + EXCLUDED.balance,
      updated_at = NOW();

INSERT INTO finance_wallet_transactions(
  account_id, wallet_id, transaction_type, amount, balance_after,
  description, metadata
)
SELECT DISTINCT ON (w.id)
  w.account_id, w.id, 'adjustment', w.balance, w.balance,
  'Saldo inicial migrado do programa Indique & Ganhe',
  jsonb_build_object('source', 'voucher_wallet_migration')
FROM finance_vouchers v
JOIN finance_client_wallets w
  ON w.account_id = v.account_id
 AND w.contact_id = v.owner_contact_id
 AND w.currency = v.currency
WHERE v.message = 'Crédito acumulado do programa Indique & Ganhe'
  AND w.balance > 0
ORDER BY w.id;

UPDATE referral_rewards r
SET issued_wallet_id = w.id,
    issued_voucher_id = NULL,
    metadata = r.metadata || jsonb_build_object('wallet_id', w.id, 'migrated_to_wallet', true),
    updated_at = NOW()
FROM finance_vouchers v
JOIN finance_client_wallets w
  ON w.account_id = v.account_id
 AND w.contact_id = v.owner_contact_id
 AND w.currency = v.currency
WHERE r.issued_voucher_id = v.id
  AND r.reward_type = 'fixed_credit'
  AND v.message = 'Crédito acumulado do programa Indique & Ganhe';

UPDATE finance_vouchers
SET current_balance = 0,
    status = 'cancelled',
    message = 'Migrado para o cartão-saldo do cliente',
    updated_at = NOW()
WHERE message = 'Crédito acumulado do programa Indique & Ganhe';

CREATE OR REPLACE FUNCTION issue_referral_reward(p_reward_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_reward referral_rewards;
  v_ref referrals;
  v_voucher_id UUID;
  v_wallet_id UUID;
  v_wallet_balance NUMERIC(12,2);
  v_currency TEXT;
  v_service_price NUMERIC(12,2);
BEGIN
  SELECT * INTO v_reward FROM referral_rewards WHERE id = p_reward_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_reward.account_id, 'agent') THEN
    RAISE EXCEPTION 'Reward not found';
  END IF;
  IF v_reward.status <> 'pending' THEN RAISE EXCEPTION 'Reward has already been processed'; END IF;
  IF v_reward.contact_id IS NULL THEN RAISE EXCEPTION 'Reward requires a linked client'; END IF;

  SELECT * INTO v_ref FROM referrals WHERE id = v_reward.referral_id;
  SELECT COALESCE(default_currency, 'EUR') INTO v_currency
  FROM accounts WHERE id = v_reward.account_id;

  IF v_reward.reward_type = 'fixed_credit' THEN
    IF v_reward.reward_value <= 0 THEN RAISE EXCEPTION 'Reward value must be positive'; END IF;
    INSERT INTO finance_client_wallets(account_id, contact_id, currency, balance)
    VALUES(v_reward.account_id, v_reward.contact_id, v_currency, v_reward.reward_value)
    ON CONFLICT (account_id, contact_id, currency) DO UPDATE
      SET balance = finance_client_wallets.balance + EXCLUDED.balance,
          updated_at = NOW()
    RETURNING id, balance INTO v_wallet_id, v_wallet_balance;

    INSERT INTO finance_wallet_transactions(
      account_id, wallet_id, transaction_type, amount, balance_after,
      referral_reward_id, performed_by_user_id, description, metadata
    ) VALUES (
      v_reward.account_id, v_wallet_id, 'credit', v_reward.reward_value,
      v_wallet_balance, v_reward.id, auth.uid(),
      'Cashback do programa Indique & Ganhe',
      jsonb_build_object('source', 'refer_a_friend', 'referral_id', v_reward.referral_id)
    );
  ELSIF v_reward.reward_type = 'service' THEN
    SELECT price, COALESCE(currency, v_currency) INTO v_service_price, v_currency
    FROM clinic_services WHERE id = v_reward.service_id;
    IF v_service_price IS NULL THEN RAISE EXCEPTION 'Reward service not found'; END IF;
    INSERT INTO finance_vouchers(
      account_id, owner_contact_id, code, initial_balance, current_balance,
      currency, status, message, expires_at
    ) VALUES (
      v_reward.account_id, v_reward.contact_id, v_reward.reward_code,
      v_service_price, v_service_price, v_currency, 'active',
      'Procedimento do programa Indique & Ganhe', v_reward.expires_at
    ) RETURNING id INTO v_voucher_id;
    UPDATE finance_vouchers
    SET voucher_type = 'service', service_id = v_reward.service_id, remaining_uses = 1
    WHERE id = v_voucher_id;
  END IF;

  UPDATE referral_rewards
  SET status = 'issued', issued_at = NOW(), issued_by_user_id = auth.uid(),
      issued_voucher_id = v_voucher_id, issued_wallet_id = v_wallet_id,
      metadata = metadata || jsonb_build_object(
        'wallet_credit', v_reward.reward_type = 'fixed_credit',
        'wallet_id', v_wallet_id,
        'voucher_id', v_voucher_id
      ),
      updated_at = NOW()
  WHERE id = p_reward_id;

  INSERT INTO referral_events(account_id, referral_id, action, actor_user_id, metadata)
  VALUES(
    v_reward.account_id, v_reward.referral_id, 'reward_issued', auth.uid(),
    jsonb_build_object(
      'reward_id', v_reward.id,
      'beneficiary', v_reward.beneficiary_type,
      'wallet_id', v_wallet_id,
      'voucher_id', v_voucher_id,
      'value', v_reward.reward_value
    )
  );

  IF NOT EXISTS (
    SELECT 1 FROM referral_rewards WHERE referral_id = v_reward.referral_id AND status = 'pending'
  ) THEN
    UPDATE referrals SET status = 'rewarded', rewarded_at = NOW(), updated_at = NOW()
    WHERE id = v_reward.referral_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION debit_client_wallet_payment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_sale finance_sales;
  v_wallet finance_client_wallets;
  v_balance NUMERIC(12,2);
BEGIN
  IF NEW.method <> 'client_credit' OR NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  SELECT * INTO v_sale FROM finance_sales WHERE id = NEW.sale_id;
  IF v_sale.contact_id IS NULL THEN RAISE EXCEPTION 'Client credit requires a client'; END IF;

  SELECT * INTO v_wallet FROM finance_client_wallets
  WHERE account_id = NEW.account_id
    AND contact_id = v_sale.contact_id
    AND currency = v_sale.currency
    AND balance >= NEW.amount
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client wallet unavailable or insufficient'; END IF;

  UPDATE finance_client_wallets
  SET balance = balance - NEW.amount, updated_at = NOW()
  WHERE id = v_wallet.id RETURNING balance INTO v_balance;

  INSERT INTO finance_wallet_transactions(
    account_id, wallet_id, transaction_type, amount, balance_after,
    sale_id, payment_id, performed_by_user_id, description
  ) VALUES (
    NEW.account_id, v_wallet.id, 'debit', -NEW.amount, v_balance,
    NEW.sale_id, NEW.id, NEW.received_by_user_id, 'Pagamento no POS'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debit_client_wallet_payment_trigger ON finance_payments;
CREATE TRIGGER debit_client_wallet_payment_trigger
  AFTER INSERT ON finance_payments FOR EACH ROW
  EXECUTE FUNCTION debit_client_wallet_payment();

NOTIFY pgrst, 'reload schema';
