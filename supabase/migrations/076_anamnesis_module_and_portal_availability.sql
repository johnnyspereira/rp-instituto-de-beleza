-- Complete anamnesis configuration and repair online booking availability.

ALTER TABLE clinic_communication_settings
  ADD COLUMN IF NOT EXISTS anamnesis_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS anamnesis_public_slug TEXT,
  ADD COLUMN IF NOT EXISTS anamnesis_title TEXT NOT NULL DEFAULT 'Ficha de anamnese',
  ADD COLUMN IF NOT EXISTS anamnesis_form_config JSONB NOT NULL DEFAULT
    '{
      "modalities": [
        {"id":"relaxing","label":"Massagem relaxante ou sensorial","enabled":true},
        {"id":"therapeutic","label":"Massagem terapêutica ou desportiva","enabled":true},
        {"id":"heat","label":"Pedras quentes ou velas quentes","enabled":true},
        {"id":"aesthetics","label":"Estética facial ou corporal","enabled":true}
      ],
      "customQuestions": []
    }'::JSONB;

UPDATE clinic_communication_settings
SET anamnesis_public_slug = 'anamnese-' || SUBSTRING(REPLACE(account_id::TEXT, '-', '') FROM 1 FOR 10)
WHERE NULLIF(BTRIM(anamnesis_public_slug), '') IS NULL;

ALTER TABLE clinic_communication_settings
  ALTER COLUMN anamnesis_public_slug SET NOT NULL;

ALTER TABLE clinic_communication_settings
  DROP CONSTRAINT IF EXISTS clinic_communication_settings_anamnesis_slug_check;
ALTER TABLE clinic_communication_settings
  ADD CONSTRAINT clinic_communication_settings_anamnesis_slug_check
  CHECK (anamnesis_public_slug ~ '^[a-z0-9][a-z0-9-]{2,62}$');

CREATE UNIQUE INDEX IF NOT EXISTS clinic_communication_anamnesis_public_slug_idx
  ON clinic_communication_settings(LOWER(anamnesis_public_slug));

-- Existing installations can have online booking enabled while no team member
-- has yet been promoted to professional. Activate only the account owner in
-- that specific state; it remains editable in Clinic > Professionals.
UPDATE profiles owner_profile
SET
  is_professional = TRUE,
  professional_show_online = TRUE,
  online_booking_blocked = FALSE,
  professional_title = COALESCE(NULLIF(owner_profile.professional_title, ''), 'Profissional'),
  working_hours = CASE
    WHEN owner_profile.working_hours IS NULL OR owner_profile.working_hours = '{}'::JSONB THEN
      '{
        "mon":{"enabled":true,"start":"09:00","breakStart":"13:00","breakEnd":"14:00","end":"21:00"},
        "tue":{"enabled":true,"start":"09:00","breakStart":"13:00","breakEnd":"14:00","end":"21:00"},
        "wed":{"enabled":true,"start":"09:00","breakStart":"13:00","breakEnd":"14:00","end":"21:00"},
        "thu":{"enabled":true,"start":"09:00","breakStart":"13:00","breakEnd":"14:00","end":"21:00"},
        "fri":{"enabled":true,"start":"09:00","breakStart":"13:00","breakEnd":"14:00","end":"21:00"},
        "sat":{"enabled":true,"start":"10:00","breakStart":"13:00","breakEnd":"14:00","end":"20:00"},
        "sun":{"enabled":false,"start":"10:00","breakStart":"13:00","breakEnd":"14:00","end":"20:00"}
      }'::JSONB
    ELSE owner_profile.working_hours
  END
WHERE owner_profile.account_role = 'owner'
  AND NOT EXISTS (
    SELECT 1 FROM profiles professional
    WHERE professional.account_id = owner_profile.account_id
      AND professional.is_professional = TRUE
  );

NOTIFY pgrst, 'reload schema';
