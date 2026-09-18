-- Append-only client audit events used by Client 360.
CREATE TABLE IF NOT EXISTS client_activity_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'profile_updated', 'tag_added', 'tag_removed', 'note_added', 'note_removed',
    'custom_field_updated'
  )),
  title TEXT NOT NULL,
  detail TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_activity_events_contact_idx
  ON client_activity_events(contact_id, created_at DESC);

ALTER TABLE client_activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_activity_events_select ON client_activity_events;
CREATE POLICY client_activity_events_select ON client_activity_events FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS client_activity_events_insert ON client_activity_events;
CREATE POLICY client_activity_events_insert ON client_activity_events FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

INSERT INTO client_activity_events(
  account_id, contact_id, event_type, title, detail, actor_user_id, metadata, created_at
)
SELECT
  c.account_id, n.contact_id, 'note_added', 'Nota adicionada', LEFT(n.note_text, 240),
  n.user_id, jsonb_build_object('note_id', n.id, 'backfilled', true), n.created_at
FROM contact_notes n
JOIN contacts c ON c.id = n.contact_id
WHERE NOT EXISTS (
  SELECT 1 FROM client_activity_events e
  WHERE e.contact_id = n.contact_id AND e.metadata->>'note_id' = n.id::TEXT
);

CREATE OR REPLACE FUNCTION audit_client_profile_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_changed TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN v_changed := array_append(v_changed, 'nome'); END IF;
  IF OLD.phone IS DISTINCT FROM NEW.phone THEN v_changed := array_append(v_changed, 'telefone'); END IF;
  IF OLD.email IS DISTINCT FROM NEW.email THEN v_changed := array_append(v_changed, 'email'); END IF;
  IF OLD.company IS DISTINCT FROM NEW.company THEN v_changed := array_append(v_changed, 'empresa'); END IF;
  IF OLD.client_reference IS DISTINCT FROM NEW.client_reference THEN v_changed := array_append(v_changed, 'referência'); END IF;
  IF cardinality(v_changed) > 0 THEN
    INSERT INTO client_activity_events(
      account_id, contact_id, event_type, title, detail, actor_user_id, metadata
    ) VALUES (
      NEW.account_id, NEW.id, 'profile_updated', 'Ficha do cliente atualizada',
      'Campos alterados: ' || array_to_string(v_changed, ', '), auth.uid(),
      jsonb_build_object('fields', to_jsonb(v_changed))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_client_profile_update_trigger ON contacts;
CREATE TRIGGER audit_client_profile_update_trigger
  AFTER UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION audit_client_profile_update();

CREATE OR REPLACE FUNCTION audit_client_tag_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_contact_id UUID;
  v_tag_id UUID;
  v_account_id UUID;
  v_tag_name TEXT;
BEGIN
  v_contact_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.contact_id ELSE OLD.contact_id END;
  v_tag_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.tag_id ELSE OLD.tag_id END;
  SELECT account_id INTO v_account_id FROM contacts WHERE id = v_contact_id;
  SELECT name INTO v_tag_name FROM tags WHERE id = v_tag_id;
  INSERT INTO client_activity_events(
    account_id, contact_id, event_type, title, detail, actor_user_id, metadata
  ) VALUES (
    v_account_id, v_contact_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'tag_added' ELSE 'tag_removed' END,
    CASE WHEN TG_OP = 'INSERT' THEN 'Etiqueta adicionada' ELSE 'Etiqueta removida' END,
    COALESCE(v_tag_name, 'Etiqueta'), auth.uid(), jsonb_build_object('tag_id', v_tag_id)
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_client_tag_change_trigger ON contact_tags;
CREATE TRIGGER audit_client_tag_change_trigger
  AFTER INSERT OR DELETE ON contact_tags FOR EACH ROW EXECUTE FUNCTION audit_client_tag_change();

CREATE OR REPLACE FUNCTION audit_client_note_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_contact_id UUID;
  v_account_id UUID;
  v_note TEXT;
BEGIN
  v_contact_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.contact_id ELSE OLD.contact_id END;
  v_note := CASE WHEN TG_OP = 'INSERT' THEN NEW.note_text ELSE OLD.note_text END;
  SELECT account_id INTO v_account_id FROM contacts WHERE id = v_contact_id;
  INSERT INTO client_activity_events(
    account_id, contact_id, event_type, title, detail, actor_user_id, metadata
  ) VALUES (
    v_account_id, v_contact_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'note_added' ELSE 'note_removed' END,
    CASE WHEN TG_OP = 'INSERT' THEN 'Nota adicionada' ELSE 'Nota removida' END,
    LEFT(v_note, 240), auth.uid(),
    jsonb_build_object(
      'note_id', CASE WHEN TG_OP = 'INSERT' THEN NEW.id ELSE OLD.id END
    )
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_client_note_change_trigger ON contact_notes;
CREATE TRIGGER audit_client_note_change_trigger
  AFTER INSERT OR DELETE ON contact_notes FOR EACH ROW EXECUTE FUNCTION audit_client_note_change();

CREATE OR REPLACE FUNCTION audit_client_custom_field_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_contact_id UUID;
  v_field_id UUID;
  v_account_id UUID;
  v_field_name TEXT;
BEGIN
  v_contact_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.contact_id ELSE NEW.contact_id END;
  v_field_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.custom_field_id ELSE NEW.custom_field_id END;
  SELECT account_id INTO v_account_id FROM contacts WHERE id = v_contact_id;
  SELECT field_name INTO v_field_name FROM custom_fields WHERE id = v_field_id;
  INSERT INTO client_activity_events(
    account_id, contact_id, event_type, title, detail, actor_user_id, metadata
  ) VALUES (
    v_account_id, v_contact_id, 'custom_field_updated',
    'Campo personalizado atualizado', COALESCE(v_field_name, 'Campo personalizado'),
    auth.uid(), jsonb_build_object('custom_field_id', v_field_id)
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_client_custom_field_change_trigger ON contact_custom_values;
CREATE TRIGGER audit_client_custom_field_change_trigger
  AFTER INSERT OR UPDATE OR DELETE ON contact_custom_values FOR EACH ROW
  EXECUTE FUNCTION audit_client_custom_field_change();

NOTIFY pgrst, 'reload schema';
