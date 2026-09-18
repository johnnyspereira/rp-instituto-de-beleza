-- Operational integrity for the clinic calendar.
-- Prevents double-booking across appointments and time blocks even when two
-- operators save at the same time or a booking is created outside the CRM UI.

CREATE OR REPLACE FUNCTION clinic_assert_appointment_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Serialise calendar writes inside a workspace. This closes the race where
  -- two operators validate the same free slot before either insert commits.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('clinic-agenda:' || NEW.account_id::TEXT, 0)
  );

  IF NEW.status IN ('cancelled', 'no_show') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM clinic_appointments appointment
    WHERE appointment.account_id = NEW.account_id
      AND appointment.id <> NEW.id
      AND appointment.status NOT IN ('cancelled', 'no_show')
      AND tstzrange(appointment.scheduled_start, appointment.scheduled_end, '[)')
        && tstzrange(NEW.scheduled_start, NEW.scheduled_end, '[)')
      AND (
        (NEW.professional_profile_id IS NOT NULL AND appointment.professional_profile_id = NEW.professional_profile_id)
        OR (NEW.room_id IS NOT NULL AND appointment.room_id = NEW.room_id)
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      MESSAGE = 'Este horário já está ocupado pelo profissional ou pela sala selecionada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM clinic_time_blocks block
    WHERE block.account_id = NEW.account_id
      AND tstzrange(block.starts_at, block.ends_at, '[)')
        && tstzrange(NEW.scheduled_start, NEW.scheduled_end, '[)')
      AND (
        (block.professional_profile_id IS NULL AND block.room_id IS NULL)
        OR (NEW.professional_profile_id IS NOT NULL AND block.professional_profile_id = NEW.professional_profile_id)
        OR (NEW.room_id IS NOT NULL AND block.room_id = NEW.room_id)
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      MESSAGE = 'Este horário está bloqueado para o profissional ou sala selecionada.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinic_appointment_availability_trigger ON clinic_appointments;
CREATE TRIGGER clinic_appointment_availability_trigger
  BEFORE INSERT OR UPDATE OF scheduled_start, scheduled_end,
    professional_profile_id, room_id, status
  ON clinic_appointments
  FOR EACH ROW EXECUTE FUNCTION clinic_assert_appointment_availability();

CREATE OR REPLACE FUNCTION clinic_assert_time_block_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('clinic-agenda:' || NEW.account_id::TEXT, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM clinic_appointments appointment
    WHERE appointment.account_id = NEW.account_id
      AND appointment.status NOT IN ('cancelled', 'no_show')
      AND tstzrange(appointment.scheduled_start, appointment.scheduled_end, '[)')
        && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
      AND (
        (NEW.professional_profile_id IS NULL AND NEW.room_id IS NULL)
        OR (NEW.professional_profile_id IS NOT NULL AND appointment.professional_profile_id = NEW.professional_profile_id)
        OR (NEW.room_id IS NOT NULL AND appointment.room_id = NEW.room_id)
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      MESSAGE = 'Não é possível bloquear um horário que já possui uma marcação.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM clinic_time_blocks block
    WHERE block.account_id = NEW.account_id
      AND block.id <> NEW.id
      AND tstzrange(block.starts_at, block.ends_at, '[)')
        && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
      AND (
        (NEW.professional_profile_id IS NULL AND NEW.room_id IS NULL)
        OR (block.professional_profile_id IS NULL AND block.room_id IS NULL)
        OR (NEW.professional_profile_id IS NOT NULL AND block.professional_profile_id = NEW.professional_profile_id)
        OR (NEW.room_id IS NOT NULL AND block.room_id = NEW.room_id)
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      MESSAGE = 'Já existe um bloqueio sobreposto para este recurso.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinic_time_block_availability_trigger ON clinic_time_blocks;
CREATE TRIGGER clinic_time_block_availability_trigger
  BEFORE INSERT OR UPDATE OF starts_at, ends_at, professional_profile_id, room_id
  ON clinic_time_blocks
  FOR EACH ROW EXECUTE FUNCTION clinic_assert_time_block_availability();
