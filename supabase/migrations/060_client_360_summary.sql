-- Accurate lifetime metrics for Client 360, independent from paginated UI lists.
CREATE OR REPLACE FUNCTION get_client_360_summary(p_contact_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_result JSONB;
BEGIN
  SELECT account_id INTO v_account_id FROM contacts WHERE id = p_contact_id;
  IF v_account_id IS NULL OR NOT is_account_member(v_account_id) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  SELECT jsonb_build_object(
    'appointments_total', (SELECT COUNT(*) FROM clinic_appointments WHERE contact_id = p_contact_id),
    'appointments_completed', (SELECT COUNT(*) FROM clinic_appointments WHERE contact_id = p_contact_id AND status = 'completed'),
    'appointments_no_show', (SELECT COUNT(*) FROM clinic_appointments WHERE contact_id = p_contact_id AND status = 'no_show'),
    'appointments_upcoming', (SELECT COUNT(*) FROM clinic_appointments WHERE contact_id = p_contact_id AND scheduled_start >= NOW() AND status NOT IN ('cancelled', 'no_show')),
    'next_appointment_at', (SELECT MIN(scheduled_start) FROM clinic_appointments WHERE contact_id = p_contact_id AND scheduled_start >= NOW() AND status NOT IN ('cancelled', 'no_show')),
    'last_completed_at', (SELECT MAX(scheduled_start) FROM clinic_appointments WHERE contact_id = p_contact_id AND status = 'completed'),
    'sales_count', (SELECT COUNT(*) FROM finance_sales WHERE contact_id = p_contact_id AND status NOT IN ('voided', 'refunded')),
    'total_purchased', COALESCE((SELECT SUM(total_amount) FROM finance_sales WHERE contact_id = p_contact_id AND status NOT IN ('voided', 'refunded')), 0),
    'total_received', COALESCE((SELECT SUM(paid_amount) FROM finance_sales WHERE contact_id = p_contact_id AND status NOT IN ('voided', 'refunded')), 0),
    'total_due', COALESCE((SELECT SUM(balance_due) FROM finance_sales WHERE contact_id = p_contact_id AND status NOT IN ('voided', 'refunded')), 0),
    'average_ticket', COALESCE((SELECT AVG(total_amount) FROM finance_sales WHERE contact_id = p_contact_id AND status NOT IN ('voided', 'refunded')), 0),
    'conversations_total', (SELECT COUNT(*) FROM conversations WHERE contact_id = p_contact_id),
    'unread_total', COALESCE((SELECT SUM(unread_count) FROM conversations WHERE contact_id = p_contact_id), 0),
    'active_deals', (SELECT COUNT(*) FROM deals WHERE contact_id = p_contact_id AND COALESCE(status, 'open') = 'open'),
    'active_deal_value', COALESCE((SELECT SUM(value) FROM deals WHERE contact_id = p_contact_id AND COALESCE(status, 'open') = 'open'), 0),
    'wallet_balance', COALESCE((SELECT SUM(balance) FROM finance_client_wallets WHERE contact_id = p_contact_id), 0),
    'active_vouchers', (SELECT COUNT(*) FROM finance_vouchers WHERE owner_contact_id = p_contact_id AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())),
    'active_packs', (SELECT COUNT(*) FROM finance_client_packs WHERE contact_id = p_contact_id AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())),
    'pack_sessions_remaining', COALESCE((
      SELECT SUM(b.remaining_sessions)
      FROM finance_client_packs p
      JOIN finance_client_pack_balances b ON b.client_pack_id = p.id
      WHERE p.contact_id = p_contact_id AND p.status = 'active'
        AND (p.expires_at IS NULL OR p.expires_at > NOW())
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_client_360_summary(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
