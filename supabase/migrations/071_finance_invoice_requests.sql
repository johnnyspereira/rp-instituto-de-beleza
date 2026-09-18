-- Fiscal invoice requests initiated by clients from Portal 360.

CREATE TABLE IF NOT EXISTS finance_invoice_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES finance_sales(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  requested_by_auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'issued', 'rejected', 'cancelled'
  )),
  fiscal_name TEXT NOT NULL,
  tax_id TEXT NOT NULL,
  email TEXT NOT NULL,
  address_line TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'Portugal',
  client_notes TEXT,
  invoice_number TEXT,
  invoice_document_url TEXT,
  admin_notes TEXT,
  handled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, sale_id)
);

CREATE INDEX IF NOT EXISTS finance_invoice_requests_queue_idx
  ON finance_invoice_requests(account_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS finance_invoice_requests_contact_idx
  ON finance_invoice_requests(contact_id, requested_at DESC);

ALTER TABLE finance_invoice_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_invoice_requests_members_read ON finance_invoice_requests;
CREATE POLICY finance_invoice_requests_members_read ON finance_invoice_requests FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS finance_invoice_requests_admin_manage ON finance_invoice_requests;
CREATE POLICY finance_invoice_requests_admin_manage ON finance_invoice_requests FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON finance_invoice_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance_invoice_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'conversation_assigned', 'new_message_received', 'conversation_waiting',
  'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost',
  'follow_up_due', 'task_due', 'automation_failed', 'flow_handoff',
  'flow_failed', 'whatsapp_connected', 'whatsapp_disconnected',
  'broadcast_completed', 'broadcast_failed', 'work_time_missing',
  'work_time_pause_pending', 'referral_registered', 'referral_qualified',
  'referral_reward_issued', 'invoice_requested', 'system_alert'
));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (category IN (
  'inbox', 'sales', 'finance', 'automation', 'system', 'broadcast', 'work_time'
));

CREATE OR REPLACE FUNCTION notify_invoice_requested()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale_number BIGINT;
  v_client_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (
    OLD.status IN ('rejected', 'cancelled') AND NEW.status = 'pending'
  ) THEN RETURN NEW; END IF;
  SELECT sale_number INTO v_sale_number FROM finance_sales WHERE id = NEW.sale_id;
  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_client_name FROM contacts WHERE id = NEW.contact_id;

  INSERT INTO notifications(
    account_id, user_id, type, category, priority, contact_id, title, body,
    action_url, metadata
  )
  SELECT
    NEW.account_id, p.user_id, 'invoice_requested', 'finance', 'high',
    NEW.contact_id, 'Novo pedido de fatura',
    COALESCE(v_client_name, 'Cliente') || ' solicitou fatura da venda #' || v_sale_number,
    '/finance?tab=invoices#invoice-request-' || NEW.id::TEXT,
    jsonb_build_object('invoice_request_id', NEW.id, 'sale_id', NEW.sale_id)
  FROM profiles p
  WHERE p.account_id = NEW.account_id AND p.account_role IN ('owner', 'admin');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to notify invoice request %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_invoice_requested_trigger ON finance_invoice_requests;
CREATE TRIGGER notify_invoice_requested_trigger
  AFTER INSERT OR UPDATE OF status ON finance_invoice_requests
  FOR EACH ROW EXECUTE FUNCTION notify_invoice_requested();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'finance_invoice_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE finance_invoice_requests;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
