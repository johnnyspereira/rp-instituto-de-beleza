-- Refer-a-friend program: configuration, customer codes, referrals and rewards.

CREATE TABLE IF NOT EXISTS referral_program_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  headline TEXT NOT NULL DEFAULT 'Partilhe bem-estar com quem gosta',
  description TEXT NOT NULL DEFAULT 'Convide um amigo e ambos recebem um benefício depois da primeira visita.',
  terms TEXT,
  qualification_event TEXT NOT NULL DEFAULT 'first_paid_sale'
    CHECK (qualification_event IN ('registration', 'completed_appointment', 'first_paid_sale')),
  referrer_reward_type TEXT NOT NULL DEFAULT 'fixed_credit'
    CHECK (referrer_reward_type IN ('none', 'fixed_credit', 'percentage', 'service')),
  referrer_reward_value NUMERIC(12,2) NOT NULL DEFAULT 10 CHECK (referrer_reward_value >= 0),
  referrer_service_id UUID REFERENCES clinic_services(id) ON DELETE SET NULL,
  friend_reward_type TEXT NOT NULL DEFAULT 'percentage'
    CHECK (friend_reward_type IN ('none', 'fixed_credit', 'percentage', 'service')),
  friend_reward_value NUMERIC(12,2) NOT NULL DEFAULT 10 CHECK (friend_reward_value >= 0),
  friend_service_id UUID REFERENCES clinic_services(id) ON DELETE SET NULL,
  reward_validity_days INTEGER NOT NULL DEFAULT 90 CHECK (reward_validity_days BETWEEN 1 AND 730),
  max_rewards_per_referrer INTEGER CHECK (max_rewards_per_referrer IS NULL OR max_rewards_per_referrer > 0),
  require_consent BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, contact_id),
  UNIQUE(account_id, code)
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE RESTRICT,
  referrer_contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  friend_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  friend_name TEXT NOT NULL,
  friend_phone TEXT NOT NULL,
  friend_phone_normalized TEXT NOT NULL,
  friend_email TEXT,
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('invited', 'registered', 'qualified', 'rewarded', 'rejected')),
  qualification_event TEXT,
  source TEXT NOT NULL DEFAULT 'public_page',
  consent_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  qualified_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, friend_phone_normalized)
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  beneficiary_type TEXT NOT NULL CHECK (beneficiary_type IN ('referrer', 'friend')),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('fixed_credit', 'percentage', 'service')),
  reward_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  service_id UUID REFERENCES clinic_services(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'redeemed', 'cancelled')),
  reward_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  issued_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referral_id, beneficiary_type)
);

