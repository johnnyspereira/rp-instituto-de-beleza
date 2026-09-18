ALTER TABLE clinic_services
  ADD COLUMN coming_soon BOOLEAN NOT NULL DEFAULT FALSE AFTER online_enabled;
