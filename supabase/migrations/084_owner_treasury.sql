-- Private owner-only treasury: payables and scheduled receivables.

CREATE TABLE IF NOT EXISTS finance_payables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
  supplier TEXT,
  category TEXT NOT NULL DEFAULT 'Outros',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  notes TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_receivable_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES finance_sales(id) ON DELETE CASCADE,
  voucher_id UUID REFERENCES finance_vouchers(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'cancelled')),
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_payables_account_due_idx
  ON finance_payables(account_id, due_date, status);
CREATE INDEX IF NOT EXISTS finance_receivable_schedules_account_due_idx
  ON finance_receivable_schedules(account_id, due_date, status);
CREATE UNIQUE INDEX IF NOT EXISTS finance_receivable_schedules_open_sale_idx
  ON finance_receivable_schedules(sale_id)
  WHERE sale_id IS NOT NULL AND status = 'pending';

ALTER TABLE finance_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_receivable_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_payables_owner_select ON finance_payables;
CREATE POLICY finance_payables_owner_select ON finance_payables FOR SELECT
  USING (is_account_member(account_id, 'owner'));
DROP POLICY IF EXISTS finance_payables_owner_insert ON finance_payables;
CREATE POLICY finance_payables_owner_insert ON finance_payables FOR INSERT
  WITH CHECK (is_account_member(account_id, 'owner') AND created_by_user_id = auth.uid());
DROP POLICY IF EXISTS finance_payables_owner_update ON finance_payables;
CREATE POLICY finance_payables_owner_update ON finance_payables FOR UPDATE
  USING (is_account_member(account_id, 'owner'))
  WITH CHECK (is_account_member(account_id, 'owner'));
DROP POLICY IF EXISTS finance_payables_owner_delete ON finance_payables;
CREATE POLICY finance_payables_owner_delete ON finance_payables FOR DELETE
  USING (is_account_member(account_id, 'owner'));

DROP POLICY IF EXISTS finance_receivable_schedules_owner_select ON finance_receivable_schedules;
CREATE POLICY finance_receivable_schedules_owner_select ON finance_receivable_schedules FOR SELECT
  USING (is_account_member(account_id, 'owner'));
DROP POLICY IF EXISTS finance_receivable_schedules_owner_insert ON finance_receivable_schedules;
CREATE POLICY finance_receivable_schedules_owner_insert ON finance_receivable_schedules FOR INSERT
  WITH CHECK (is_account_member(account_id, 'owner') AND created_by_user_id = auth.uid());
DROP POLICY IF EXISTS finance_receivable_schedules_owner_update ON finance_receivable_schedules;
CREATE POLICY finance_receivable_schedules_owner_update ON finance_receivable_schedules FOR UPDATE
  USING (is_account_member(account_id, 'owner'))
  WITH CHECK (is_account_member(account_id, 'owner'));
DROP POLICY IF EXISTS finance_receivable_schedules_owner_delete ON finance_receivable_schedules;
CREATE POLICY finance_receivable_schedules_owner_delete ON finance_receivable_schedules FOR DELETE
  USING (is_account_member(account_id, 'owner'));

CREATE OR REPLACE FUNCTION touch_owner_treasury_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_payables_touch_updated_at ON finance_payables;
CREATE TRIGGER finance_payables_touch_updated_at BEFORE UPDATE ON finance_payables
  FOR EACH ROW EXECUTE FUNCTION touch_owner_treasury_updated_at();
DROP TRIGGER IF EXISTS finance_receivable_schedules_touch_updated_at ON finance_receivable_schedules;
CREATE TRIGGER finance_receivable_schedules_touch_updated_at BEFORE UPDATE ON finance_receivable_schedules
  FOR EACH ROW EXECUTE FUNCTION touch_owner_treasury_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON finance_payables TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON finance_receivable_schedules TO authenticated;
