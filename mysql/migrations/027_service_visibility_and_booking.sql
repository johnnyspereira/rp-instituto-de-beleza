-- Keeps a service bookable in CRM/Portal without requiring it on the public site.
ALTER TABLE clinic_services
  ADD COLUMN show_on_site BOOLEAN NOT NULL DEFAULT TRUE AFTER online_enabled,
  ADD COLUMN internal_booking_enabled BOOLEAN NOT NULL DEFAULT TRUE AFTER show_on_site;

CREATE INDEX clinic_services_account_booking_idx
  ON clinic_services(account_id, is_active, internal_booking_enabled, name);
