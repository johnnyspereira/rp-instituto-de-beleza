-- Complete support notifications for staff and a separate, contact-scoped
-- notification inbox for Portal 360 identities.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'conversation_assigned','new_message_received','conversation_waiting','deal_created','deal_stage_changed','deal_won','deal_lost',
  'follow_up_due','task_due','automation_failed','flow_handoff','flow_failed','whatsapp_connected','whatsapp_disconnected',
  'broadcast_completed','broadcast_failed','work_time_missing','work_time_pause_pending','referral_registered','referral_qualified',
  'referral_reward_issued','invoice_requested','anamnesis_submitted','anamnesis_reviewed','appointment_created','appointment_rescheduled',
  'appointment_cancelled','client_created','payment_received','support_ticket_created','support_new_message','system_alert'
));
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (category IN (
  'inbox','sales','finance','clinic','clients','automation','system','broadcast','work_time','support'
));

CREATE TABLE IF NOT EXISTS portal_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE, type TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT, action_tab TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_notifications_contact_idx ON portal_notifications(account_id,contact_id,created_at DESC);
ALTER TABLE portal_notifications ENABLE ROW LEVEL SECURITY;
-- Portal routes use the service role after validating isolated portal access.
CREATE POLICY portal_notifications_staff_read ON portal_notifications FOR SELECT USING (is_account_member(account_id));

CREATE OR REPLACE FUNCTION notify_support_message() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ticket support_tickets%ROWTYPE; v_contact_name TEXT;
BEGIN
  SELECT * INTO v_ticket FROM support_tickets WHERE id=NEW.ticket_id;
  IF v_ticket.id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(name,''),NULLIF(email,''),NULLIF(phone,''),'Cliente') INTO v_contact_name FROM contacts WHERE id=v_ticket.contact_id;
  IF NEW.author_type='client' THEN
    INSERT INTO notifications(account_id,user_id,type,category,priority,contact_id,title,body,action_url,metadata)
    SELECT v_ticket.account_id,p.user_id,'support_new_message','support',
      CASE WHEN v_ticket.priority='urgent' THEN 'critical' WHEN v_ticket.priority='high' THEN 'high' ELSE 'normal' END,
      v_ticket.contact_id,'Nova mensagem de suporte',COALESCE(v_contact_name,'Cliente')||' · #'||v_ticket.number||' '||v_ticket.subject,
      '/support?ticket='||v_ticket.id,jsonb_build_object('ticket_id',v_ticket.id,'message_id',NEW.id)
    FROM profiles p WHERE p.account_id=v_ticket.account_id AND p.user_id IS NOT NULL AND p.account_role IN ('owner','admin','agent');
  ELSIF NEW.author_type='staff' AND v_ticket.contact_id IS NOT NULL THEN
    INSERT INTO portal_notifications(account_id,contact_id,type,title,body,action_tab,metadata)
    VALUES(v_ticket.account_id,v_ticket.contact_id,'support_reply','Nova resposta no suporte',
      '#'||v_ticket.number||' '||v_ticket.subject,'support',jsonb_build_object('ticket_id',v_ticket.id,'message_id',NEW.id));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Support notification failed: %',SQLERRM; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS support_message_notification_trigger ON support_ticket_messages;
CREATE TRIGGER support_message_notification_trigger AFTER INSERT ON support_ticket_messages FOR EACH ROW EXECUTE FUNCTION notify_support_message();

CREATE OR REPLACE FUNCTION notify_portal_appointment_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.contact_id IS NULL OR TG_OP<>'UPDATE' THEN RETURN NEW; END IF;
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.scheduled_start IS DISTINCT FROM NEW.scheduled_start THEN
    INSERT INTO portal_notifications(account_id,contact_id,type,title,body,action_tab,metadata) VALUES(
      NEW.account_id,NEW.contact_id,'appointment_update',
      CASE WHEN NEW.status='cancelled' THEN 'Marcação cancelada' WHEN OLD.scheduled_start IS DISTINCT FROM NEW.scheduled_start THEN 'Marcação remarcada' ELSE 'Estado da marcação atualizado' END,
      'Consulte os novos detalhes da sua marcação.','appointments',jsonb_build_object('appointment_id',NEW.id,'status',NEW.status));
  END IF; RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Portal appointment notification failed: %',SQLERRM; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS portal_appointment_notification_trigger ON clinic_appointments;
CREATE TRIGGER portal_appointment_notification_trigger AFTER UPDATE OF status,scheduled_start ON clinic_appointments FOR EACH ROW EXECUTE FUNCTION notify_portal_appointment_change();

CREATE OR REPLACE FUNCTION notify_portal_invoice_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO portal_notifications(account_id,contact_id,type,title,body,action_tab,metadata) VALUES(
      NEW.account_id,NEW.contact_id,'invoice_update','Pedido de fatura atualizado',
      CASE NEW.status WHEN 'completed' THEN 'A sua fatura já está disponível.' WHEN 'processing' THEN 'A sua fatura está em processamento.' ELSE 'Consulte o estado do seu pedido.' END,
      'finance',jsonb_build_object('invoice_request_id',NEW.id,'status',NEW.status));
  END IF; RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Portal invoice notification failed: %',SQLERRM; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS portal_invoice_notification_trigger ON finance_invoice_requests;
CREATE TRIGGER portal_invoice_notification_trigger AFTER UPDATE OF status ON finance_invoice_requests FOR EACH ROW EXECUTE FUNCTION notify_portal_invoice_change();

ALTER PUBLICATION supabase_realtime ADD TABLE portal_notifications;
NOTIFY pgrst,'reload schema';
