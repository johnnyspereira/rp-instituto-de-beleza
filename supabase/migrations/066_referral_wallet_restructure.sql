-- Referral rewards use the client wallet as the single source of truth.
-- Monetary rewards are never represented by vouchers; service rewards remain vouchers.

ALTER TABLE referral_rewards
  ADD COLUMN IF NOT EXISTS credited_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reversed_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_credit_amounts_check;
ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_credit_amounts_check CHECK (
  credited_amount >= 0 AND available_amount >= 0 AND reversed_amount >= 0
  AND available_amount <= credited_amount
  AND reversed_amount <= credited_amount
);

CREATE INDEX IF NOT EXISTS referral_rewards_wallet_available_idx
  ON referral_rewards(issued_wallet_id, issued_at)
  WHERE reward_type = 'fixed_credit' AND status = 'issued' AND available_amount > 0;

-- Repair rewards created by the legacy implementation. It either links the
-- existing wallet credit or transfers the remaining legacy voucher balance.
DO $$
DECLARE
  v_reward referral_rewards;
  v_transaction finance_wallet_transactions;
  v_voucher finance_vouchers;
  v_wallet_id UUID;
  v_balance NUMERIC(12,2);
  v_credit NUMERIC(12,2);
  v_currency TEXT;
BEGIN
  FOR v_reward IN
    SELECT * FROM referral_rewards
    WHERE reward_type = 'fixed_credit'
      AND (
        status = 'issued' OR issued_wallet_id IS NOT NULL OR issued_voucher_id IS NOT NULL
        OR COALESCE((metadata ->> 'wallet_credit')::BOOLEAN, FALSE)
      )
    ORDER BY created_at
    FOR UPDATE
  LOOP
    v_currency := NULL;
    v_wallet_id := NULL;
    v_credit := 0;
    SELECT * INTO v_transaction
    FROM finance_wallet_transactions
    WHERE referral_reward_id = v_reward.id
    ORDER BY created_at LIMIT 1;

    IF FOUND THEN
      UPDATE referral_rewards
      SET issued_wallet_id = v_transaction.wallet_id,
          issued_voucher_id = NULL,
          credited_amount = ABS(v_transaction.amount),
          available_amount = CASE WHEN status = 'redeemed' THEN 0 ELSE ABS(v_transaction.amount) END,
          metadata = metadata || jsonb_build_object(
            'wallet_credit', TRUE,
            'wallet_transaction_id', v_transaction.id,
            'wallet_reconciled', TRUE
          ),
          updated_at = NOW()
      WHERE id = v_reward.id;
      CONTINUE;
    END IF;

    IF v_reward.issued_wallet_id IS NOT NULL
       AND COALESCE((v_reward.metadata ->> 'migrated_to_wallet')::BOOLEAN, FALSE) THEN
      UPDATE referral_rewards
      SET issued_voucher_id = NULL,
          credited_amount = reward_value,
          available_amount = CASE WHEN status = 'redeemed' THEN 0 ELSE reward_value END,
          metadata = metadata || jsonb_build_object('wallet_credit', TRUE, 'wallet_reconciled', TRUE),
          updated_at = NOW()
      WHERE id = v_reward.id;
      CONTINUE;
    END IF;

    v_credit := v_reward.reward_value;
    IF v_reward.issued_voucher_id IS NOT NULL THEN
      SELECT * INTO v_voucher FROM finance_vouchers
      WHERE id = v_reward.issued_voucher_id FOR UPDATE;
      IF FOUND THEN
        v_credit := GREATEST(v_voucher.current_balance, 0);
        v_currency := v_voucher.currency;
      END IF;
    END IF;
    IF v_currency IS NULL THEN
      SELECT COALESCE(default_currency, 'EUR') INTO v_currency
      FROM accounts WHERE id = v_reward.account_id;
    END IF;

    IF v_credit > 0 AND v_reward.contact_id IS NOT NULL THEN
      INSERT INTO finance_client_wallets(account_id, contact_id, currency, balance)
      VALUES(v_reward.account_id, v_reward.contact_id, v_currency, v_credit)
      ON CONFLICT (account_id, contact_id, currency) DO UPDATE
        SET balance = finance_client_wallets.balance + EXCLUDED.balance,
            updated_at = NOW()
      RETURNING id, balance INTO v_wallet_id, v_balance;

      INSERT INTO finance_wallet_transactions(
        account_id, wallet_id, transaction_type, amount, balance_after,
        referral_reward_id, description, metadata
      ) VALUES (
        v_reward.account_id, v_wallet_id, 'credit', v_credit, v_balance,
        v_reward.id, 'Crédito reparado do programa Indique & Ganhe',
        jsonb_build_object('source', 'referral_wallet_repair', 'legacy_voucher_id', v_reward.issued_voucher_id)
      );
    ELSE
      v_wallet_id := v_reward.issued_wallet_id;
    END IF;

    IF v_reward.issued_voucher_id IS NOT NULL THEN
      UPDATE finance_vouchers
      SET current_balance = 0, remaining_uses = CASE WHEN voucher_type = 'service' THEN remaining_uses ELSE NULL END,
          status = 'cancelled', message = 'Migrado para o cartão-saldo do cliente', updated_at = NOW()
      WHERE id = v_reward.issued_voucher_id AND voucher_type = 'gift_card';
    END IF;

    UPDATE referral_rewards
    SET issued_wallet_id = v_wallet_id,
        issued_voucher_id = NULL,
        credited_amount = v_credit,
        available_amount = CASE WHEN status = 'redeemed' THEN 0 ELSE v_credit END,
        metadata = metadata || jsonb_build_object(
          'wallet_credit', TRUE,
          'wallet_id', v_wallet_id,
          'wallet_reconciled', TRUE
        ),
        updated_at = NOW()
    WHERE id = v_reward.id;
  END LOOP;
