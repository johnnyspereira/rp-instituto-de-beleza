-- Distinguish authenticated Portal 360 bookings from public guest bookings.
-- The dashboard uses this source to surface appointments awaiting approval.
ALTER TABLE clinic_appointments
  MODIFY COLUMN source ENUM(
    'manual', 'public_link', 'client_portal', 'whatsapp', 'automation', 'referral'
  ) NOT NULL DEFAULT 'manual';

CREATE INDEX clinic_appointments_portal_confirmation_idx
  ON clinic_appointments (account_id, source, confirmation_status, scheduled_start);
