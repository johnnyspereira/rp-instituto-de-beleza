-- Referral integrity, eligibility, lifecycle audit and reward reversal.

ALTER TABLE referral_program_settings
  ADD COLUMN IF NOT EXISTS new_clients_only BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS campaign_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS campaign_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_privacy_text TEXT,
  ADD COLUMN IF NOT EXISTS minimum_qualifying_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE referral_program_settings
  DROP CONSTRAINT IF EXISTS referral_program_campaign_dates_check;
ALTER TABLE referral_program_settings
  ADD CONSTRAINT referral_program_campaign_dates_check CHECK (
    campaign_ends_at IS NULL OR campaign_starts_at IS NULL OR campaign_ends_at > campaign_starts_at
  );

ALTER TABLE referral_program_settings
  DROP CONSTRAINT IF EXISTS referral_program_minimum_amount_check;
ALTER TABLE referral_program_settings
  ADD CONSTRAINT referral_program_minimum_amount_check
  CHECK (minimum_qualifying_amount >= 0);

ALTER TABLE referral_events DROP CONSTRAINT IF EXISTS referral_events_action_check;
ALTER TABLE referral_events ADD CONSTRAINT referral_events_action_check CHECK (
  action IN (
    'created', 'contacted', 'scheduled', 'qualified', 'reward_issued',
    'reward_redeemed', 'reward_reversed', 'lost', 'not_qualified', 'note'
  )
);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'conversation_assigned', 'new_message_received', 'conversation_waiting',
  'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost',
  'follow_up_due', 'task_due', 'automation_failed', 'flow_handoff',
  'flow_failed', 'whatsapp_connected', 'whatsapp_disconnected',
  'broadcast_completed', 'broadcast_failed', 'work_time_missing',
  'work_time_pause_pending', 'referral_registered', 'referral_qualified',
  'referral_reward_issued', 'system_alert'
));