END;
$$;

-- Reconstruct the available portion of historical rewards from the current
-- wallet balance. FIFO spending means the newest credits remain available first.
DO $$
DECLARE
  v_wallet finance_client_wallets;
  v_reward referral_rewards;
  v_remaining NUMERIC(12,2);
  v_available NUMERIC(12,2);
BEGIN
  UPDATE referral_rewards
  SET available_amount = 0
  WHERE reward_type = 'fixed_credit' AND status IN ('issued', 'redeemed');

  FOR v_wallet IN
    SELECT DISTINCT w.*
    FROM finance_client_wallets w
    JOIN referral_rewards r ON r.issued_wallet_id = w.id
    WHERE r.reward_type = 'fixed_credit' AND r.status IN ('issued', 'redeemed')
  LOOP
    v_remaining := v_wallet.balance;
    FOR v_reward IN
      SELECT * FROM referral_rewards
      WHERE issued_wallet_id = v_wallet.id AND reward_type = 'fixed_credit'
        AND status IN ('issued', 'redeemed') AND credited_amount > 0
      ORDER BY issued_at DESC NULLS LAST, created_at DESC
      FOR UPDATE
    LOOP
      v_available := LEAST(v_reward.credited_amount, v_remaining);
      UPDATE referral_rewards
      SET available_amount = v_available,
          status = CASE WHEN v_available = 0 THEN 'redeemed' ELSE 'issued' END,
          redeemed_at = CASE WHEN v_available = 0 THEN COALESCE(redeemed_at, NOW()) ELSE NULL END,
          updated_at = NOW()
      WHERE id = v_reward.id;
      v_remaining := GREATEST(v_remaining - v_available, 0);
    END LOOP;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS issue_referral_reward(UUID);
CREATE FUNCTION issue_referral_reward(p_reward_id UUID)
RETURNS referral_rewards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reward referral_rewards;
  v_ref referrals;
  v_wallet_id UUID;
  v_wallet_balance NUMERIC(12,2);
  v_currency TEXT;
  v_voucher_id UUID;
  v_service_price NUMERIC(12,2);
  v_transaction_id UUID;
