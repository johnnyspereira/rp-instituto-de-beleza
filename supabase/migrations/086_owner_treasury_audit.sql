-- Owner treasury audit trail for edits and corrections.

ALTER TABLE finance_payables
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE finance_receivable_schedules
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cash_movement_id UUID REFERENCES finance_cash_movements(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS finance_treasury_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('payable', 'receivable')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'status_changed', 'corrected')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_treasury_events_entity_idx
  ON finance_treasury_events(account_id, entity_type, entity_id, created_at DESC);
ALTER TABLE finance_treasury_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_treasury_events_owner_select ON finance_treasury_events;
CREATE POLICY finance_treasury_events_owner_select ON finance_treasury_events FOR SELECT
  USING (is_account_member(account_id, 'owner'));

CREATE OR REPLACE FUNCTION audit_owner_treasury_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type TEXT := CASE WHEN TG_TABLE_NAME = 'finance_payables' THEN 'payable' ELSE 'receivable' END;
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO finance_treasury_events(account_id, entity_type, entity_id, action, actor_user_id, after_data)
    VALUES(NEW.account_id, v_type, NEW.id, 'created', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  v_action := CASE
    WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_changed'
    WHEN NEW.correction_reason IS DISTINCT FROM OLD.correction_reason THEN 'corrected'
    ELSE 'updated'
  END;
  INSERT INTO finance_treasury_events(account_id, entity_type, entity_id, action, actor_user_id, before_data, after_data)
  VALUES(NEW.account_id, v_type, NEW.id, v_action, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_payables_audit_change ON finance_payables;
CREATE TRIGGER finance_payables_audit_change AFTER INSERT OR UPDATE ON finance_payables
  FOR EACH ROW EXECUTE FUNCTION audit_owner_treasury_change();
DROP TRIGGER IF EXISTS finance_receivables_audit_change ON finance_receivable_schedules;
CREATE TRIGGER finance_receivables_audit_change AFTER INSERT OR UPDATE ON finance_receivable_schedules
  FOR EACH ROW EXECUTE FUNCTION audit_owner_treasury_change();

GRANT SELECT ON finance_treasury_events TO authenticated;
NOTIFY pgrst, 'reload schema';