CREATE INDEX IF NOT EXISTS referral_codes_contact_idx ON referral_codes(contact_id);
CREATE INDEX IF NOT EXISTS referrals_account_status_idx ON referrals(account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_friend_idx ON referrals(friend_contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_rewards_contact_idx ON referral_rewards(contact_id, status, created_at DESC);

ALTER TABLE referral_program_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view referral settings" ON referral_program_settings;
CREATE POLICY "Members view referral settings" ON referral_program_settings FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS "Admins manage referral settings" ON referral_program_settings;
CREATE POLICY "Admins manage referral settings" ON referral_program_settings FOR ALL
  USING (is_account_member(account_id, 'admin')) WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS "Members view referral codes" ON referral_codes;
CREATE POLICY "Members view referral codes" ON referral_codes FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS "Agents manage referral codes" ON referral_codes;
CREATE POLICY "Agents manage referral codes" ON referral_codes FOR ALL
  USING (is_account_member(account_id, 'agent')) WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Members view referrals" ON referrals;
CREATE POLICY "Members view referrals" ON referrals FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS "Agents manage referrals" ON referrals;
CREATE POLICY "Agents manage referrals" ON referrals FOR ALL
  USING (is_account_member(account_id, 'agent')) WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Members view referral rewards" ON referral_rewards;
CREATE POLICY "Members view referral rewards" ON referral_rewards FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS "Agents manage referral rewards" ON referral_rewards;
CREATE POLICY "Agents manage referral rewards" ON referral_rewards FOR ALL
  USING (is_account_member(account_id, 'agent')) WITH CHECK (is_account_member(account_id, 'agent'));

CREATE OR REPLACE FUNCTION make_referral_code(p_account_id UUID, p_contact_id UUID)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_code TEXT; v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := 'REF-' || UPPER(SUBSTRING(MD5(p_contact_id::TEXT || RANDOM()::TEXT) FROM 1 FOR 8));
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE account_id = p_account_id AND code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_contact_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO referral_codes(account_id, contact_id, code)
  VALUES (NEW.account_id, NEW.id, make_referral_code(NEW.account_id, NEW.id))
  ON CONFLICT (account_id, contact_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_contact_referral_code_trigger ON contacts;
CREATE TRIGGER ensure_contact_referral_code_trigger
  AFTER INSERT ON contacts FOR EACH ROW EXECUTE FUNCTION ensure_contact_referral_code();

INSERT INTO referral_codes(account_id, contact_id, code)
SELECT c.account_id, c.id, make_referral_code(c.account_id, c.id)
FROM contacts c
WHERE NOT EXISTS (SELECT 1 FROM referral_codes rc WHERE rc.contact_id = c.id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION create_referral_rewards(p_referral_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ref referrals; v_settings referral_program_settings; v_days INTEGER;
  v_previous_rewards INTEGER;
BEGIN
  SELECT * INTO v_ref FROM referrals WHERE id = p_referral_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_settings FROM referral_program_settings WHERE account_id = v_ref.account_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_days := v_settings.reward_validity_days;

  IF v_settings.max_rewards_per_referrer IS NOT NULL THEN
    SELECT COUNT(*) INTO v_previous_rewards FROM referrals
    WHERE referrer_contact_id=v_ref.referrer_contact_id
      AND id<>v_ref.id AND status IN ('qualified', 'rewarded');
    IF v_previous_rewards >= v_settings.max_rewards_per_referrer THEN
      UPDATE referrals SET metadata = metadata || '{"reward_limit_reached": true}'::JSONB,
        updated_at=NOW() WHERE id=v_ref.id;
      RETURN;
    END IF;
  END IF;

  IF v_settings.referrer_reward_type <> 'none' THEN
    INSERT INTO referral_rewards(account_id, referral_id, beneficiary_type, contact_id, reward_type,
      reward_value, service_id, reward_code, expires_at)
    VALUES (v_ref.account_id, v_ref.id, 'referrer', v_ref.referrer_contact_id,
      v_settings.referrer_reward_type, v_settings.referrer_reward_value,
      v_settings.referrer_service_id, 'RWD-' || UPPER(SUBSTRING(MD5(v_ref.id::TEXT || 'R') FROM 1 FOR 10)),
      NOW() + make_interval(days => v_days))
    ON CONFLICT (referral_id, beneficiary_type) DO NOTHING;
  END IF;
  IF v_settings.friend_reward_type <> 'none' THEN
    INSERT INTO referral_rewards(account_id, referral_id, beneficiary_type, contact_id, reward_type,
      reward_value, service_id, reward_code, expires_at)
    VALUES (v_ref.account_id, v_ref.id, 'friend', v_ref.friend_contact_id,
      v_settings.friend_reward_type, v_settings.friend_reward_value,
      v_settings.friend_service_id, 'RWD-' || UPPER(SUBSTRING(MD5(v_ref.id::TEXT || 'F') FROM 1 FOR 10)),
      NOW() + make_interval(days => v_days))
    ON CONFLICT (referral_id, beneficiary_type) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION qualify_referral_contact(p_contact_id UUID, p_event TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_referral_id UUID;
BEGIN
  SELECT r.id INTO v_referral_id
  FROM referrals r JOIN referral_program_settings s ON s.account_id = r.account_id
  WHERE r.friend_contact_id = p_contact_id AND r.status = 'registered'
    AND s.enabled AND s.qualification_event = p_event
  ORDER BY r.created_at LIMIT 1 FOR UPDATE OF r;
  IF v_referral_id IS NULL THEN RETURN; END IF;
  UPDATE referrals SET status='qualified', qualification_event=p_event,
    qualified_at=NOW(), updated_at=NOW() WHERE id=v_referral_id;
  PERFORM create_referral_rewards(v_referral_id);
END;
$$;

CREATE OR REPLACE FUNCTION manage_referral_status(p_referral_id UUID, p_status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_ref referrals;
BEGIN
  SELECT * INTO v_ref FROM referrals WHERE id=p_referral_id;
  IF NOT FOUND OR NOT is_account_member(v_ref.account_id, 'agent') THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;
  IF p_status = 'qualified' THEN
    UPDATE referrals SET status='qualified', qualification_event='manual',
      qualified_at=COALESCE(qualified_at, NOW()), updated_at=NOW() WHERE id=p_referral_id;
    PERFORM create_referral_rewards(p_referral_id);
  ELSIF p_status = 'rejected' THEN
    UPDATE referrals SET status='rejected', rejected_at=NOW(), updated_at=NOW() WHERE id=p_referral_id;
    UPDATE referral_rewards SET status='cancelled', updated_at=NOW()
      WHERE referral_id=p_referral_id AND status='pending';
  ELSE
    RAISE EXCEPTION 'Invalid referral status';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION issue_referral_reward(p_reward_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_reward referral_rewards;
BEGIN
  SELECT * INTO v_reward FROM referral_rewards WHERE id=p_reward_id;
  IF NOT FOUND OR NOT is_account_member(v_reward.account_id, 'agent') THEN
    RAISE EXCEPTION 'Reward not found';
  END IF;
  UPDATE referral_rewards SET status='issued', issued_at=NOW(),
    issued_by_user_id=auth.uid(), updated_at=NOW() WHERE id=p_reward_id;
  IF NOT EXISTS (
    SELECT 1 FROM referral_rewards WHERE referral_id=v_reward.referral_id AND status='pending'
  ) THEN
    UPDATE referrals SET status='rewarded', rewarded_at=NOW(), updated_at=NOW()
      WHERE id=v_reward.referral_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION qualify_referral_after_appointment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.contact_id IS NOT NULL THEN
    PERFORM qualify_referral_contact(NEW.contact_id, 'completed_appointment');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS qualify_referral_after_appointment_trigger ON clinic_appointments;
CREATE TRIGGER qualify_referral_after_appointment_trigger AFTER UPDATE OF status ON clinic_appointments
  FOR EACH ROW EXECUTE FUNCTION qualify_referral_after_appointment();

CREATE OR REPLACE FUNCTION qualify_referral_after_sale()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.contact_id IS NOT NULL THEN
    PERFORM qualify_referral_contact(NEW.contact_id, 'first_paid_sale');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS qualify_referral_after_sale_trigger ON finance_sales;
CREATE TRIGGER qualify_referral_after_sale_trigger AFTER UPDATE OF status ON finance_sales
  FOR EACH ROW EXECUTE FUNCTION qualify_referral_after_sale();

GRANT EXECUTE ON FUNCTION qualify_referral_contact(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION manage_referral_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION issue_referral_reward(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
