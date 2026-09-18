-- ============================================================
-- 049_clinic_agenda_audit.sql
--
-- Operational audit layer for the clinic agenda:
--   * schedule-change metadata on appointments for reporting;
--   * append-only events for appointment and time-block actions.
-- ============================================================

ALTER TABLE clinic_appointments
  ADD COLUMN IF NOT EXISTS original_scheduled_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_scheduled_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_change_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_schedule_change_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_schedule_change_type TEXT,
  ADD COLUMN IF NOT EXISTS last_reschedule_reason TEXT;

UPDATE clinic_appointments
SET
  original_scheduled_start = COALESCE(original_scheduled_start, scheduled_start),
  original_scheduled_end = COALESCE(original_scheduled_end, scheduled_end)
WHERE original_scheduled_start IS NULL
   OR original_scheduled_end IS NULL;

CREATE TABLE IF NOT EXISTS clinic_agenda_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('appointment', 'time_block')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'created',
    'updated',
    'deleted',
    'rescheduled',
    'schedule_changed',
    'wrong_booking_moved',
    'status_changed',
    'message_sent'
  )),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  old_starts_at TIMESTAMPTZ,
  old_ends_at TIMESTAMPTZ,
  new_starts_at TIMESTAMPTZ,
  new_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_agenda_events_account_created
  ON clinic_agenda_events(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinic_agenda_events_entity
  ON clinic_agenda_events(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinic_agenda_events_action
  ON clinic_agenda_events(account_id, action, created_at DESC);

ALTER TABLE clinic_agenda_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_agenda_events_select ON clinic_agenda_events;
DROP POLICY IF EXISTS clinic_agenda_events_insert ON clinic_agenda_events;

CREATE POLICY clinic_agenda_events_select ON clinic_agenda_events FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY clinic_agenda_events_insert ON clinic_agenda_events FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
