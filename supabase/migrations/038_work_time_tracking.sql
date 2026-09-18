-- Work time tracking: daily point clock + forced inactivity pauses.
--
-- Each user gets one work_sessions row per account/day. Pauses live in
-- work_breaks so the UI can show exactly when the system locked due to
-- inactivity and how much time was excluded from the work total.

CREATE TABLE IF NOT EXISTS work_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, user_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_account_date
  ON work_sessions(account_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_work_sessions_user_date
  ON work_sessions(user_id, work_date DESC);

CREATE TABLE IF NOT EXISTS work_breaks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'forced_inactivity'
    CHECK (reason IN ('forced_inactivity', 'manual', 'system_lock')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_breaks_session_started
  ON work_breaks(session_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_breaks_user_started
  ON work_breaks(user_id, started_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON work_sessions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON work_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON work_breaks;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON work_breaks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_breaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_sessions_select ON work_sessions;
DROP POLICY IF EXISTS work_sessions_insert ON work_sessions;
DROP POLICY IF EXISTS work_sessions_update ON work_sessions;
DROP POLICY IF EXISTS work_breaks_select ON work_breaks;
DROP POLICY IF EXISTS work_breaks_insert ON work_breaks;
DROP POLICY IF EXISTS work_breaks_update ON work_breaks;

CREATE POLICY work_sessions_select ON work_sessions
  FOR SELECT USING (
    auth.uid() = user_id OR is_account_member(account_id, 'admin')
  );

CREATE POLICY work_sessions_insert ON work_sessions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND is_account_member(account_id)
  );

CREATE POLICY work_sessions_update ON work_sessions
  FOR UPDATE USING (
    auth.uid() = user_id OR is_account_member(account_id, 'admin')
  );

CREATE POLICY work_breaks_select ON work_breaks
  FOR SELECT USING (
    auth.uid() = user_id OR is_account_member(account_id, 'admin')
  );

CREATE POLICY work_breaks_insert ON work_breaks
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND is_account_member(account_id)
  );

CREATE POLICY work_breaks_update ON work_breaks
  FOR UPDATE USING (
    auth.uid() = user_id OR is_account_member(account_id, 'admin')
  );
