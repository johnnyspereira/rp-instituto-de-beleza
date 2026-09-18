-- Structured disqualification keeps failed referrals measurable without deleting history.
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS rejection_code TEXT;

ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_rejection_code_check;
ALTER TABLE referrals ADD CONSTRAINT referrals_rejection_code_check CHECK (
  rejection_code IS NULL OR rejection_code IN (
    'gave_up',
    'no_response',
    'existing_client',
    'duplicate',
    'invalid_data',
    'rules_not_met',
    'other'
  )
);

ALTER TABLE referral_events DROP CONSTRAINT IF EXISTS referral_events_action_check;
ALTER TABLE referral_events ADD CONSTRAINT referral_events_action_check CHECK (
  action IN (
    'created', 'contacted', 'scheduled', 'qualified', 'reward_issued',
    'reward_redeemed', 'lost', 'not_qualified', 'note'
  )
);

CREATE OR REPLACE FUNCTION mark_referral_not_qualified(
  p_referral_id UUID,
  p_reason_code TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_ref referrals;
  v_reason_code TEXT := LOWER(BTRIM(COALESCE(p_reason_code, '')));
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  IF v_reason_code NOT IN (
    'gave_up', 'no_response', 'existing_client', 'duplicate',
    'invalid_data', 'rules_not_met', 'other'
  ) THEN
    RAISE EXCEPTION 'Select a valid disqualification reason';
  END IF;

  IF v_reason_code = 'other' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Describe the disqualification reason';
  END IF;

  SELECT * INTO v_ref FROM referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_ref.account_id, 'agent') THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;

  IF v_ref.status IN ('rejected', 'rewarded') THEN
    RAISE EXCEPTION 'Referral can no longer be disqualified';
  END IF;

  IF EXISTS (
    SELECT 1 FROM referral_rewards
    WHERE referral_id = p_referral_id AND status IN ('issued', 'redeemed')
  ) THEN
    RAISE EXCEPTION 'Issued rewards must be cancelled before disqualifying this referral';
  END IF;

  UPDATE referrals
  SET status = 'rejected',
      rejected_at = NOW(),
      lost_at = CASE WHEN v_reason_code = 'gave_up' THEN NOW() ELSE lost_at END,
      rejection_code = v_reason_code,
      rejection_reason = v_reason,
      lost_reason = CASE WHEN v_reason_code = 'gave_up' THEN v_reason ELSE lost_reason END,
      updated_at = NOW()
  WHERE id = p_referral_id;

  UPDATE referral_rewards
  SET status = 'cancelled', updated_at = NOW()
  WHERE referral_id = p_referral_id AND status = 'pending';

  INSERT INTO referral_events(
    account_id, referral_id, action, reason, actor_user_id, metadata
  ) VALUES (
    v_ref.account_id,
    v_ref.id,
    'not_qualified',
    v_reason,
    auth.uid(),
    jsonb_build_object('reason_code', v_reason_code)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION mark_referral_not_qualified(UUID, TEXT, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
