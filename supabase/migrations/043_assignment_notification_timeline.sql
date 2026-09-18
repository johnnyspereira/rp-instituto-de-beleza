-- Assignment notification timeline:
-- - reuses the same notification row for the same conversation/user
-- - keeps assignment/unassignment/transfer events in metadata.assignment_timeline
-- - leaves the UI free to show one card with a collapsible history

CREATE OR REPLACE FUNCTION notification_append_assignment_event(
  p_metadata JSONB,
  p_event JSONB,
  p_increment_assignment_count BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_meta JSONB := COALESCE(p_metadata, '{}'::jsonb);
  v_timeline JSONB;
  v_count INTEGER;
BEGIN
  IF jsonb_typeof(v_meta->'assignment_timeline') = 'array' THEN
    v_timeline := v_meta->'assignment_timeline';
  ELSE
    v_timeline := '[]'::jsonb;
  END IF;

  v_meta := jsonb_set(
    v_meta,
    '{assignment_timeline}',
    v_timeline || jsonb_build_array(p_event),
    TRUE
  );
  v_meta := jsonb_set(v_meta, '{last_assignment_event}', p_event, TRUE);

  IF p_increment_assignment_count THEN
    BEGIN
      v_count := COALESCE((v_meta->>'assignment_count')::integer, 0) + 1;
    EXCEPTION WHEN OTHERS THEN
      v_count := 1;
    END;
    v_meta := jsonb_set(v_meta, '{assignment_count}', to_jsonb(v_count), TRUE);
  END IF;

  RETURN v_meta;
END;
$$;

ALTER FUNCTION notification_append_assignment_event(JSONB, JSONB, BOOLEAN)
  OWNER TO postgres;

CREATE OR REPLACE FUNCTION notify_conversation_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name TEXT;
  v_actor_name TEXT;
  v_new_assignee_name TEXT;
  v_old_assignee_name TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_existing_id UUID;
  v_event JSONB;
  v_old_event JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_contact_name
  FROM contacts WHERE id = NEW.contact_id;

  IF auth.uid() IS NOT NULL THEN
    SELECT full_name INTO v_actor_name
    FROM profiles WHERE user_id = auth.uid();
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.assigned_agent_id IS NOT NULL THEN
    SELECT full_name INTO v_old_assignee_name
    FROM profiles WHERE user_id = OLD.assigned_agent_id;

    IF NEW.assigned_agent_id IS NOT NULL THEN
      SELECT full_name INTO v_new_assignee_name
      FROM profiles WHERE user_id = NEW.assigned_agent_id;
    END IF;

    v_old_event := jsonb_build_object(
      'action', CASE WHEN NEW.assigned_agent_id IS NULL THEN 'unassigned' ELSE 'transferred' END,
      'at', v_now,
      'actor_id', auth.uid(),
      'actor_name', COALESCE(NULLIF(v_actor_name, ''), 'Sistema'),
      'assignee_id', OLD.assigned_agent_id,
      'assignee_name', COALESCE(NULLIF(v_old_assignee_name, ''), 'atendente'),
      'from_id', OLD.assigned_agent_id,
      'from_name', COALESCE(NULLIF(v_old_assignee_name, ''), 'atendente'),
      'to_id', NEW.assigned_agent_id,
      'to_name', COALESCE(NULLIF(v_new_assignee_name, ''), 'sem responsavel'),
      'contact_name', COALESCE(v_contact_name, 'um contato')
    );

    SELECT id
      INTO v_existing_id
    FROM notifications
    WHERE type = 'conversation_assigned'
      AND conversation_id = NEW.id
      AND user_id = OLD.assigned_agent_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      UPDATE notifications
      SET
        metadata = notification_append_assignment_event(metadata, v_old_event, FALSE),
        resolved_at = COALESCE(resolved_at, v_now),
        read_at = COALESCE(read_at, v_now)
      WHERE id = v_existing_id;

      UPDATE notifications
      SET
        resolved_at = COALESCE(resolved_at, v_now),
        read_at = COALESCE(read_at, v_now)
      WHERE type = 'conversation_assigned'
        AND conversation_id = NEW.id
        AND user_id = OLD.assigned_agent_id
        AND id <> v_existing_id;
    END IF;
  END IF;

  IF NEW.assigned_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_new_assignee_name IS NULL THEN
    SELECT full_name INTO v_new_assignee_name
    FROM profiles WHERE user_id = NEW.assigned_agent_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.assigned_agent_id IS NOT NULL THEN
    v_event := jsonb_build_object(
      'action', 'transferred',
      'at', v_now,
      'actor_id', auth.uid(),
      'actor_name', COALESCE(NULLIF(v_actor_name, ''), 'Sistema'),
      'assignee_id', NEW.assigned_agent_id,
      'assignee_name', COALESCE(NULLIF(v_new_assignee_name, ''), 'atendente'),
      'from_id', OLD.assigned_agent_id,
      'from_name', COALESCE(NULLIF(v_old_assignee_name, ''), 'sem responsavel'),
      'to_id', NEW.assigned_agent_id,
      'to_name', COALESCE(NULLIF(v_new_assignee_name, ''), 'atendente'),
      'contact_name', COALESCE(v_contact_name, 'um contato')
    );
  ELSE
    v_event := jsonb_build_object(
      'action', 'assigned',
      'at', v_now,
      'actor_id', auth.uid(),
      'actor_name', COALESCE(NULLIF(v_actor_name, ''), 'Sistema'),
      'assignee_id', NEW.assigned_agent_id,
      'assignee_name', COALESCE(NULLIF(v_new_assignee_name, ''), 'atendente'),
      'from_id', NULL,
      'from_name', 'sem responsavel',
      'to_id', NEW.assigned_agent_id,
      'to_name', COALESCE(NULLIF(v_new_assignee_name, ''), 'atendente'),
      'contact_name', COALESCE(v_contact_name, 'um contato')
    );
  END IF;

  v_existing_id := NULL;

  SELECT id
    INTO v_existing_id
  FROM notifications
  WHERE type = 'conversation_assigned'
    AND conversation_id = NEW.id
    AND user_id = NEW.assigned_agent_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    UPDATE notifications
    SET
      account_id = NEW.account_id,
      category = 'inbox',
      priority = 'normal',
      contact_id = NEW.contact_id,
      actor_user_id = auth.uid(),
      title = 'Nova conversa atribuida',
      body = COALESCE(NULLIF(v_actor_name, ''), 'Sistema') || ' atribuiu uma conversa com '
        || COALESCE(v_contact_name, 'um contato'),
      action_url = '/inbox?c=' || NEW.id::text,
      metadata = notification_append_assignment_event(
        COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('source', 'conversation_assignment'),
        v_event,
        TRUE
      ),
      read_at = NULL,
      resolved_at = NULL,
      created_at = v_now
    WHERE id = v_existing_id;

    UPDATE notifications
    SET
      resolved_at = COALESCE(resolved_at, v_now),
      read_at = COALESCE(read_at, v_now)
    WHERE type = 'conversation_assigned'
      AND conversation_id = NEW.id
      AND user_id = NEW.assigned_agent_id
      AND id <> v_existing_id;
  ELSE
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
      metadata,
      read_at,
      resolved_at,
      created_at
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
      COALESCE(NULLIF(v_actor_name, ''), 'Sistema') || ' atribuiu uma conversa com '
        || COALESCE(v_contact_name, 'um contato'),
      '/inbox?c=' || NEW.id::text,
      notification_append_assignment_event(
        jsonb_build_object('source', 'conversation_assignment'),
        v_event,
        TRUE
      ),
      NULL,
      NULL,
      v_now
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to reconcile assignment notification timeline for conversation %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_conversation_assigned() OWNER TO postgres;

WITH ranked_assignment_notifications AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY account_id, user_id, conversation_id
      ORDER BY created_at DESC, id DESC
    ) AS row_number
  FROM notifications
  WHERE type = 'conversation_assigned'
    AND conversation_id IS NOT NULL
)
UPDATE notifications
SET
  read_at = COALESCE(notifications.read_at, NOW()),
  resolved_at = COALESCE(notifications.resolved_at, NOW())
FROM ranked_assignment_notifications ranked
WHERE notifications.id = ranked.id
  AND ranked.row_number > 1;
