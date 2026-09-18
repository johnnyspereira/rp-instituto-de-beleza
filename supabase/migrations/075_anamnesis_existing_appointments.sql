-- Create anamnesis forms for future appointments that existed before the
-- automated communication module was installed.

INSERT INTO clinic_anamnesis_forms (
  account_id,
  contact_id,
  appointment_id,
  service_id,
  client_name,
  client_email,
  client_phone,
  birth_date,
  selected_modalities
)
SELECT
  appointment.account_id,
  appointment.contact_id,
  appointment.id,
  appointment.service_id,
  contact.name,
  contact.email,
  contact.phone,
  contact.birth_date,
  ARRAY_REMOVE(ARRAY[service.name, service.category], NULL)::TEXT[]
FROM clinic_appointments appointment
JOIN contacts contact ON contact.id = appointment.contact_id
LEFT JOIN clinic_services service ON service.id = appointment.service_id
LEFT JOIN clinic_anamnesis_forms form
  ON form.appointment_id = appointment.id
WHERE form.id IS NULL
  AND appointment.scheduled_start >= NOW()
  AND appointment.status NOT IN ('cancelled', 'no_show');

UPDATE clinic_appointments appointment
SET anamnesis_form_id = form.id
FROM clinic_anamnesis_forms form
WHERE form.appointment_id = appointment.id
  AND appointment.anamnesis_form_id IS DISTINCT FROM form.id;

NOTIFY pgrst, 'reload schema';
