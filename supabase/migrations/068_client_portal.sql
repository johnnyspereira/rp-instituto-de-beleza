-- Client Portal 360: secure customer identity, self-booking and read access.

CREATE TABLE IF NOT EXISTS client_portal_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  booking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  benefits_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  financial_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  welcome_title TEXT NOT NULL DEFAULT 'A sua experiência, num só lugar',
  welcome_message TEXT,
  cancellation_hours INTEGER NOT NULL DEFAULT 24 CHECK (cancellation_hours BETWEEN 0 AND 720),
  booking_advance_days INTEGER NOT NULL DEFAULT 90 CHECK (booking_advance_days BETWEEN 1 AND 730),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_portal_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, contact_id),
  UNIQUE(account_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS client_portal_access_auth_idx
  ON client_portal_access(auth_user_id, account_id);

ALTER TABLE client_portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_portal_settings_members_read ON client_portal_settings;
CREATE POLICY client_portal_settings_members_read ON client_portal_settings FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS client_portal_settings_admin_manage ON client_portal_settings;
CREATE POLICY client_portal_settings_admin_manage ON client_portal_settings FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS client_portal_access_self_read ON client_portal_access;
CREATE POLICY client_portal_access_self_read ON client_portal_access FOR SELECT
  USING (auth_user_id = auth.uid() OR is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS client_portal_access_admin_manage ON client_portal_access;
CREATE POLICY client_portal_access_admin_manage ON client_portal_access FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON client_portal_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON client_portal_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION claim_client_portal_access(p_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account_id UUID;
  v_contact_id UUID;
  v_email TEXT;
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_email := LOWER(BTRIM(COALESCE(auth.jwt()->>'email', '')));
  IF v_email = '' THEN RAISE EXCEPTION 'Verified email required'; END IF;

  SELECT account_id INTO v_account_id
  FROM client_portal_settings
  WHERE LOWER(slug) = LOWER(BTRIM(p_slug)) AND enabled = TRUE;
  IF v_account_id IS NULL THEN RAISE EXCEPTION 'Portal unavailable'; END IF;

  SELECT COUNT(*) INTO v_count
  FROM contacts
  WHERE account_id = v_account_id AND LOWER(BTRIM(email)) = v_email;
  IF v_count = 0 THEN RAISE EXCEPTION 'No client record matches this email'; END IF;
  IF v_count > 1 THEN RAISE EXCEPTION 'Email is linked to multiple client records'; END IF;

  SELECT id INTO v_contact_id
  FROM contacts
  WHERE account_id = v_account_id AND LOWER(BTRIM(email)) = v_email
  LIMIT 1;

  INSERT INTO client_portal_access(account_id, contact_id, auth_user_id, email)
  VALUES(v_account_id, v_contact_id, auth.uid(), v_email)
  ON CONFLICT(account_id, auth_user_id) DO UPDATE SET
    contact_id = EXCLUDED.contact_id,
    email = EXCLUDED.email,
    last_login_at = NOW();
  RETURN v_contact_id;
END;
$$;

CREATE OR REPLACE FUNCTION portal_create_appointment(
  p_slug TEXT,
  p_service_id UUID,
  p_professional_profile_id UUID,
  p_scheduled_start TIMESTAMPTZ,
  p_benefit_code TEXT DEFAULT NULL,
  p_benefit_pin TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_access client_portal_access;
  v_settings client_portal_settings;
  v_service clinic_services;
  v_end TIMESTAMPTZ;
  v_appointment_id UUID;
  v_voucher finance_vouchers;
  v_pack finance_client_packs;
  v_balance finance_client_pack_balances;
  v_reserved NUMERIC(12,2);
  v_other_reserved NUMERIC(12,2);
  v_reserved_sessions INTEGER;
  v_timezone TEXT;
  v_working_hours JSONB;
  v_day JSONB;
  v_day_key TEXT;
  v_local_start TIMESTAMP;
  v_local_end TIMESTAMP;
BEGIN
  SELECT a.* INTO v_access FROM client_portal_access a
  JOIN client_portal_settings s ON s.account_id=a.account_id
  WHERE a.auth_user_id=auth.uid() AND LOWER(s.slug)=LOWER(BTRIM(p_slug));
  IF NOT FOUND THEN RAISE EXCEPTION 'Portal access not found'; END IF;
  SELECT * INTO v_settings FROM client_portal_settings WHERE account_id=v_access.account_id;
  IF NOT v_settings.enabled OR NOT v_settings.booking_enabled THEN RAISE EXCEPTION 'Online booking is disabled'; END IF;
  IF p_scheduled_start <= NOW() OR p_scheduled_start > NOW() + make_interval(days => v_settings.booking_advance_days) THEN
    RAISE EXCEPTION 'Selected date is outside the booking window';
  END IF;

  SELECT * INTO v_service FROM clinic_services
  WHERE id=p_service_id AND account_id=v_access.account_id AND is_active=TRUE AND online_enabled=TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service is not available online'; END IF;
  SELECT working_hours INTO v_working_hours
    FROM profiles WHERE id=p_professional_profile_id
      AND account_id=v_access.account_id AND is_professional=TRUE
      AND professional_show_online=TRUE AND online_booking_blocked=FALSE
  ;
  IF NOT FOUND THEN RAISE EXCEPTION 'Professional is not available online'; END IF;
  v_end := p_scheduled_start + make_interval(mins => v_service.duration_minutes);

  SELECT COALESCE(timezone, 'Europe/Lisbon') INTO v_timezone
  FROM accounts WHERE id=v_access.account_id;
  v_local_start := p_scheduled_start AT TIME ZONE v_timezone;
  v_local_end := v_end AT TIME ZONE v_timezone;
  v_day_key := CASE EXTRACT(ISODOW FROM v_local_start)
    WHEN 1 THEN 'mon' WHEN 2 THEN 'tue' WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu' WHEN 5 THEN 'fri' WHEN 6 THEN 'sat' ELSE 'sun' END;
  v_day := v_working_hours -> v_day_key;
  IF v_day IS NOT NULL THEN
    IF NOT COALESCE((v_day->>'enabled')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'Professional does not work on the selected day';
    END IF;
    IF v_local_end::DATE <> v_local_start::DATE
      OR v_local_start::TIME < (v_day->>'start')::TIME
      OR v_local_end::TIME > (v_day->>'end')::TIME THEN
      RAISE EXCEPTION 'Selected time is outside the professional working hours';
    END IF;
    IF NULLIF(v_day->>'breakStart', '') IS NOT NULL
      AND NULLIF(v_day->>'breakEnd', '') IS NOT NULL
      AND v_local_start::TIME < (v_day->>'breakEnd')::TIME
      AND v_local_end::TIME > (v_day->>'breakStart')::TIME THEN
      RAISE EXCEPTION 'Selected time overlaps the professional break';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM clinic_appointments WHERE account_id=v_access.account_id
      AND professional_profile_id=p_professional_profile_id
      AND status NOT IN ('cancelled','no_show')
      AND scheduled_start < v_end AND scheduled_end > p_scheduled_start
  ) OR EXISTS (
    SELECT 1 FROM clinic_time_blocks WHERE account_id=v_access.account_id
      AND (professional_profile_id=p_professional_profile_id OR professional_profile_id IS NULL)
      AND starts_at < v_end AND ends_at > p_scheduled_start
  ) THEN RAISE EXCEPTION 'Selected time is no longer available'; END IF;

  INSERT INTO clinic_appointments(
    account_id, contact_id, service_id, professional_profile_id,
    scheduled_start, scheduled_end, status, source, price, currency, notes,
    confirmation_status
  ) VALUES (
    v_access.account_id, v_access.contact_id, v_service.id, p_professional_profile_id,
    p_scheduled_start, v_end, 'scheduled', 'public_link', v_service.price,
    v_service.currency, NULLIF(BTRIM(p_notes), ''), 'pending'
  ) RETURNING id INTO v_appointment_id;

  IF NULLIF(BTRIM(p_benefit_code), '') IS NOT NULL THEN
    IF NOT v_settings.benefits_enabled THEN RAISE EXCEPTION 'Benefits are disabled in the portal'; END IF;
    SELECT * INTO v_voucher FROM finance_vouchers
    WHERE account_id=v_access.account_id AND owner_contact_id=v_access.contact_id
      AND UPPER(code)=UPPER(BTRIM(p_benefit_code)) AND pin_code=BTRIM(p_benefit_pin)
      AND status='active' AND (expires_at IS NULL OR expires_at>NOW()) FOR UPDATE;
    IF FOUND THEN
      IF v_voucher.voucher_type='service' AND (
        v_voucher.service_id IS DISTINCT FROM v_service.id OR COALESCE(v_voucher.remaining_uses,0)<1
      ) THEN RAISE EXCEPTION 'Voucher is not valid for this service'; END IF;
      IF v_voucher.voucher_type='service' THEN v_reserved:=v_service.price;
      ELSE
        SELECT COALESCE(SUM(reserved_amount),0) INTO v_other_reserved
        FROM finance_appointment_benefits WHERE voucher_id=v_voucher.id AND status='reserved';
        v_reserved:=LEAST(v_service.price, v_voucher.current_balance-v_other_reserved);
        IF v_reserved<=0 THEN RAISE EXCEPTION 'Voucher has no available balance'; END IF;
      END IF;
      INSERT INTO finance_appointment_benefits(
        account_id,appointment_id,contact_id,benefit_type,voucher_id,service_id,reserved_amount,created_by_user_id
      ) VALUES(v_access.account_id,v_appointment_id,v_access.contact_id,'voucher',v_voucher.id,v_service.id,v_reserved,auth.uid());
    ELSE
      SELECT * INTO v_pack FROM finance_client_packs
      WHERE account_id=v_access.account_id AND contact_id=v_access.contact_id
        AND UPPER(code)=UPPER(BTRIM(p_benefit_code)) AND pin_code=BTRIM(p_benefit_pin)
        AND status='active' AND (expires_at IS NULL OR expires_at>NOW()) FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid benefit code or PIN'; END IF;
      SELECT * INTO v_balance FROM finance_client_pack_balances
      WHERE client_pack_id=v_pack.id AND service_id=v_service.id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Pack does not include this service'; END IF;
      SELECT COALESCE(SUM(reserved_sessions),0) INTO v_reserved_sessions
      FROM finance_appointment_benefits WHERE client_pack_balance_id=v_balance.id AND status='reserved';
      IF v_balance.remaining_sessions-v_reserved_sessions<1 THEN RAISE EXCEPTION 'Pack has no available sessions'; END IF;
      INSERT INTO finance_appointment_benefits(
        account_id,appointment_id,contact_id,benefit_type,client_pack_id,client_pack_balance_id,
        service_id,reserved_sessions,created_by_user_id
      ) VALUES(v_access.account_id,v_appointment_id,v_access.contact_id,'pack',v_pack.id,v_balance.id,v_service.id,1,auth.uid());
    END IF;
  END IF;
  RETURN v_appointment_id;
END;
$$;

CREATE OR REPLACE FUNCTION portal_cancel_appointment(p_slug TEXT, p_appointment_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_access client_portal_access; v_settings client_portal_settings; v_appt clinic_appointments;
BEGIN
  SELECT a.* INTO v_access FROM client_portal_access a JOIN client_portal_settings s ON s.account_id=a.account_id
  WHERE a.auth_user_id=auth.uid() AND LOWER(s.slug)=LOWER(BTRIM(p_slug));
  IF NOT FOUND THEN RAISE EXCEPTION 'Portal access not found'; END IF;
  SELECT * INTO v_settings FROM client_portal_settings WHERE account_id=v_access.account_id;
  SELECT * INTO v_appt FROM clinic_appointments WHERE id=p_appointment_id AND contact_id=v_access.contact_id FOR UPDATE;
  IF NOT FOUND OR v_appt.status IN ('completed','cancelled','no_show') THEN RAISE EXCEPTION 'Appointment cannot be cancelled'; END IF;
  IF v_appt.scheduled_start < NOW()+make_interval(hours=>v_settings.cancellation_hours) THEN
    RAISE EXCEPTION 'Cancellation deadline has passed';
  END IF;
  UPDATE clinic_appointments SET status='cancelled',cancelled_at=NOW(),updated_at=NOW() WHERE id=v_appt.id;
  UPDATE finance_appointment_benefits SET status='released',released_at=NOW(),updated_at=NOW()
    WHERE appointment_id=v_appt.id AND status='reserved';
  INSERT INTO clinic_agenda_events(account_id,entity_type,entity_id,action,user_id,reason,metadata)
  VALUES(v_access.account_id,'appointment',v_appt.id,'status_changed',auth.uid(),'Cancelado pelo cliente no portal',jsonb_build_object('source','client_portal'));
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_client_portal_access(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION portal_create_appointment(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION portal_cancel_appointment(TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_client_portal_access(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_create_appointment(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_cancel_appointment(TEXT,UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
