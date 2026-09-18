-- 087_manual_contact_merge
-- Manual client merge for cases where an edited phone already belongs to
-- another contact. Keeps the target contact and migrates CRM relationships
-- from the source contact before deleting it.

CREATE OR REPLACE FUNCTION merge_contacts(
  p_source_contact_id UUID,
  p_target_contact_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source contacts;
  v_target contacts;
  v_actor UUID := auth.uid();
  v_moved INTEGER := 0;
  v_source_conversation_id UUID;
  v_target_conversation_id UUID;
  v_total_unread INTEGER := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_source_contact_id IS NULL OR p_target_contact_id IS NULL OR p_source_contact_id = p_target_contact_id THEN
    RAISE EXCEPTION 'Choose two different clients to merge';
  END IF;

  SELECT * INTO v_source FROM contacts WHERE id = p_source_contact_id FOR UPDATE;
  SELECT * INTO v_target FROM contacts WHERE id = p_target_contact_id FOR UPDATE;

  IF NOT FOUND OR v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;
  IF v_source.account_id <> v_target.account_id THEN
    RAISE EXCEPTION 'Clients belong to different accounts';
  END IF;
  IF NOT is_account_member(v_source.account_id, 'agent') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE contacts
  SET
    name = COALESCE(NULLIF(v_target.name, ''), NULLIF(v_source.name, ''), v_target.name),
    email = COALESCE(NULLIF(v_target.email, ''), NULLIF(v_source.email, ''), v_target.email),
    company = COALESCE(NULLIF(v_target.company, ''), NULLIF(v_source.company, ''), v_target.company),
    client_reference = COALESCE(NULLIF(v_target.client_reference, ''), NULLIF(v_source.client_reference, ''), v_target.client_reference),
    birth_date = COALESCE(v_target.birth_date, v_source.birth_date),
    tax_id = COALESCE(NULLIF(v_target.tax_id, ''), NULLIF(v_source.tax_id, ''), v_target.tax_id),
    gender = COALESCE(NULLIF(v_target.gender, ''), NULLIF(v_source.gender, ''), v_target.gender),
    address_line = COALESCE(NULLIF(v_target.address_line, ''), NULLIF(v_source.address_line, ''), v_target.address_line),
    postal_code = COALESCE(NULLIF(v_target.postal_code, ''), NULLIF(v_source.postal_code, ''), v_target.postal_code),
    city = COALESCE(NULLIF(v_target.city, ''), NULLIF(v_source.city, ''), v_target.city),
    country = COALESCE(NULLIF(v_target.country, ''), NULLIF(v_source.country, ''), v_target.country),
    source = COALESCE(NULLIF(v_target.source, ''), NULLIF(v_source.source, ''), v_target.source),
    preferred_contact = COALESCE(NULLIF(v_target.preferred_contact, ''), NULLIF(v_source.preferred_contact, ''), v_target.preferred_contact),
    marketing_consent = v_target.marketing_consent OR v_source.marketing_consent,
    whatsapp_consent = v_target.whatsapp_consent OR v_source.whatsapp_consent,
    updated_at = NOW()
  WHERE id = v_target.id;

  INSERT INTO contact_tags(contact_id, tag_id)
  SELECT v_target.id, tag_id FROM contact_tags WHERE contact_id = v_source.id
  ON CONFLICT(contact_id, tag_id) DO NOTHING;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  DELETE FROM contact_tags WHERE contact_id = v_source.id;

  INSERT INTO contact_custom_values(contact_id, custom_field_id, value, created_at, updated_at)
  SELECT v_target.id, custom_field_id, value, created_at, NOW()
  FROM contact_custom_values source_value
  WHERE source_value.contact_id = v_source.id
    AND NOT EXISTS (
      SELECT 1 FROM contact_custom_values target_value
      WHERE target_value.contact_id = v_target.id
        AND target_value.custom_field_id = source_value.custom_field_id
    );
  DELETE FROM contact_custom_values WHERE contact_id = v_source.id;

  UPDATE contact_notes SET contact_id = v_target.id WHERE contact_id = v_source.id;

  SELECT id, unread_count
  INTO v_source_conversation_id, v_total_unread
  FROM conversations
  WHERE account_id = v_source.account_id
    AND contact_id = v_source.id
  LIMIT 1;

  SELECT id, COALESCE(unread_count, 0) + COALESCE(v_total_unread, 0)
  INTO v_target_conversation_id, v_total_unread
  FROM conversations
  WHERE account_id = v_target.account_id
    AND contact_id = v_target.id
  LIMIT 1;

  IF v_source_conversation_id IS NOT NULL AND v_target_conversation_id IS NOT NULL THEN
    UPDATE messages SET conversation_id = v_target_conversation_id
      WHERE conversation_id = v_source_conversation_id;
    UPDATE message_reactions SET conversation_id = v_target_conversation_id
      WHERE conversation_id = v_source_conversation_id;
    UPDATE deals SET conversation_id = v_target_conversation_id
      WHERE conversation_id = v_source_conversation_id;
    UPDATE flow_runs SET conversation_id = v_target_conversation_id
      WHERE conversation_id = v_source_conversation_id;
    UPDATE notifications SET conversation_id = v_target_conversation_id
      WHERE conversation_id = v_source_conversation_id;
    UPDATE ai_usage_log SET conversation_id = v_target_conversation_id
      WHERE conversation_id = v_source_conversation_id;

    UPDATE conversations target_conversation
    SET
      unread_count = v_total_unread,
      last_message_text = latest_message.content_text,
      last_message_at = latest_message.created_at,
      updated_at = NOW()
    FROM (
      SELECT content_text, created_at
      FROM messages
      WHERE conversation_id = v_target_conversation_id
      ORDER BY created_at DESC
      LIMIT 1
    ) latest_message
    WHERE target_conversation.id = v_target_conversation_id;

    UPDATE conversations
    SET unread_count = v_total_unread,
        updated_at = NOW()
    WHERE id = v_target_conversation_id
      AND NOT EXISTS (
        SELECT 1 FROM messages WHERE conversation_id = v_target_conversation_id
      );

    DELETE FROM conversations WHERE id = v_source_conversation_id;
  ELSIF v_source_conversation_id IS NOT NULL THEN
    UPDATE conversations
    SET contact_id = v_target.id,
        updated_at = NOW()
    WHERE id = v_source_conversation_id;
  END IF;

  UPDATE deals SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE broadcast_recipients SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE automation_logs SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE automation_pending_executions SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE flow_runs SET contact_id = v_target.id WHERE contact_id = v_source.id AND status <> 'active';

  UPDATE clinic_appointments SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE clinic_anamnesis_forms SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE finance_sales SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE finance_invoice_requests SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE finance_appointment_benefits SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE finance_client_packs SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE finance_payables SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE finance_receivable_schedules SET contact_id = v_target.id WHERE contact_id = v_source.id;

  INSERT INTO finance_client_wallets(account_id, contact_id, currency, balance, created_at, updated_at)
  SELECT account_id, v_target.id, currency, balance, created_at, NOW()
  FROM finance_client_wallets
  WHERE contact_id = v_source.id
  ON CONFLICT(account_id, contact_id, currency) DO UPDATE
    SET balance = finance_client_wallets.balance + EXCLUDED.balance,
        updated_at = NOW();
  UPDATE finance_wallet_transactions SET contact_id = v_target.id WHERE contact_id = v_source.id;
  DELETE FROM finance_client_wallets WHERE contact_id = v_source.id;

  UPDATE finance_vouchers SET owner_contact_id = v_target.id WHERE owner_contact_id = v_source.id;

  UPDATE referrals SET referrer_contact_id = v_target.id WHERE referrer_contact_id = v_source.id;
  UPDATE referrals SET friend_contact_id = v_target.id WHERE friend_contact_id = v_source.id;
  UPDATE referral_rewards SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE referral_programs SET contact_id = v_target.id WHERE contact_id = v_source.id
    AND NOT EXISTS (
      SELECT 1 FROM referral_programs existing
      WHERE existing.account_id = v_target.account_id
        AND existing.contact_id = v_target.id
    );
  DELETE FROM referral_programs WHERE contact_id = v_source.id;

  UPDATE client_activity_events SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE client_portal_access SET contact_id = v_target.id WHERE contact_id = v_source.id
    AND NOT EXISTS (
      SELECT 1 FROM client_portal_access existing
      WHERE existing.account_id = v_target.account_id
        AND existing.contact_id = v_target.id
    );
  DELETE FROM client_portal_access WHERE contact_id = v_source.id;
  UPDATE portal_notifications SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE push_subscriptions SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE support_tickets SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE support_messages SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE public_site_leads SET contact_id = v_target.id WHERE contact_id = v_source.id;
  UPDATE notifications SET contact_id = v_target.id WHERE contact_id = v_source.id;

  INSERT INTO client_activity_events(
    account_id, contact_id, event_type, title, detail, actor_user_id, metadata
  ) VALUES (
    v_target.account_id,
    v_target.id,
    'profile_updated',
    'Cadastros de cliente unidos',
    'O cadastro ' || COALESCE(NULLIF(v_source.name, ''), v_source.phone) || ' foi unido a este cliente.',
    v_actor,
    jsonb_build_object(
      'source_contact_id', v_source.id,
      'source_phone', v_source.phone,
      'target_contact_id', v_target.id,
      'target_phone', v_target.phone
    )
  );

  DELETE FROM contacts WHERE id = v_source.id;

  RETURN jsonb_build_object(
    'merged', true,
    'source_contact_id', p_source_contact_id,
    'target_contact_id', p_target_contact_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION merge_contacts(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_contacts(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
