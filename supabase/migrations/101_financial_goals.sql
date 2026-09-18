-- Financial goals by category/pauta: rent, car, revenue targets, savings, etc.

CREATE TABLE IF NOT EXISTS finance_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('revenue', 'rent', 'car', 'salary', 'supplier', 'tax', 'savings', 'other')),
  goal_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (goal_type IN ('manual', 'revenue_paid')),
  target_amount NUMERIC(12,2) NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  period_start DATE NOT NULL DEFAULT CURRENT_DATE,
  period_end DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  alert_threshold_percent NUMERIC(5,2) NOT NULL DEFAULT 75 CHECK (alert_threshold_percent >= 0 AND alert_threshold_percent <= 100),
  notes TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_goals_account_status_idx
  ON finance_goals(account_id, status, period_end);

ALTER TABLE finance_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_goals_select ON finance_goals;
CREATE POLICY finance_goals_select
  ON finance_goals FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS finance_goals_manage ON finance_goals;
CREATE POLICY finance_goals_manage
  ON finance_goals FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON finance_goals;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON finance_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
