-- ============================================================
-- 047_clinic_appointment_actions.sql
--
-- Extra operational fields for the appointment sheet:
--   * arrived_at: client checked in / arrived
--   * paid_at: payment marked as done
--   * coupon_code: optional coupon/reference code used in the booking
--   * treatment_notes: treatment sheet notes separated from internal notes
-- ============================================================

ALTER TABLE clinic_appointments
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS treatment_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_clinic_appointments_arrived
  ON clinic_appointments(account_id, arrived_at)
  WHERE arrived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_appointments_paid
  ON clinic_appointments(account_id, paid_at)
  WHERE paid_at IS NOT NULL;
