-- Assignment notification correctness:
-- - only one active assignment notification per user/conversation
-- - reassigning resolves the previous assignee's notification
-- - unassigning resolves the current assignee's notification
-- - assigning again updates the existing active notification instead of
--   growing duplicate unread counters forever

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY conversation_id, user_id, type
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM notifications
  WHERE type = 'conversation_assigned'
    AND resolved_at IS NULL
)
UPDATE notifications n
SET
  resolved_at = COALESCE(n.resolved_at, NOW()),
  read_at = COALESCE(n.read_at, NOW())
FROM ranked r
WHERE n.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_active_assignment_once
  ON notifications(conversation_id, user_id, type)
  WHERE type = 'conversation_assigned'
    AND resolved_at IS NULL;

CREATE OR REPLACE FUNCTION notify_conversation_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name TEXT;
  v_actor_name TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
      RETURN NEW;
    END IF;

    IF OLD.assigned_agent_id IS NOT NULL THEN
      UPDATE notifications
      SET
        resolved_at = COALESCE(resolved_at, v_now),
        read_at = COALESCE(read_at, v_now)
      WHERE type = 'conversation_assigned'
        AND conversation_id = NEW.id
        AND user_id = OLD.assigned_agent_id
        AND resolved_at IS NULL;
    END IF;

    IF NEW.assigned_agent_id IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Skip self-assignment after resolving any previous assignee above.
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
    COALESCE(v_actor_name, 'Sistema') || ' atribuiu uma conversa com '
      || COALESCE(v_contact_name, 'um contato'),
    '/inbox?c=' || NEW.id::text,
    jsonb_build_object('source', 'conversation_assignment'),
    NULL,
    NULL,
    v_now
  )
  ON CONFLICT (conversation_id, user_id, type)
  WHERE type = 'conversation_assigned'
    AND resolved_at IS NULL
  DO UPDATE SET
    account_id = EXCLUDED.account_id,
    category = EXCLUDED.category,
    priority = EXCLUDED.priority,
    contact_id = EXCLUDED.contact_id,
    actor_user_id = EXCLUDED.actor_user_id,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    action_url = EXCLUDED.action_url,
    metadata = EXCLUDED.metadata,
    read_at = NULL,
    created_at = EXCLUDED.created_at;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to reconcile assignment notification for conversation %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_conversation_assigned() OWNER TO postgres;
