-- Referral operations and real wallet credit issuance.

ALTER TABLE referral_rewards
  ADD COLUMN IF NOT EXISTS issued_voucher_id UUID REFERENCES finance_vouchers(id) ON DELETE SET NULL;

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT;

ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE referrals ADD CONSTRAINT referrals_status_check
  CHECK (status IN ('invited', 'registered', 'contacted', 'scheduled', 'qualified', 'rewarded', 'rejected'));

CREATE TABLE IF NOT EXISTS referral_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'contacted', 'scheduled', 'qualified', 'reward_issued',
    'reward_redeemed', 'lost', 'note'
  )),
  reason TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_events_referral_idx
  ON referral_events(referral_id, created_at DESC);
ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view referral events" ON referral_events;
CREATE POLICY "Members view referral events" ON referral_events FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS "Agents manage referral events" ON referral_events;
CREATE POLICY "Agents manage referral events" ON referral_events FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

CREATE OR REPLACE FUNCTION mark_referral_contacted(p_referral_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_ref referrals;
BEGIN
  SELECT * INTO v_ref FROM referrals WHERE id=p_referral_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_ref.account_id, 'agent') THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;
  IF v_ref.status IN ('rejected', 'rewarded') THEN
    RAISE EXCEPTION 'Referral can no longer be contacted';
  END IF;
  UPDATE referrals SET status=CASE WHEN status='registered' THEN 'contacted' ELSE status END,
    contacted_at=NOW(), updated_at=NOW() WHERE id=p_referral_id;
  INSERT INTO referral_events(account_id, referral_id, action, actor_user_id)
  VALUES(v_ref.account_id, v_ref.id, 'contacted', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION mark_referral_lost(p_referral_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_ref referrals;
BEGIN
  SELECT * INTO v_ref FROM referrals WHERE id=p_referral_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_ref.account_id, 'agent') THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM referral_rewards WHERE referral_id=p_referral_id
      AND status IN ('issued', 'redeemed')
  ) THEN
    RAISE EXCEPTION 'Issued rewards must be cancelled before marking this referral as lost';
  END IF;
  UPDATE referrals SET status='rejected', rejected_at=NOW(), lost_at=NOW(),
    lost_reason=NULLIF(BTRIM(p_reason), ''), rejection_reason=NULLIF(BTRIM(p_reason), ''),
    updated_at=NOW() WHERE id=p_referral_id;
  UPDATE referral_rewards SET status='cancelled', updated_at=NOW()
    WHERE referral_id=p_referral_id AND status='pending';
  INSERT INTO referral_events(account_id, referral_id, action, reason, actor_user_id)
  VALUES(v_ref.account_id, v_ref.id, 'lost', NULLIF(BTRIM(p_reason), ''), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION issue_referral_reward(p_reward_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_reward referral_rewards;
  v_ref referrals;
  v_voucher_id UUID;
  v_currency TEXT;
  v_service_price NUMERIC(12,2);
  v_actor_name TEXT;
BEGIN
  SELECT * INTO v_reward FROM referral_rewards WHERE id=p_reward_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_reward.account_id, 'agent') THEN
    RAISE EXCEPTION 'Reward not found';
  END IF;
  IF v_reward.status <> 'pending' THEN
    RAISE EXCEPTION 'Reward has already been processed';
  END IF;
  IF v_reward.contact_id IS NULL THEN
    RAISE EXCEPTION 'Reward requires a linked client';
  END IF;

  SELECT * INTO v_ref FROM referrals WHERE id=v_reward.referral_id;
  SELECT COALESCE(default_currency, 'EUR') INTO v_currency
  FROM accounts WHERE id=v_reward.account_id;

  IF v_reward.reward_type = 'fixed_credit' THEN
    IF v_reward.reward_value <= 0 THEN RAISE EXCEPTION 'Reward value must be positive'; END IF;
    SELECT id INTO v_voucher_id FROM finance_vouchers
    WHERE account_id=v_reward.account_id AND owner_contact_id=v_reward.contact_id
      AND voucher_type='gift_card' AND status='active'
      AND message='Crédito acumulado do programa Indique & Ganhe'
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF v_voucher_id IS NULL THEN
      INSERT INTO finance_vouchers(
        account_id, owner_contact_id, code, initial_balance, current_balance,
        currency, status, recipient_name, message, expires_at
      ) VALUES (
        v_reward.account_id, v_reward.contact_id, v_reward.reward_code,
        v_reward.reward_value, v_reward.reward_value, v_currency, 'active',
        CASE WHEN v_reward.beneficiary_type='referrer' THEN v_ref.friend_name ELSE NULL END,
        'Crédito acumulado do programa Indique & Ganhe', v_reward.expires_at
      ) RETURNING id INTO v_voucher_id;
    ELSE
      UPDATE finance_vouchers SET
        initial_balance=initial_balance+v_reward.reward_value,
        current_balance=current_balance+v_reward.reward_value,
        expires_at=GREATEST(expires_at, v_reward.expires_at), updated_at=NOW()
      WHERE id=v_voucher_id;
      v_actor_name := finance_actor_name(auth.uid());
      INSERT INTO finance_benefit_logs(
        account_id, voucher_id, action, amount, performed_by_user_id,
        performed_by_name, approved_by_user_id, approved_by_name, notes, metadata
      ) VALUES (
        v_reward.account_id, v_voucher_id, 'adjusted', v_reward.reward_value,
        auth.uid(), v_actor_name, auth.uid(), v_actor_name,
        'Cashback de nova indicação qualificada',
        jsonb_build_object('source', 'refer_a_friend', 'reward_id', v_reward.id)
      );
    END IF;
  ELSIF v_reward.reward_type = 'service' THEN
    SELECT price, COALESCE(currency, v_currency) INTO v_service_price, v_currency
    FROM clinic_services WHERE id=v_reward.service_id;
    IF v_service_price IS NULL THEN RAISE EXCEPTION 'Reward service not found'; END IF;
    INSERT INTO finance_vouchers(
      account_id, owner_contact_id, code, initial_balance, current_balance,
      currency, status, message, expires_at
    ) VALUES (
      v_reward.account_id, v_reward.contact_id, v_reward.reward_code,
      v_service_price, v_service_price, v_currency, 'active',
      'Procedimento do programa Indique & Ganhe', v_reward.expires_at
    ) RETURNING id INTO v_voucher_id;
    UPDATE finance_vouchers SET voucher_type='service', service_id=v_reward.service_id,
      remaining_uses=1 WHERE id=v_voucher_id;
  END IF;

  UPDATE referral_rewards SET status='issued', issued_at=NOW(),
    issued_by_user_id=auth.uid(), issued_voucher_id=v_voucher_id,
    metadata=metadata || jsonb_build_object(
      'wallet_credit', v_reward.reward_type IN ('fixed_credit', 'service'),
      'voucher_id', v_voucher_id
    ), updated_at=NOW()
  WHERE id=p_reward_id;

  INSERT INTO referral_events(account_id, referral_id, action, actor_user_id, metadata)
  VALUES(v_reward.account_id, v_reward.referral_id, 'reward_issued', auth.uid(),
    jsonb_build_object('reward_id', v_reward.id, 'beneficiary', v_reward.beneficiary_type,
      'voucher_id', v_voucher_id, 'value', v_reward.reward_value));

  IF NOT EXISTS (
    SELECT 1 FROM referral_rewards WHERE referral_id=v_reward.referral_id AND status='pending'
  ) THEN
    UPDATE referrals SET status='rewarded', rewarded_at=NOW(), updated_at=NOW()
      WHERE id=v_reward.referral_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION track_referral_scheduled_appointment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_referral referrals;
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_referral FROM referrals
  WHERE friend_contact_id=NEW.contact_id AND status IN ('registered', 'contacted')
  ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;
  UPDATE referrals SET status='scheduled', scheduled_at=NOW(), updated_at=NOW()
    WHERE id=v_referral.id;
  INSERT INTO referral_events(account_id, referral_id, action, actor_user_id, metadata)
  VALUES(v_referral.account_id, v_referral.id, 'scheduled', auth.uid(),
    jsonb_build_object('appointment_id', NEW.id, 'scheduled_start', NEW.scheduled_start));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_referral_scheduled_appointment_trigger ON clinic_appointments;
CREATE TRIGGER track_referral_scheduled_appointment_trigger
  AFTER INSERT ON clinic_appointments FOR EACH ROW
  EXECUTE FUNCTION track_referral_scheduled_appointment();

GRANT EXECUTE ON FUNCTION mark_referral_contacted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_referral_lost(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION issue_referral_reward(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