BEGIN
  SELECT * INTO v_reward FROM referral_rewards WHERE id = p_reward_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_reward.account_id, 'agent') THEN
    RAISE EXCEPTION 'Reward not found';
  END IF;
  IF v_reward.status IN ('issued', 'redeemed') THEN RETURN v_reward; END IF;
  IF v_reward.status <> 'pending' THEN RAISE EXCEPTION 'Reward can no longer be issued'; END IF;
  IF v_reward.contact_id IS NULL THEN RAISE EXCEPTION 'Reward requires a linked client'; END IF;
  IF v_reward.reward_type = 'percentage' THEN
    RAISE EXCEPTION 'Percentage benefits are applied to the referred client appointment';
  END IF;

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
      'Crédito do programa Indique & Ganhe',
      jsonb_build_object(
        'source', 'refer_a_friend',
        'referral_id', v_reward.referral_id,
        'beneficiary_type', v_reward.beneficiary_type
      )
    ) RETURNING id INTO v_transaction_id;
  ELSIF v_reward.reward_type = 'service' THEN
    SELECT price, COALESCE(currency, v_currency) INTO v_service_price, v_currency
    FROM clinic_services
    WHERE id = v_reward.service_id AND account_id = v_reward.account_id AND is_active;
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
      credited_amount = CASE WHEN reward_type = 'fixed_credit' THEN reward_value ELSE 0 END,
      available_amount = CASE WHEN reward_type = 'fixed_credit' THEN reward_value ELSE 0 END,
      reversed_amount = 0, reversed_at = NULL, reversed_by_user_id = NULL,
      reversal_reason = NULL,
      metadata = metadata || jsonb_build_object(
        'wallet_credit', v_reward.reward_type = 'fixed_credit',
        'wallet_id', v_wallet_id,
        'wallet_transaction_id', v_transaction_id,
        'voucher_id', v_voucher_id
      ),
      updated_at = NOW()
  WHERE id = p_reward_id RETURNING * INTO v_reward;

  INSERT INTO referral_events(account_id, referral_id, action, actor_user_id, metadata)
  VALUES(
    v_reward.account_id, v_reward.referral_id, 'reward_issued', auth.uid(),
    jsonb_build_object(
      'reward_id', v_reward.id, 'beneficiary', v_reward.beneficiary_type,
      'wallet_id', v_wallet_id, 'wallet_transaction_id', v_transaction_id,
      'voucher_id', v_voucher_id, 'value', v_reward.reward_value
    )
  );

  IF NOT EXISTS (
    SELECT 1 FROM referral_rewards
    WHERE referral_id = v_reward.referral_id AND status = 'pending'
  ) THEN
    UPDATE referrals SET status = 'rewarded', rewarded_at = COALESCE(rewarded_at, NOW()), updated_at = NOW()
    WHERE id = v_reward.referral_id;
  END IF;
  RETURN v_reward;
END;
$$;

-- Allocate wallet spending to referral credits using FIFO. This makes the
-- remaining value of each reward auditable instead of inferring it from the
-- wallet's aggregate balance.
CREATE OR REPLACE FUNCTION allocate_referral_wallet_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_remaining NUMERIC(12,2);
  v_take NUMERIC(12,2);
  v_reward referral_rewards;
  v_allocations JSONB := '[]'::JSONB;
  v_item JSONB;
BEGIN
  IF NEW.transaction_type = 'debit' AND NEW.amount < 0 THEN
    v_remaining := ABS(NEW.amount);
    FOR v_reward IN
      SELECT * FROM referral_rewards
      WHERE issued_wallet_id = NEW.wallet_id AND reward_type = 'fixed_credit'
        AND status = 'issued' AND available_amount > 0
      ORDER BY issued_at, created_at
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, v_reward.available_amount);
      UPDATE referral_rewards
      SET available_amount = available_amount - v_take,
          status = CASE WHEN available_amount - v_take = 0 THEN 'redeemed' ELSE status END,
          redeemed_at = CASE WHEN available_amount - v_take = 0 THEN NOW() ELSE redeemed_at END,
          updated_at = NOW()
      WHERE id = v_reward.id;
      IF v_reward.available_amount - v_take = 0 THEN
        INSERT INTO referral_events(account_id, referral_id, action, actor_user_id, metadata)
        VALUES(
          v_reward.account_id, v_reward.referral_id, 'reward_redeemed', auth.uid(),
          jsonb_build_object(
            'reward_id', v_reward.id, 'wallet_transaction_id', NEW.id,
            'amount', v_reward.credited_amount
          )
        );
      END IF;
      v_allocations := v_allocations || jsonb_build_array(
        jsonb_build_object('reward_id', v_reward.id, 'amount', v_take)
      );
      v_remaining := v_remaining - v_take;
    END LOOP;
    NEW.metadata := COALESCE(NEW.metadata, '{}'::JSONB) ||
      jsonb_build_object('referral_allocations', v_allocations);
  ELSIF NEW.transaction_type = 'refund' AND NEW.metadata ? 'original_payment_id' THEN
    SELECT metadata -> 'referral_allocations' INTO v_allocations
    FROM finance_wallet_transactions
    WHERE payment_id = (NEW.metadata ->> 'original_payment_id')::UUID
    LIMIT 1;
    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_allocations, '[]'::JSONB))
    LOOP
      UPDATE referral_rewards
      SET available_amount = LEAST(credited_amount, available_amount + (v_item ->> 'amount')::NUMERIC),
          status = 'issued', redeemed_at = NULL, updated_at = NOW()
      WHERE id = (v_item ->> 'reward_id')::UUID AND status IN ('issued', 'redeemed');
    END LOOP;
    NEW.metadata := COALESCE(NEW.metadata, '{}'::JSONB) ||
      jsonb_build_object('restored_referral_allocations', COALESCE(v_allocations, '[]'::JSONB));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS allocate_referral_wallet_transaction_trigger ON finance_wallet_transactions;
