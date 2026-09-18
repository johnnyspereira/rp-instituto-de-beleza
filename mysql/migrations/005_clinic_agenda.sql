CREATE TABLE IF NOT EXISTS clinic_services (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  reference VARCHAR(50) NULL,
  category VARCHAR(150) NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  color VARCHAR(20) NOT NULL DEFAULT '#7c3aed',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  online_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  iva_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  commissions_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  collaborators_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  personalize_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  details_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  commission_executant_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  commission_responsible_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY clinic_services_account_reference_unique (account_id, reference),
  KEY clinic_services_account_active_idx (account_id, is_active, name),
  CONSTRAINT clinic_services_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT clinic_services_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT clinic_services_duration_check CHECK (duration_minutes > 0),
  CONSTRAINT clinic_services_price_check CHECK (price >= 0),
  CONSTRAINT clinic_services_commission_executant_check
    CHECK (commission_executant_percent BETWEEN 0 AND 100),
  CONSTRAINT clinic_services_commission_responsible_check
    CHECK (commission_responsible_percent BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinic_rooms (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#0ea5e9',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY clinic_rooms_account_active_idx (account_id, is_active, name),
  CONSTRAINT clinic_rooms_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT clinic_rooms_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinic_products (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  sku VARCHAR(150) NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  stock_quantity INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 3,
  supplier_name VARCHAR(255) NULL,
  supplier_reference VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY clinic_products_account_sku_unique (account_id, sku),
  KEY clinic_products_account_active_idx (account_id, is_active, name),
  CONSTRAINT clinic_products_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT clinic_products_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT clinic_products_price_check CHECK (price >= 0),
  CONSTRAINT clinic_products_cost_price_check CHECK (cost_price >= 0),
  CONSTRAINT clinic_products_stock_check CHECK (stock_quantity >= 0),
  CONSTRAINT clinic_products_low_stock_check CHECK (low_stock_threshold >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinic_appointments (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  contact_id CHAR(36) NULL,
  service_id CHAR(36) NULL,
  professional_profile_id CHAR(36) NULL,
  room_id CHAR(36) NULL,
  scheduled_start DATETIME(3) NOT NULL,
  scheduled_end DATETIME(3) NOT NULL,
  status ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')
    NOT NULL DEFAULT 'scheduled',
  source ENUM('manual', 'public_link', 'whatsapp', 'automation', 'referral')
    NOT NULL DEFAULT 'manual',
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  notes TEXT NULL,
  treatment_notes TEXT NULL,
  coupon_code VARCHAR(255) NULL,
  confirmation_sent_at DATETIME(3) NULL,
  reminder_sent_at DATETIME(3) NULL,
  confirmation_reminder_sent_at DATETIME(3) NULL,
  arrived_at DATETIME(3) NULL,
  paid_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  original_scheduled_start DATETIME(3) NULL,
  original_scheduled_end DATETIME(3) NULL,
  schedule_change_count INT NOT NULL DEFAULT 0,
  reschedule_count INT NOT NULL DEFAULT 0,
  last_schedule_change_at DATETIME(3) NULL,
  last_schedule_change_type VARCHAR(100) NULL,
  last_reschedule_reason TEXT NULL,
  confirmation_status ENUM('not_required', 'pending', 'confirmed', 'declined')
    NOT NULL DEFAULT 'not_required',
  confirmation_requested_at DATETIME(3) NULL,
  confirmation_response_at DATETIME(3) NULL,
  confirmation_request_message TEXT NULL,
  referral_id CHAR(36) NULL,
  original_price DECIMAL(12,2) NULL,
  referral_discount_type ENUM('fixed_credit', 'percentage', 'service') NULL,
  referral_discount_value DECIMAL(12,2) NULL,
  referral_discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  anamnesis_form_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY clinic_appointments_account_start_idx (account_id, scheduled_start),
  KEY clinic_appointments_contact_start_idx (contact_id, scheduled_start),
  KEY clinic_appointments_professional_start_idx
    (professional_profile_id, scheduled_start),
  KEY clinic_appointments_room_start_idx (room_id, scheduled_start),
  KEY clinic_appointments_status_start_idx (account_id, status, scheduled_start),
  KEY clinic_appointments_confirmation_idx
    (account_id, confirmation_status, confirmation_requested_at),
  KEY clinic_appointments_referral_idx (referral_id),
  CONSTRAINT clinic_appointments_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT clinic_appointments_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT clinic_appointments_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT clinic_appointments_service_id_fk
    FOREIGN KEY (service_id) REFERENCES clinic_services(id) ON DELETE SET NULL,
  CONSTRAINT clinic_appointments_professional_id_fk
    FOREIGN KEY (professional_profile_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT clinic_appointments_room_id_fk
    FOREIGN KEY (room_id) REFERENCES clinic_rooms(id) ON DELETE SET NULL,
  CONSTRAINT clinic_appointments_schedule_check CHECK (scheduled_end > scheduled_start),
  CONSTRAINT clinic_appointments_price_check CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinic_time_blocks (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  professional_profile_id CHAR(36) NULL,
  room_id CHAR(36) NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  reason TEXT NULL,
  is_online_block BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY clinic_time_blocks_account_start_idx (account_id, starts_at),
  KEY clinic_time_blocks_professional_start_idx
    (professional_profile_id, starts_at),
  KEY clinic_time_blocks_room_start_idx (room_id, starts_at),
  CONSTRAINT clinic_time_blocks_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT clinic_time_blocks_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT clinic_time_blocks_professional_id_fk
    FOREIGN KEY (professional_profile_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT clinic_time_blocks_room_id_fk
    FOREIGN KEY (room_id) REFERENCES clinic_rooms(id) ON DELETE SET NULL,
  CONSTRAINT clinic_time_blocks_range_check CHECK (ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinic_agenda_events (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  entity_type ENUM('appointment', 'time_block') NOT NULL,
  entity_id CHAR(36) NOT NULL,
  action ENUM(
    'created', 'updated', 'deleted', 'rescheduled', 'schedule_changed',
    'wrong_booking_moved', 'status_changed', 'message_sent'
  ) NOT NULL,
  reason TEXT NULL,
  metadata JSON NOT NULL,
  old_starts_at DATETIME(3) NULL,
  old_ends_at DATETIME(3) NULL,
  new_starts_at DATETIME(3) NULL,
  new_ends_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY clinic_agenda_events_account_created_idx (account_id, created_at),
  KEY clinic_agenda_events_entity_idx (entity_type, entity_id, created_at),
  KEY clinic_agenda_events_action_idx (account_id, action, created_at),
  CONSTRAINT clinic_agenda_events_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT clinic_agenda_events_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinic_communication_settings (
  account_id CHAR(36) NOT NULL,
  clinic_address TEXT NULL,
  directions TEXT NULL,
  parking_info TEXT NULL,
  payment_methods TEXT NOT NULL,
  anamnesis_intro TEXT NOT NULL,
  confirmation_reminder_hours INT NOT NULL DEFAULT 24,
  auto_send_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  auto_send_pending_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  anamnesis_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  anamnesis_public_slug VARCHAR(63) NOT NULL,
  anamnesis_title VARCHAR(255) NOT NULL DEFAULT 'Ficha de anamnese',
  anamnesis_form_config JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id),
  UNIQUE KEY clinic_communication_anamnesis_slug_unique (anamnesis_public_slug),
  CONSTRAINT clinic_communication_settings_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT clinic_communication_reminder_hours_check
    CHECK (confirmation_reminder_hours BETWEEN 1 AND 168)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinic_anamnesis_forms (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  appointment_id CHAR(36) NULL,
  service_id CHAR(36) NULL,
  public_token CHAR(36) NOT NULL,
  status ENUM('pending', 'submitted', 'reviewed', 'expired', 'revoked')
    NOT NULL DEFAULT 'pending',
  client_name VARCHAR(255) NULL,
  client_email VARCHAR(320) NULL,
  client_phone VARCHAR(50) NULL,
  birth_date DATE NULL,
  selected_modalities JSON NOT NULL,
  answers JSON NOT NULL,
  health_consent BOOLEAN NOT NULL DEFAULT FALSE,
  privacy_consent BOOLEAN NOT NULL DEFAULT FALSE,
  signature_name VARCHAR(255) NULL,
  submitted_at DATETIME(3) NULL,
  reviewed_at DATETIME(3) NULL,
  reviewed_by_user_id CHAR(36) NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY clinic_anamnesis_public_token_unique (public_token),
  UNIQUE KEY clinic_anamnesis_appointment_unique (appointment_id),
  KEY clinic_anamnesis_contact_idx (account_id, contact_id, created_at),
  KEY clinic_anamnesis_pending_idx (account_id, status, expires_at),
  CONSTRAINT clinic_anamnesis_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT clinic_anamnesis_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT clinic_anamnesis_appointment_id_fk
    FOREIGN KEY (appointment_id) REFERENCES clinic_appointments(id) ON DELETE SET NULL,
  CONSTRAINT clinic_anamnesis_service_id_fk
    FOREIGN KEY (service_id) REFERENCES clinic_services(id) ON DELETE SET NULL,
  CONSTRAINT clinic_anamnesis_reviewed_by_fk
    FOREIGN KEY (reviewed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE clinic_appointments
  ADD CONSTRAINT clinic_appointments_anamnesis_form_id_fk
  FOREIGN KEY (anamnesis_form_id)
  REFERENCES clinic_anamnesis_forms(id) ON DELETE SET NULL;

