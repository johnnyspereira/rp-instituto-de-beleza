-- Fix portal access claiming on PostgreSQL installations without MIN(UUID).
-- Migration 068 remains corrected for fresh installs; this migration repairs
-- databases where the previous function version was already created.

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

REVOKE EXECUTE ON FUNCTION claim_client_portal_access(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_client_portal_access(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
