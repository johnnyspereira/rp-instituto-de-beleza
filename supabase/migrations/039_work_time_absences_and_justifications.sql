-- Work time hardening:
-- - sessions can now be marked as absent when a day passes without a clock-in
-- - every break can carry a justification before the day is closed

ALTER TABLE work_sessions
  DROP CONSTRAINT IF EXISTS work_sessions_status_check;

ALTER TABLE work_sessions
  ADD CONSTRAINT work_sessions_status_check
  CHECK (status IN ('open', 'closed', 'absent'));

ALTER TABLE work_sessions
  ADD COLUMN IF NOT EXISTS absence_reason TEXT,
  ADD COLUMN IF NOT EXISTS absence_recorded_at TIMESTAMPTZ;

ALTER TABLE work_breaks
  ADD COLUMN IF NOT EXISTS justification TEXT,
  ADD COLUMN IF NOT EXISTS justified_at TIMESTAMPTZ;