CREATE TRIGGER allocate_referral_wallet_transaction_trigger
  BEFORE INSERT ON finance_wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION allocate_referral_wallet_transaction();

DROP FUNCTION IF EXISTS reverse_referral_reward(UUID, TEXT);
CREATE FUNCTION reverse_referral_reward(p_reward_id UUID, p_reason TEXT)
RETURNS referral_rewards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reward referral_rewards;
  v_wallet finance_client_wallets;
  v_balance NUMERIC(12,2);
  v_voucher finance_vouchers;
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  SELECT * INTO v_reward FROM referral_rewards WHERE id = p_reward_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_reward.account_id, 'admin') THEN
    RAISE EXCEPTION 'Reward not found';
  END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'A reversal reason is required'; END IF;

  IF v_reward.status = 'pending' THEN
    NULL;
  ELSIF v_reward.status = 'issued' AND v_reward.reward_type = 'fixed_credit' THEN
    IF v_reward.issued_wallet_id IS NULL OR v_reward.credited_amount <= 0 THEN
      RAISE EXCEPTION 'The reward was not credited to a client wallet; run wallet reconciliation first';
    END IF;
    IF v_reward.available_amount < v_reward.credited_amount THEN
      RAISE EXCEPTION 'This referral credit has already been used in full or in part and cannot be reversed';
    END IF;
    SELECT * INTO v_wallet FROM finance_client_wallets
    WHERE id = v_reward.issued_wallet_id FOR UPDATE;
    IF NOT FOUND OR v_wallet.balance < v_reward.credited_amount THEN
      RAISE EXCEPTION 'The client wallet balance is insufficient to reverse this reward';
    END IF;
    UPDATE finance_client_wallets
    SET balance = balance - v_reward.credited_amount, updated_at = NOW()
    WHERE id = v_wallet.id RETURNING balance INTO v_balance;
    INSERT INTO finance_wallet_transactions(
      account_id, wallet_id, transaction_type, amount, balance_after,
      performed_by_user_id, description, metadata
    ) VALUES (
      v_reward.account_id, v_wallet.id, 'adjustment', -v_reward.credited_amount,
      v_balance, auth.uid(), 'Reversão de recompensa de indicação',
      jsonb_build_object('referral_reward_id', v_reward.id, 'reason', v_reason, 'source', 'referral_reversal')
    );
  ELSIF v_reward.status = 'issued' AND v_reward.reward_type = 'service' THEN
    SELECT * INTO v_voucher FROM finance_vouchers
    WHERE id = v_reward.issued_voucher_id FOR UPDATE;
    IF NOT FOUND OR v_voucher.status <> 'active' OR COALESCE(v_voucher.remaining_uses, 0) < 1 THEN
      RAISE EXCEPTION 'The issued service has already been used and cannot be reversed';
    END IF;
    UPDATE finance_vouchers SET status = 'cancelled', updated_at = NOW()
    WHERE id = v_voucher.id;
  ELSE
    RAISE EXCEPTION 'This reward can no longer be reversed';
  END IF;

  UPDATE referral_rewards
  SET status = 'cancelled', reversed_amount = credited_amount,
      available_amount = 0, reversed_at = NOW(), reversed_by_user_id = auth.uid(),
      reversal_reason = v_reason, updated_at = NOW()
  WHERE id = v_reward.id RETURNING * INTO v_reward;

  INSERT INTO referral_events(account_id, referral_id, action, reason, actor_user_id, metadata)
  VALUES(
    v_reward.account_id, v_reward.referral_id, 'reward_reversed', v_reason,
    auth.uid(), jsonb_build_object(
      'reward_id', v_reward.id, 'credited_amount', v_reward.credited_amount,
      'wallet_id', v_reward.issued_wallet_id, 'voucher_id', v_reward.issued_voucher_id
    )
  );
  UPDATE referrals
  SET status = CASE WHEN qualified_at IS NOT NULL THEN 'qualified' ELSE status END,
      rewarded_at = NULL, updated_at = NOW()
  WHERE id = v_reward.referral_id AND status = 'rewarded';
  RETURN v_reward;
END;
$$;

REVOKE EXECUTE ON FUNCTION issue_referral_reward(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reverse_referral_reward(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION issue_referral_reward(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_referral_reward(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
