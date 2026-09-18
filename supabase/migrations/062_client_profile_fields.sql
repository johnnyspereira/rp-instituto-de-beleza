-- Standard customer identity, localization and consent fields.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS address_line TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Portugal',
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact TEXT DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_consent BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_gender_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female', 'non_binary', 'not_informed'));

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_preferred_contact_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_preferred_contact_check
  CHECK (preferred_contact IS NULL OR preferred_contact IN ('whatsapp', 'phone', 'email'));

CREATE INDEX IF NOT EXISTS contacts_tax_id_idx ON contacts(account_id, tax_id)
  WHERE tax_id IS NOT NULL;

CREATE OR REPLACE FUNCTION audit_client_profile_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_changed TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN v_changed := array_append(v_changed, 'nome'); END IF;
  IF OLD.phone IS DISTINCT FROM NEW.phone THEN v_changed := array_append(v_changed, 'telefone'); END IF;
  IF OLD.email IS DISTINCT FROM NEW.email THEN v_changed := array_append(v_changed, 'email'); END IF;
  IF OLD.company IS DISTINCT FROM NEW.company THEN v_changed := array_append(v_changed, 'empresa'); END IF;
  IF OLD.client_reference IS DISTINCT FROM NEW.client_reference THEN v_changed := array_append(v_changed, 'referência'); END IF;
  IF OLD.birth_date IS DISTINCT FROM NEW.birth_date THEN v_changed := array_append(v_changed, 'nascimento'); END IF;
  IF OLD.tax_id IS DISTINCT FROM NEW.tax_id THEN v_changed := array_append(v_changed, 'NIF'); END IF;
  IF OLD.gender IS DISTINCT FROM NEW.gender THEN v_changed := array_append(v_changed, 'género'); END IF;
  IF OLD.address_line IS DISTINCT FROM NEW.address_line OR OLD.postal_code IS DISTINCT FROM NEW.postal_code OR OLD.city IS DISTINCT FROM NEW.city OR OLD.country IS DISTINCT FROM NEW.country THEN
    v_changed := array_append(v_changed, 'morada');
  END IF;
  IF OLD.source IS DISTINCT FROM NEW.source THEN v_changed := array_append(v_changed, 'origem'); END IF;
  IF OLD.preferred_contact IS DISTINCT FROM NEW.preferred_contact THEN v_changed := array_append(v_changed, 'canal preferido'); END IF;
  IF OLD.marketing_consent IS DISTINCT FROM NEW.marketing_consent OR OLD.whatsapp_consent IS DISTINCT FROM NEW.whatsapp_consent THEN
    v_changed := array_append(v_changed, 'consentimentos');
  END IF;
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

NOTIFY pgrst, 'reload schema';
