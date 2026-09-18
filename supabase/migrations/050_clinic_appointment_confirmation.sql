-- ============================================================
-- 050_clinic_appointment_confirmation.sql
--
-- Tracks when a changed appointment needs the client to confirm
-- the new date/time through WhatsApp.
-- ============================================================

ALTER TABLE clinic_appointments
  ADD COLUMN IF NOT EXISTS confirmation_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (confirmation_status IN ('not_required', 'pending', 'confirmed', 'declined')),
  ADD COLUMN IF NOT EXISTS confirmation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_request_message TEXT;

UPDATE clinic_appointments
SET confirmation_status = 'confirmed'
WHERE confirmation_sent_at IS NOT NULL
  AND confirmation_status = 'not_required';

CREATE INDEX IF NOT EXISTS idx_clinic_appointments_confirmation_pending
  ON clinic_appointments(account_id, contact_id, scheduled_start)
  WHERE confirmation_status = 'pending';
