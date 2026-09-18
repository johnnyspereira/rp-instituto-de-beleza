-- Extend the notification center to clinical, customer and payment events.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'conversation_assigned', 'new_message_received', 'conversation_waiting',
  'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost',
  'follow_up_due', 'task_due', 'automation_failed', 'flow_handoff',
  'flow_failed', 'whatsapp_connected', 'whatsapp_disconnected',
  'broadcast_completed', 'broadcast_failed', 'work_time_missing',
  'work_time_pause_pending', 'referral_registered', 'referral_qualified',
  'referral_reward_issued', 'invoice_requested', 'anamnesis_submitted',
  'anamnesis_reviewed', 'appointment_created', 'appointment_rescheduled',
  'appointment_cancelled', 'client_created', 'payment_received', 'system_alert'
));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (category IN (
  'inbox', 'sales', 'finance', 'clinic', 'clients', 'automation', 'system',
  'broadcast', 'work_time'
));

CREATE OR REPLACE FUNCTION notify_anamnesis_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_name TEXT;
  v_service_name TEXT;
  v_professional_profile_id UUID;
BEGIN
  IF NEW.status NOT IN ('submitted', 'reviewed') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), NULLIF(phone, ''), 'Cliente')
    INTO v_client_name FROM contacts WHERE id = NEW.contact_id;
  v_client_name := COALESCE(
    v_client_name,
    NULLIF(NEW.client_name, ''),
    NULLIF(NEW.client_phone, ''),
    'Cliente'
  );
  SELECT name INTO v_service_name FROM clinic_services WHERE id = NEW.service_id;
  SELECT professional_profile_id INTO v_professional_profile_id
    FROM clinic_appointments WHERE id = NEW.appointment_id;

  IF NEW.status = 'reviewed' THEN
    UPDATE notifications SET resolved_at = COALESCE(resolved_at, NOW())
    WHERE account_id = NEW.account_id
      AND type = 'anamnesis_submitted'
      AND metadata->>'anamnesis_form_id' = NEW.id::TEXT;
  END IF;

  INSERT INTO notifications(
    account_id, user_id, actor_user_id, type, category, priority, contact_id,
    title, body, action_url, metadata
  )
  SELECT DISTINCT
    NEW.account_id, profile.user_id, auth.uid(),
    CASE WHEN NEW.status = 'submitted' THEN 'anamnesis_submitted' ELSE 'anamnesis_reviewed' END,
    'clinic', CASE WHEN NEW.status = 'submitted' THEN 'high' ELSE 'normal' END,
    NEW.contact_id,
    CASE WHEN NEW.status = 'submitted' THEN 'Nova anamnese recebida' ELSE 'Anamnese revista' END,
    v_client_name || COALESCE(' · ' || NULLIF(v_service_name, ''), ''),
    '/anamnese/' || NEW.public_token::TEXT,
    jsonb_build_object(
      'anamnesis_form_id', NEW.id,
      'appointment_id', NEW.appointment_id,
      'service_id', NEW.service_id,
      'status', NEW.status
    )
  FROM profiles profile
  WHERE profile.account_id = NEW.account_id
    AND profile.user_id IS NOT NULL
    AND (
      profile.account_role IN ('owner', 'admin')
      OR profile.id = v_professional_profile_id
    );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to notify anamnesis %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_anamnesis_lifecycle_trigger ON clinic_anamnesis_forms;
CREATE TRIGGER notify_anamnesis_lifecycle_trigger
  AFTER INSERT OR UPDATE OF status ON clinic_anamnesis_forms
  FOR EACH ROW EXECUTE FUNCTION notify_anamnesis_lifecycle();

