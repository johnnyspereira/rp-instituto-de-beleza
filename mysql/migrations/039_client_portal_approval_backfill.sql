-- Client Portal 360 bookings require professional confirmation. Older MySQL
-- bookings used the table default (`not_required`) and therefore never
-- appeared in the Portal 360 approval queue.
UPDATE clinic_appointments
SET confirmation_status = 'pending'
WHERE source = 'client_portal'
  AND status IN ('scheduled', 'confirmed')
  AND confirmation_status = 'not_required';
