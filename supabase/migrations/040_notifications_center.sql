-- Notifications center evolution:
-- - expands notification types beyond conversation assignment
-- - adds category, priority, action_url, metadata, and resolved_at
-- - creates safe triggers for operational events across inbox, broadcasts,
--   automations, flows, WhatsApp connectivity, deals, and work time.

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'conversation_assigned',
    'new_message_received',
    'conversation_waiting',
    'deal_created',
    'deal_stage_changed',
    'deal_won',
    'deal_lost',
    'follow_up_due',
    'task_due',
    'automation_failed',
    'flow_handoff',
    'flow_failed',
    'whatsapp_connected',
    'whatsapp_disconnected',
    'broadcast_completed',
    'broadcast_failed',
    'work_time_missing',
    'work_time_pause_pending',
    'system_alert'
  ));

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

UPDATE notifications
SET category = CASE
  WHEN type IN ('conversation_assigned', 'new_message_received', 'conversation_waiting') THEN 'inbox'
  WHEN type IN ('deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost', 'follow_up_due', 'task_due') THEN 'sales'
  WHEN type IN ('automation_failed', 'flow_handoff', 'flow_failed') THEN 'automation'
  WHEN type IN ('broadcast_completed', 'broadcast_failed') THEN 'broadcast'
  WHEN type IN ('work_time_missing', 'work_time_pause_pending') THEN 'work_time'
  ELSE 'system'
END
WHERE category IS NULL OR category = 'system';

UPDATE notifications
SET priority = CASE
  WHEN type IN ('whatsapp_disconnected', 'automation_failed', 'flow_failed', 'broadcast_failed') THEN 'critical'
  WHEN type IN ('conversation_waiting', 'deal_won', 'deal_lost', 'work_time_missing', 'work_time_pause_pending') THEN 'high'
  WHEN type IN ('new_message_received', 'flow_handoff') THEN 'normal'
  ELSE 'normal'
END
WHERE priority IS NULL OR priority = 'normal';

UPDATE notifications
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

ALTER TABLE notifications
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN priority SET NOT NULL,
  ALTER COLUMN metadata SET NOT NULL;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_category_check,
  DROP CONSTRAINT IF EXISTS notifications_priority_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_category_check CHECK (category IN (
    'inbox',
    'sales',
    'automation',
    'system',
    'broadcast',
    'work_time'
  )),
  ADD CONSTRAINT notifications_priority_check CHECK (priority IN (
    'low',
    'normal',
    'high',
    'critical'
  ));