CREATE INDEX IF NOT EXISTS referrals_account_friend_status_idx
  ON referrals(account_id, friend_contact_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_rewards_referral_status_idx
  ON referral_rewards(referral_id, status);

CREATE OR REPLACE FUNCTION validate_referral_reward_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'issued' AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.reward_type = 'percentage' THEN
    RAISE EXCEPTION 'Percentage rewards are redeemed through the referred client appointment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_referral_reward_status_trigger ON referral_rewards;
CREATE TRIGGER validate_referral_reward_status_trigger
  BEFORE UPDATE OF status ON referral_rewards
  FOR EACH ROW EXECUTE FUNCTION validate_referral_reward_status();

CREATE OR REPLACE FUNCTION referral_campaign_is_open(p_settings referral_program_settings)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p_settings.enabled
    AND (p_settings.campaign_starts_at IS NULL OR p_settings.campaign_starts_at <= NOW())
    AND (p_settings.campaign_ends_at IS NULL OR p_settings.campaign_ends_at > NOW());
$$;

CREATE OR REPLACE FUNCTION validate_referral_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_settings referral_program_settings;
BEGIN
  IF NEW.friend_contact_id IS NOT NULL AND NEW.friend_contact_id = NEW.referrer_contact_id THEN
    RAISE EXCEPTION 'A client cannot refer themselves';
  END IF;

  SELECT * INTO v_settings
  FROM referral_program_settings
  WHERE account_id = NEW.account_id;

  IF NOT FOUND OR NOT referral_campaign_is_open(v_settings) THEN
    RAISE EXCEPTION 'The referral campaign is not currently available';
  END IF;

  IF v_settings.new_clients_only
     AND COALESCE((NEW.metadata ->> 'contact_created')::BOOLEAN, FALSE) = FALSE THEN
    RAISE EXCEPTION 'This campaign is exclusive to new clients';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_referral_insert_trigger ON referrals;
CREATE TRIGGER validate_referral_insert_trigger
  BEFORE INSERT ON referrals FOR EACH ROW EXECUTE FUNCTION validate_referral_insert();

CREATE OR REPLACE FUNCTION record_referral_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO referral_events(account_id, referral_id, action, actor_user_id, metadata)
  VALUES(
    NEW.account_id, NEW.id, 'created', auth.uid(),
    jsonb_build_object('source', NEW.source, 'friend_contact_id', NEW.friend_contact_id)
  );
  INSERT INTO notifications(
    account_id, user_id, type, contact_id, actor_user_id, title, body,
    category, priority, action_url, metadata
  )
  SELECT
    NEW.account_id, p.user_id, 'referral_registered', NEW.friend_contact_id,
    auth.uid(), 'Nova indicação recebida',
    NEW.friend_name || ' participou através do código de indicação.',
    'sales', 'normal', '/referrals',
    jsonb_build_object('referral_id', NEW.id, 'referrer_contact_id', NEW.referrer_contact_id)
  FROM profiles p
  WHERE p.account_id = NEW.account_id
    AND p.account_role IN ('owner', 'admin');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_referral_created_trigger ON referrals;
CREATE TRIGGER record_referral_created_trigger
  AFTER INSERT ON referrals FOR EACH ROW EXECUTE FUNCTION record_referral_created();

CREATE OR REPLACE FUNCTION notify_referral_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref referrals;
  v_type TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.action NOT IN ('qualified', 'reward_issued') THEN RETURN NEW; END IF;
  SELECT * INTO v_ref FROM referrals WHERE id = NEW.referral_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.action = 'qualified' THEN
    v_type := 'referral_qualified';
    v_title := 'Indicação qualificada';
    v_body := v_ref.friend_name || ' cumpriu a regra da campanha.';
  ELSE
    v_type := 'referral_reward_issued';
    v_title := 'Recompensa de indicação emitida';
    v_body := 'Uma recompensa de ' || v_ref.friend_name || ' foi emitida.';
  END IF;

  INSERT INTO notifications(
    account_id, user_id, type, contact_id, actor_user_id, title, body,
    category, priority, action_url, metadata
  )
  SELECT
    NEW.account_id, p.user_id, v_type, v_ref.friend_contact_id,
    NEW.actor_user_id, v_title, v_body, 'sales',
    CASE WHEN NEW.action = 'qualified' THEN 'high' ELSE 'normal' END,
    '/referrals',
    jsonb_build_object('referral_id', NEW.referral_id, 'event_id', NEW.id)
  FROM profiles p
  WHERE p.account_id = NEW.account_id
    AND p.account_role IN ('owner', 'admin');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_referral_event_trigger ON referral_events;
CREATE TRIGGER notify_referral_event_trigger
  AFTER INSERT ON referral_events FOR EACH ROW EXECUTE FUNCTION notify_referral_event();

INSERT INTO referral_events(account_id, referral_id, action, metadata, created_at)
SELECT
  r.account_id, r.id, 'created',
  jsonb_build_object('source', r.source, 'backfilled', TRUE), r.created_at
FROM referrals r
WHERE NOT EXISTS (
  SELECT 1 FROM referral_events e
  WHERE e.referral_id = r.id AND e.action = 'created'
);

CREATE OR REPLACE FUNCTION create_referral_rewards(p_referral_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref referrals;
  v_settings referral_program_settings;
  v_previous_rewards INTEGER;
BEGIN
  SELECT * INTO v_ref FROM referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND OR v_ref.status NOT IN ('qualified', 'rewarded') THEN RETURN; END IF;

  SELECT * INTO v_settings FROM referral_program_settings
  WHERE account_id = v_ref.account_id;
  IF NOT FOUND OR NOT referral_campaign_is_open(v_settings) THEN RETURN; END IF;

  IF v_settings.max_rewards_per_referrer IS NOT NULL THEN
    SELECT COUNT(*) INTO v_previous_rewards
    FROM referrals
    WHERE referrer_contact_id = v_ref.referrer_contact_id
      AND id <> v_ref.id
      AND status IN ('qualified', 'rewarded');
    IF v_previous_rewards >= v_settings.max_rewards_per_referrer THEN
      UPDATE referrals
      SET metadata = metadata || jsonb_build_object('reward_limit_reached', TRUE),
          updated_at = NOW()
      WHERE id = v_ref.id;
      RETURN;
    END IF;
  END IF;

  IF v_settings.referrer_reward_type <> 'none' THEN
    INSERT INTO referral_rewards(
      account_id, referral_id, beneficiary_type, contact_id, reward_type,
      reward_value, service_id, reward_code, expires_at
    ) VALUES (
      v_ref.account_id, v_ref.id, 'referrer', v_ref.referrer_contact_id,
      v_settings.referrer_reward_type, v_settings.referrer_reward_value,
      v_settings.referrer_service_id,
      'RWD-' || UPPER(SUBSTRING(MD5(v_ref.id::TEXT || 'R') FROM 1 FOR 10)),
      NOW() + make_interval(days => v_settings.reward_validity_days)
    ) ON CONFLICT (referral_id, beneficiary_type) DO NOTHING;
  END IF;

  -- The friend's reward is redeemed by the appointment discount trigger.
  IF v_settings.friend_reward_type <> 'none' THEN
    INSERT INTO referral_rewards(
      account_id, referral_id, beneficiary_type, contact_id, reward_type,
      reward_value, service_id, reward_code, expires_at
    ) VALUES (
      v_ref.account_id, v_ref.id, 'friend', v_ref.friend_contact_id,
      v_settings.friend_reward_type, v_settings.friend_reward_value,
      v_settings.friend_service_id,
      'RWD-' || UPPER(SUBSTRING(MD5(v_ref.id::TEXT || 'F') FROM 1 FOR 10)),
      NOW() + make_interval(days => v_settings.reward_validity_days)
    ) ON CONFLICT (referral_id, beneficiary_type) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION qualify_referral_contact(p_contact_id UUID, p_event TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref referrals;
  v_settings referral_program_settings;
BEGIN
  SELECT r.* INTO v_ref
  FROM referrals r
  JOIN referral_program_settings s ON s.account_id = r.account_id
  WHERE r.friend_contact_id = p_contact_id
    AND r.status IN ('registered', 'contacted', 'scheduled')
    AND s.qualification_event = p_event
    AND referral_campaign_is_open(s)
  ORDER BY r.created_at
  LIMIT 1
  FOR UPDATE OF r;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_settings
  FROM referral_program_settings
  WHERE account_id = v_ref.account_id;

  UPDATE referrals
  SET status = 'qualified', qualification_event = p_event,
      qualified_at = COALESCE(qualified_at, NOW()), updated_at = NOW()
  WHERE id = v_ref.id;

  INSERT INTO referral_events(account_id, referral_id, action, actor_user_id, metadata)
  VALUES(
    v_ref.account_id, v_ref.id, 'qualified', auth.uid(),
    jsonb_build_object('qualification_event', p_event, 'automatic', TRUE)
  );

  PERFORM create_referral_rewards(v_ref.id);

  IF EXISTS (SELECT 1 FROM referral_rewards WHERE referral_id = v_ref.id)
     AND NOT EXISTS (
       SELECT 1 FROM referral_rewards
       WHERE referral_id = v_ref.id AND status = 'pending'
     ) THEN
    UPDATE referrals
    SET status = 'rewarded', rewarded_at = COALESCE(rewarded_at, NOW()), updated_at = NOW()
    WHERE id = v_ref.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION manage_referral_status(p_referral_id UUID, p_status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_ref referrals;
BEGIN
  SELECT * INTO v_ref FROM referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_ref.account_id, 'agent') THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;
  IF p_status <> 'qualified' THEN RAISE EXCEPTION 'Invalid referral status'; END IF;
  IF v_ref.status IN ('rejected', 'rewarded') THEN
    RAISE EXCEPTION 'This referral can no longer be qualified';
  END IF;

  UPDATE referrals
  SET status = 'qualified', qualification_event = 'manual',
      qualified_at = COALESCE(qualified_at, NOW()), updated_at = NOW()
  WHERE id = p_referral_id;

  INSERT INTO referral_events(account_id, referral_id, action, actor_user_id, metadata)
  VALUES(v_ref.account_id, v_ref.id, 'qualified', auth.uid(), '{"automatic": false}'::JSONB);

  PERFORM create_referral_rewards(p_referral_id);

  IF EXISTS (SELECT 1 FROM referral_rewards WHERE referral_id = p_referral_id)
     AND NOT EXISTS (
       SELECT 1 FROM referral_rewards
       WHERE referral_id = p_referral_id AND status = 'pending'
     ) THEN
    UPDATE referrals
    SET status = 'rewarded', rewarded_at = COALESCE(rewarded_at, NOW()), updated_at = NOW()
    WHERE id = p_referral_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION qualify_referral_after_appointment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.contact_id IS NOT NULL THEN
    PERFORM qualify_referral_contact(NEW.contact_id, 'completed_appointment');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qualify_referral_after_appointment_trigger ON clinic_appointments;
CREATE TRIGGER qualify_referral_after_appointment_trigger
  AFTER INSERT OR UPDATE OF status ON clinic_appointments
  FOR EACH ROW EXECUTE FUNCTION qualify_referral_after_appointment();

CREATE OR REPLACE FUNCTION qualify_referral_after_sale()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_minimum NUMERIC(12,2);
BEGIN
  IF NEW.status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.contact_id IS NOT NULL THEN
    SELECT minimum_qualifying_amount INTO v_minimum
    FROM referral_program_settings WHERE account_id = NEW.account_id;
    IF NEW.total_amount >= COALESCE(v_minimum, 0) THEN
      PERFORM qualify_referral_contact(NEW.contact_id, 'first_paid_sale');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qualify_referral_after_sale_trigger ON finance_sales;
CREATE TRIGGER qualify_referral_after_sale_trigger
  AFTER INSERT OR UPDATE OF status ON finance_sales
  FOR EACH ROW EXECUTE FUNCTION qualify_referral_after_sale();

CREATE OR REPLACE FUNCTION apply_referral_appointment_discount()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_ref referrals;
  v_settings referral_program_settings;
  v_discount NUMERIC(12,2) := 0;
BEGIN
  -- Manual appointments also inherit the active referral for this client.
  IF NEW.referral_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT * INTO v_ref
    FROM referrals
    WHERE account_id = NEW.account_id
      AND friend_contact_id = NEW.contact_id
      AND status IN ('registered', 'contacted', 'scheduled', 'qualified')
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;
    IF FOUND THEN NEW.referral_id := v_ref.id; END IF;
  ELSIF NEW.referral_id IS NOT NULL THEN
    SELECT * INTO v_ref FROM referrals WHERE id = NEW.referral_id FOR UPDATE;
  END IF;

  IF NEW.referral_id IS NULL THEN RETURN NEW; END IF;
  IF NOT FOUND OR v_ref.account_id <> NEW.account_id THEN
    RAISE EXCEPTION 'Referral not found for this workspace';
  END IF;
  IF v_ref.friend_contact_id IS NULL OR v_ref.friend_contact_id <> NEW.contact_id THEN
    RAISE EXCEPTION 'The appointment client does not match the referred friend';
  END IF;
  IF v_ref.status IN ('rejected', 'rewarded') THEN
    RAISE EXCEPTION 'This referral can no longer receive the new-client benefit';
  END IF;
  IF EXISTS (
    SELECT 1 FROM referral_rewards
    WHERE referral_id = v_ref.id AND beneficiary_type = 'friend'
      AND status IN ('issued', 'redeemed')
  ) THEN
    RAISE EXCEPTION 'The new-client referral benefit has already been applied';
  END IF;

  SELECT * INTO v_settings FROM referral_program_settings
  WHERE account_id = NEW.account_id;
  IF NOT FOUND OR NOT referral_campaign_is_open(v_settings) THEN
    RAISE EXCEPTION 'The referral program is not active';
  END IF;

  NEW.source := 'referral';
  NEW.original_price := NEW.price;
  NEW.referral_discount_type := NULL;
  NEW.referral_discount_value := NULL;
  NEW.referral_discount_amount := 0;

  IF v_settings.friend_reward_type = 'fixed_credit' THEN
    v_discount := LEAST(NEW.price, v_settings.friend_reward_value);
  ELSIF v_settings.friend_reward_type = 'percentage' THEN
    v_discount := ROUND(
      NEW.price * LEAST(v_settings.friend_reward_value, 100) / 100,
      2
    );
  ELSIF v_settings.friend_reward_type = 'service' THEN
    IF v_settings.friend_service_id IS DISTINCT FROM NEW.service_id THEN
      RAISE EXCEPTION 'The referral benefit is only valid for the configured service';
    END IF;
    v_discount := NEW.price;
  END IF;

  IF v_settings.friend_reward_type <> 'none' AND v_discount > 0 THEN
    NEW.referral_discount_type := v_settings.friend_reward_type;
    NEW.referral_discount_value := v_settings.friend_reward_value;
    NEW.referral_discount_amount := v_discount;
    NEW.price := GREATEST(NEW.price - v_discount, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_referral_appointment_discount_trigger ON clinic_appointments;
CREATE TRIGGER apply_referral_appointment_discount_trigger
  BEFORE INSERT ON clinic_appointments FOR EACH ROW
  EXECUTE FUNCTION apply_referral_appointment_discount();

CREATE OR REPLACE FUNCTION reverse_referral_reward(p_reward_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_reward referral_rewards;
  v_wallet finance_client_wallets;
  v_balance NUMERIC(12,2);
  v_voucher finance_vouchers;
BEGIN
  SELECT * INTO v_reward FROM referral_rewards WHERE id = p_reward_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_reward.account_id, 'admin') THEN
    RAISE EXCEPTION 'Reward not found';
  END IF;
  IF v_reward.status = 'pending' THEN
    UPDATE referral_rewards SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_reward_id;
  ELSIF v_reward.status = 'issued' AND v_reward.reward_type = 'fixed_credit' THEN
    SELECT * INTO v_wallet FROM finance_client_wallets
    WHERE id = v_reward.issued_wallet_id FOR UPDATE;
    IF NOT FOUND OR v_wallet.balance < v_reward.reward_value THEN
      RAISE EXCEPTION 'The issued balance has already been used and cannot be reversed';
    END IF;
    UPDATE finance_client_wallets
    SET balance = balance - v_reward.reward_value, updated_at = NOW()
    WHERE id = v_wallet.id RETURNING balance INTO v_balance;
    INSERT INTO finance_wallet_transactions(
      account_id, wallet_id, transaction_type, amount, balance_after,
      performed_by_user_id, description, metadata
    ) VALUES (
      v_reward.account_id, v_wallet.id, 'adjustment', -v_reward.reward_value,
      v_balance, auth.uid(), 'Reversão de recompensa de indicação',
      jsonb_build_object('referral_reward_id', v_reward.id, 'reason', NULLIF(BTRIM(p_reason), ''))
    );
    UPDATE referral_rewards SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_reward_id;
  ELSIF v_reward.status = 'issued' AND v_reward.reward_type = 'service' THEN
    SELECT * INTO v_voucher FROM finance_vouchers
    WHERE id = v_reward.issued_voucher_id FOR UPDATE;
    IF NOT FOUND OR v_voucher.status <> 'active' OR v_voucher.current_balance < v_voucher.initial_balance THEN
      RAISE EXCEPTION 'The issued service has already been used and cannot be reversed';
    END IF;
    UPDATE finance_vouchers SET status = 'cancelled', updated_at = NOW()
    WHERE id = v_voucher.id;
    UPDATE referral_rewards SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_reward_id;
  ELSE
    RAISE EXCEPTION 'This reward can no longer be reversed';
  END IF;

  INSERT INTO referral_events(account_id, referral_id, action, reason, actor_user_id, metadata)
  VALUES(
    v_reward.account_id, v_reward.referral_id, 'reward_reversed',
    NULLIF(BTRIM(p_reason), ''), auth.uid(), jsonb_build_object('reward_id', v_reward.id)
  );

  UPDATE referrals
  SET status = CASE WHEN qualified_at IS NOT NULL THEN 'qualified' ELSE status END,
      rewarded_at = NULL, updated_at = NOW()
  WHERE id = v_reward.referral_id AND status = 'rewarded';
END;
$$;

GRANT EXECUTE ON FUNCTION manage_referral_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_referral_reward(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION qualify_referral_contact(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