CREATE OR REPLACE FUNCTION notify_appointment_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type TEXT;
  v_title TEXT;
  v_priority TEXT := 'normal';
  v_client_name TEXT;
  v_service_name TEXT;
  v_old_start TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_type := 'appointment_created';
    v_title := 'Nova marcação';
  ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_old_start := OLD.scheduled_start;
    v_type := 'appointment_cancelled';
    v_title := 'Marcação cancelada';
    v_priority := 'high';
  ELSIF OLD.scheduled_start IS DISTINCT FROM NEW.scheduled_start
     OR OLD.scheduled_end IS DISTINCT FROM NEW.scheduled_end THEN
    v_old_start := OLD.scheduled_start;
    v_type := 'appointment_rescheduled';
    v_title := 'Marcação remarcada';
    v_priority := 'high';
  ELSE
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), NULLIF(phone, ''), 'Cliente')
    INTO v_client_name FROM contacts WHERE id = NEW.contact_id;
  SELECT name INTO v_service_name FROM clinic_services WHERE id = NEW.service_id;

  INSERT INTO notifications(
    account_id, user_id, actor_user_id, type, category, priority, contact_id,
    title, body, action_url, metadata
  )
  SELECT DISTINCT
    NEW.account_id, profile.user_id, auth.uid(), v_type, 'clinic', v_priority,
    NEW.contact_id, v_title,
    COALESCE(v_client_name, 'Cliente') || COALESCE(' · ' || NULLIF(v_service_name, ''), '') ||
      ' · ' || TO_CHAR(NEW.scheduled_start AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI'),
    '/agenda',
    jsonb_build_object(
      'appointment_id', NEW.id,
      'old_start', v_old_start,
      'new_start', NEW.scheduled_start,
      'status', NEW.status,
      'source', NEW.source
    )
  FROM profiles profile
  WHERE profile.account_id = NEW.account_id
    AND profile.user_id IS NOT NULL
    AND (
      profile.account_role IN ('owner', 'admin')
      OR profile.id = NEW.professional_profile_id
    );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to notify appointment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_appointment_lifecycle_trigger ON clinic_appointments;
CREATE TRIGGER notify_appointment_lifecycle_trigger
  AFTER INSERT OR UPDATE OF status, scheduled_start, scheduled_end ON clinic_appointments
  FOR EACH ROW EXECUTE FUNCTION notify_appointment_lifecycle();

CREATE OR REPLACE FUNCTION notify_new_client()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications(
    account_id, user_id, actor_user_id, type, category, priority, contact_id,
    title, body, action_url, metadata
  )
  SELECT
    NEW.account_id, profile.user_id, auth.uid(), 'client_created', 'clients',
    'normal', NEW.id, 'Novo cliente cadastrado',
    COALESCE(NULLIF(NEW.name, ''), NULLIF(NEW.phone, ''), 'Cliente sem nome'),
    '/contacts/' || NEW.id::TEXT,
    jsonb_build_object('contact_id', NEW.id, 'source', NEW.source)
  FROM profiles profile
  WHERE profile.account_id = NEW.account_id
    AND profile.account_role IN ('owner', 'admin')
    AND profile.user_id IS NOT NULL;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to notify new client %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_client_trigger ON contacts;
CREATE TRIGGER notify_new_client_trigger
  AFTER INSERT ON contacts FOR EACH ROW EXECUTE FUNCTION notify_new_client();

CREATE OR REPLACE FUNCTION notify_confirmed_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale_number BIGINT;
  v_contact_id UUID;
  v_currency TEXT;
BEGIN
  IF NEW.status <> 'confirmed' OR (TG_OP = 'UPDATE' AND OLD.status = 'confirmed') THEN
    RETURN NEW;
  END IF;
  SELECT sale_number, contact_id, currency INTO v_sale_number, v_contact_id, v_currency
  FROM finance_sales WHERE id = NEW.sale_id;

  INSERT INTO notifications(
    account_id, user_id, actor_user_id, type, category, priority, contact_id,
    title, body, action_url, metadata
  )
  SELECT
    NEW.account_id, profile.user_id, COALESCE(NEW.received_by_user_id, auth.uid()),
    'payment_received', 'finance', 'normal', v_contact_id,
    'Pagamento recebido',
    TRIM(TO_CHAR(NEW.amount, 'FM999999990D00')) || ' ' || COALESCE(v_currency, 'EUR') ||
      ' · venda #' || v_sale_number,
    '/finance?sale=' || NEW.sale_id::TEXT,
    jsonb_build_object(
      'payment_id', NEW.id,
      'sale_id', NEW.sale_id,
      'amount', NEW.amount,
      'method', NEW.method
    )
  FROM profiles profile
  WHERE profile.account_id = NEW.account_id
    AND profile.account_role IN ('owner', 'admin')
    AND profile.user_id IS NOT NULL;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to notify payment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_confirmed_payment_trigger ON finance_payments;
CREATE TRIGGER notify_confirmed_payment_trigger
  AFTER INSERT OR UPDATE OF status ON finance_payments
  FOR EACH ROW EXECUTE FUNCTION notify_confirmed_payment();

NOTIFY pgrst, 'reload schema';
