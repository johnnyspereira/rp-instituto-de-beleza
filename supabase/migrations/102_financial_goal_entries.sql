-- Real goal ledger entries. A goal's progress is the sum of these rows.

CREATE TABLE IF NOT EXISTS finance_goal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES finance_goals(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL DEFAULT 'contribution'
    CHECK (entry_type IN ('contribution', 'withdrawal', 'adjustment')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_goal_entries_goal_date_idx
  ON finance_goal_entries(goal_id, occurred_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS finance_goal_entries_account_idx
  ON finance_goal_entries(account_id, occurred_on DESC);

ALTER TABLE finance_goal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_goal_entries_select ON finance_goal_entries;
CREATE POLICY finance_goal_entries_select
  ON finance_goal_entries FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS finance_goal_entries_manage ON finance_goal_entries;
CREATE POLICY finance_goal_entries_manage
  ON finance_goal_entries FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

CREATE OR REPLACE VIEW finance_goal_progress AS
SELECT
  g.*,
  COALESCE(
    SUM(
      CASE
        WHEN e.entry_type = 'withdrawal' THEN -e.amount
        ELSE e.amount
      END
    ),
    0
  ) AS ledger_amount,
  COUNT(e.id) AS entries_count,
  MAX(e.occurred_on) AS last_entry_on
FROM finance_goals g
LEFT JOIN finance_goal_entries e ON e.goal_id = g.id
GROUP BY g.id;

NOTIFY pgrst, 'reload schema';