CREATE INDEX IF NOT EXISTS idx_notifications_account_category_created
  ON notifications(account_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_account_priority_unread
  ON notifications(account_id, priority, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unresolved
  ON notifications(user_id, created_at DESC)
  WHERE resolved_at IS NULL;

GRANT UPDATE (read_at, resolved_at) ON notifications TO authenticated;

-- Keep the original assignment notification, but enrich it with
-- category, priority, action_url, and metadata.
CREATE OR REPLACE FUNCTION notify_conversation_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name TEXT;
  v_actor_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.assigned_agent_id IS NULL
       OR NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.assigned_agent_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_contact_name
  FROM contacts WHERE id = NEW.contact_id;

  IF auth.uid() IS NOT NULL THEN
    SELECT full_name INTO v_actor_name
    FROM profiles WHERE user_id = auth.uid();
  END IF;

  INSERT INTO notifications (
    account_id,
    user_id,
    type,
    category,
    priority,
    conversation_id,
    contact_id,
    actor_user_id,
    title,
    body,
    action_url,
    metadata
  ) VALUES (
    NEW.account_id,
    NEW.assigned_agent_id,
    'conversation_assigned',
    'inbox',
    'normal',
    NEW.id,
    NEW.contact_id,
    auth.uid(),
    'Nova conversa atribuida',
    COALESCE(v_actor_name, 'Sistema') || ' atribuiu uma conversa com '
      || COALESCE(v_contact_name, 'um contato'),
    '/inbox?c=' || NEW.id::text,
    jsonb_build_object('source', 'conversation_assignment')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create assignment notification for conversation %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_conversation_assigned() OWNER TO postgres;

CREATE OR REPLACE FUNCTION notify_new_inbound_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_user_id UUID;
  v_contact_id UUID;
  v_contact_name TEXT;
  v_preview TEXT;
BEGIN
  IF NEW.sender_type <> 'customer' THEN
    RETURN NEW;
  END IF;

  SELECT
    c.account_id,
    c.assigned_agent_id,
    c.contact_id,
    COALESCE(NULLIF(ct.name, ''), ct.phone)
  INTO v_account_id, v_user_id, v_contact_id, v_contact_name
  FROM conversations c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.id = NEW.conversation_id;

  IF v_account_id IS NULL OR v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_preview := COALESCE(NULLIF(NEW.content_text, ''), CASE NEW.content_type
    WHEN 'image' THEN 'Imagem recebida'
    WHEN 'audio' THEN 'Audio recebido'
    WHEN 'video' THEN 'Video recebido'
    WHEN 'document' THEN 'Documento recebido'
    WHEN 'location' THEN 'Localizacao recebida'
    WHEN 'interactive' THEN 'Resposta interativa recebida'
    ELSE 'Nova mensagem recebida'
  END);

  INSERT INTO notifications (
    account_id,
    user_id,
    type,
    category,
    priority,
    conversation_id,
    contact_id,
    title,
    body,
    action_url,
    metadata
  ) VALUES (
    v_account_id,
    v_user_id,
    'new_message_received',
    'inbox',
    'normal',
    NEW.conversation_id,
    v_contact_id,
    'Nova mensagem recebida',
    COALESCE(v_contact_name, 'Contato') || ': ' || LEFT(v_preview, 180),
    '/inbox?c=' || NEW.conversation_id::text,
    jsonb_build_object('message_id', NEW.id, 'content_type', NEW.content_type)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create inbound-message notification for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_new_inbound_message() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_new_inbound_message_notification ON messages;
CREATE TRIGGER on_new_inbound_message_notification
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_inbound_message();

CREATE OR REPLACE FUNCTION notify_broadcast_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_title TEXT;
  v_priority TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('sent', 'failed') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'sent' THEN
    v_type := 'broadcast_completed';
    v_title := 'Transmissao finalizada';
    v_priority := 'normal';
  ELSE
    v_type := 'broadcast_failed';
    v_title := 'Transmissao falhou';
    v_priority := 'critical';
  END IF;

  INSERT INTO notifications (
    account_id,
    user_id,
    type,
    category,
    priority,
    title,
    body,
    action_url,
    metadata
  ) VALUES (
    NEW.account_id,
    NEW.user_id,
    v_type,
    'broadcast',
    v_priority,
    v_title,
    NEW.name || ' - enviados: ' || COALESCE(NEW.sent_count, 0)::text
      || '/' || COALESCE(NEW.total_recipients, 0)::text,
    '/broadcasts/' || NEW.id::text,
    jsonb_build_object('broadcast_id', NEW.id, 'status', NEW.status)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create broadcast notification for broadcast %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_broadcast_status_change() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_broadcast_status_notification ON broadcasts;
CREATE TRIGGER on_broadcast_status_notification
  AFTER UPDATE OF status ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION notify_broadcast_status_change();

CREATE OR REPLACE FUNCTION notify_automation_failed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_name TEXT;
BEGIN
  IF NEW.status <> 'failed' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_automation_name
  FROM automations
  WHERE id = NEW.automation_id;

  INSERT INTO notifications (
    account_id,
    user_id,
    type,
    category,
    priority,
    contact_id,
    title,
    body,
    action_url,
    metadata
  ) VALUES (
    NEW.account_id,
    NEW.user_id,
    'automation_failed',
    'automation',
    'critical',
    NEW.contact_id,
    'Automacao falhou',
    COALESCE(v_automation_name, 'Automacao') || ': '
      || COALESCE(NULLIF(NEW.error_message, ''), 'verifique o log da execucao'),
    '/automations/' || NEW.automation_id::text || '/logs',
    jsonb_build_object('automation_id', NEW.automation_id, 'log_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create automation notification for log %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_automation_failed() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_automation_failed_notification ON automation_logs;
CREATE TRIGGER on_automation_failed_notification
  AFTER INSERT ON automation_logs
  FOR EACH ROW EXECUTE FUNCTION notify_automation_failed();

CREATE OR REPLACE FUNCTION notify_flow_attention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow_name TEXT;
  v_type TEXT;
  v_title TEXT;
  v_priority TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('handed_off', 'paused_by_agent', 'timed_out', 'failed') THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_flow_name
  FROM flows
  WHERE id = NEW.flow_id;

  IF NEW.status IN ('failed', 'timed_out') THEN
    v_type := 'flow_failed';
    v_title := 'Fluxo precisa de atencao';
    v_priority := 'critical';
  ELSE
    v_type := 'flow_handoff';
    v_title := 'Fluxo encaminhou para humano';
    v_priority := 'normal';
  END IF;

  INSERT INTO notifications (
    account_id,
    user_id,
    type,
    category,
    priority,
    conversation_id,
    contact_id,
    title,
    body,
    action_url,
    metadata
  ) VALUES (
    NEW.account_id,
    NEW.user_id,
    v_type,
    'automation',
    v_priority,
    NEW.conversation_id,
    NEW.contact_id,
    v_title,
    COALESCE(v_flow_name, 'Fluxo') || ' terminou com status ' || NEW.status,
    '/flows/' || NEW.flow_id::text || '/runs',
    jsonb_build_object('flow_id', NEW.flow_id, 'flow_run_id', NEW.id, 'status', NEW.status)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create flow notification for run %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_flow_attention() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_flow_attention_notification ON flow_runs;
CREATE TRIGGER on_flow_attention_notification
  AFTER UPDATE OF status ON flow_runs
  FOR EACH ROW EXECUTE FUNCTION notify_flow_attention();

CREATE OR REPLACE FUNCTION notify_whatsapp_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_title TEXT;
  v_priority TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'connected' THEN
    v_type := 'whatsapp_connected';
    v_title := 'WhatsApp conectado';
    v_priority := 'normal';
  ELSE
    v_type := 'whatsapp_disconnected';
    v_title := 'WhatsApp desconectado';
    v_priority := 'critical';
  END IF;

  INSERT INTO notifications (
    account_id,
    user_id,
    type,
    category,
    priority,
    title,
    body,
    action_url,
    metadata
  )
  SELECT
    NEW.account_id,
    p.user_id,
    v_type,
    'system',
    v_priority,
    v_title,
    'Status da integracao mudou para ' || NEW.status,
    '/settings?tab=whatsapp',
    jsonb_build_object('whatsapp_config_id', NEW.id, 'status', NEW.status)
  FROM profiles p
  WHERE p.account_id = NEW.account_id
    AND p.account_role IN ('owner', 'admin');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create WhatsApp status notification for config %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_whatsapp_status_change() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_whatsapp_status_notification ON whatsapp_config;
CREATE TRIGGER on_whatsapp_status_notification
  AFTER UPDATE OF status ON whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION notify_whatsapp_status_change();

CREATE OR REPLACE FUNCTION notify_deal_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_title TEXT;
  v_priority TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO notifications (
      account_id,
      user_id,
      type,
      category,
      priority,
      conversation_id,
      contact_id,
      title,
      body,
      action_url,
      metadata
    ) VALUES (
      NEW.account_id,
      NEW.user_id,
      'deal_created',
      'sales',
      'normal',
      NEW.conversation_id,
      NEW.contact_id,
      'Negocio criado',
      NEW.title,
      '/pipelines',
      jsonb_build_object('deal_id', NEW.id, 'status', NEW.status)
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('won', 'lost') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'won' THEN
    v_type := 'deal_won';
    v_title := 'Negocio ganho';
    v_priority := 'high';
  ELSE
    v_type := 'deal_lost';
    v_title := 'Negocio perdido';
    v_priority := 'high';
  END IF;

  INSERT INTO notifications (
    account_id,
    user_id,
    type,
    category,
    priority,
    conversation_id,
    contact_id,
    title,
    body,
    action_url,
    metadata
  ) VALUES (
    NEW.account_id,
    NEW.user_id,
    v_type,
    'sales',
    v_priority,
    NEW.conversation_id,
    NEW.contact_id,
    v_title,
    NEW.title,
    '/pipelines',
    jsonb_build_object('deal_id', NEW.id, 'status', NEW.status)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create deal notification for deal %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_deal_status_change() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_deal_insert_notification ON deals;
CREATE TRIGGER on_deal_insert_notification
  AFTER INSERT ON deals
  FOR EACH ROW EXECUTE FUNCTION notify_deal_status_change();

DROP TRIGGER IF EXISTS on_deal_status_notification ON deals;
CREATE TRIGGER on_deal_status_notification
  AFTER UPDATE OF status ON deals
  FOR EACH ROW EXECUTE FUNCTION notify_deal_status_change();

CREATE OR REPLACE FUNCTION notify_work_time_attention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'absent' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (
    account_id,
    user_id,
    type,
    category,
    priority,
    title,
    body,
    action_url,
    metadata
  ) VALUES (
    NEW.account_id,
    NEW.user_id,
    'work_time_missing',
    'work_time',
    'high',
    'Falta registrada',
    'O ponto nao foi iniciado em ' || NEW.work_date::text,
    '/settings?tab=work-time',
    jsonb_build_object('work_session_id', NEW.id, 'work_date', NEW.work_date)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create work-time notification for session %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_work_time_attention() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_work_time_attention_notification ON work_sessions;
CREATE TRIGGER on_work_time_attention_notification
  AFTER INSERT OR UPDATE OF status ON work_sessions
  FOR EACH ROW EXECUTE FUNCTION notify_work_time_attention();
