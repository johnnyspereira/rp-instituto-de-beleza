-- Connect a referral to the first appointment and apply the friend's benefit.
ALTER TABLE clinic_appointments
  ADD COLUMN IF NOT EXISTS referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS referral_discount_type TEXT,
  ADD COLUMN IF NOT EXISTS referral_discount_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS referral_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS clinic_appointments_referral_idx
  ON clinic_appointments(referral_id) WHERE referral_id IS NOT NULL;

ALTER TABLE clinic_appointments DROP CONSTRAINT IF EXISTS clinic_appointments_source_check;
ALTER TABLE clinic_appointments ADD CONSTRAINT clinic_appointments_source_check
  CHECK (source IN ('manual', 'public_link', 'whatsapp', 'automation', 'referral'));

ALTER TABLE clinic_appointments DROP CONSTRAINT IF EXISTS clinic_appointments_referral_discount_type_check;
ALTER TABLE clinic_appointments ADD CONSTRAINT clinic_appointments_referral_discount_type_check
  CHECK (referral_discount_type IS NULL OR referral_discount_type IN ('fixed_credit', 'percentage', 'service'));

CREATE OR REPLACE FUNCTION apply_referral_appointment_discount()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_ref referrals;
  v_settings referral_program_settings;
  v_discount NUMERIC(12,2) := 0;
BEGIN
  IF NEW.referral_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_ref FROM referrals WHERE id = NEW.referral_id FOR UPDATE;
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
  WHERE account_id = NEW.account_id AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'The referral program is not active'; END IF;

  NEW.source := 'referral';
  NEW.original_price := NEW.price;
  NEW.referral_discount_type := NULL;
  NEW.referral_discount_value := NULL;
  NEW.referral_discount_amount := 0;

  IF v_settings.friend_reward_type = 'fixed_credit' THEN
    v_discount := LEAST(NEW.price, v_settings.friend_reward_value);
  ELSIF v_settings.friend_reward_type = 'percentage' THEN
    v_discount := ROUND(NEW.price * LEAST(v_settings.friend_reward_value, 100) / 100, 2);
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

CREATE OR REPLACE FUNCTION track_referral_scheduled_appointment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_referral referrals;
  v_settings referral_program_settings;
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.referral_id IS NOT NULL THEN
    SELECT * INTO v_referral FROM referrals WHERE id = NEW.referral_id;
  ELSE
    SELECT * INTO v_referral FROM referrals
    WHERE friend_contact_id = NEW.contact_id AND status IN ('registered', 'contacted')
    ORDER BY created_at LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN NEW; END IF;

  UPDATE referrals
  SET status = CASE WHEN status IN ('registered', 'contacted') THEN 'scheduled' ELSE status END,
      scheduled_at = COALESCE(scheduled_at, NOW()),
      metadata = metadata || jsonb_build_object(
        'appointment_id', NEW.id,
        'friend_discount_amount', NEW.referral_discount_amount
      ),
      updated_at = NOW()
  WHERE id = v_referral.id;

  SELECT * INTO v_settings FROM referral_program_settings
  WHERE account_id = v_referral.account_id;

  IF NEW.referral_discount_amount > 0 AND v_settings.friend_reward_type <> 'none' THEN
    INSERT INTO referral_rewards(
      account_id, referral_id, beneficiary_type, contact_id, reward_type,
      reward_value, service_id, status, reward_code, expires_at, redeemed_at, metadata
    ) VALUES (
      v_referral.account_id, v_referral.id, 'friend', v_referral.friend_contact_id,
      v_settings.friend_reward_type, v_settings.friend_reward_value,
      v_settings.friend_service_id, 'redeemed',
      'RWD-' || UPPER(SUBSTRING(MD5(v_referral.id::TEXT || 'F') FROM 1 FOR 10)),
      NOW() + make_interval(days => v_settings.reward_validity_days), NOW(),
      jsonb_build_object(
        'source', 'referral_appointment_discount',
        'appointment_id', NEW.id,
        'discount_amount', NEW.referral_discount_amount,
        'original_price', NEW.original_price,
        'final_price', NEW.price
      )
    ) ON CONFLICT (referral_id, beneficiary_type) DO UPDATE
      SET status = 'redeemed',
          redeemed_at = NOW(),
          contact_id = EXCLUDED.contact_id,
          metadata = referral_rewards.metadata || EXCLUDED.metadata,
          updated_at = NOW()
      WHERE referral_rewards.status IN ('pending', 'cancelled');
  END IF;

  INSERT INTO referral_events(account_id, referral_id, action, actor_user_id, metadata)
  VALUES(
    v_referral.account_id, v_referral.id, 'scheduled', auth.uid(),
    jsonb_build_object(
      'appointment_id', NEW.id,
      'scheduled_start', NEW.scheduled_start,
      'discount_amount', NEW.referral_discount_amount,
      'final_price', NEW.price
    )
  );
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
