ALTER TABLE privacy_settings
  ADD COLUMN IF NOT EXISTS policy_summary TEXT NULL,
  ADD COLUMN IF NOT EXISTS international_transfers TEXT NULL,
  ADD COLUMN IF NOT EXISTS complaint_authority VARCHAR(255) NOT NULL DEFAULT 'Comissão Nacional de Proteção de Dados (CNPD)',
  ADD COLUMN IF NOT EXISTS processing_purposes JSON NULL,
  ADD COLUMN IF NOT EXISTS retention_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_retention_run_at DATETIME(3) NULL;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS privacy_review_status ENUM('current','legacy_unverified','withdrawn') NOT NULL DEFAULT 'current',
  ADD COLUMN IF NOT EXISTS processing_restricted_at DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS anonymized_at DATETIME(3) NULL;

UPDATE contacts SET privacy_review_status = 'legacy_unverified'
WHERE anonymized_at IS NULL AND (marketing_consent = TRUE OR whatsapp_consent = TRUE);

ALTER TABLE privacy_data_subject_requests
  ADD COLUMN IF NOT EXISTS decision ENUM('pending','approved','partially_approved','rejected') NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_basis TEXT NULL,
  ADD COLUMN IF NOT EXISTS extended_due_at DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS extension_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS export_generated_at DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS completed_by_user_id CHAR(36) NULL;

CREATE TABLE IF NOT EXISTS privacy_processors (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  service VARCHAR(255) NOT NULL,
  data_categories TEXT NULL,
  processing_location VARCHAR(255) NULL,
  safeguards TEXT NULL,
  agreement_status ENUM('pending','signed','not_required') NOT NULL DEFAULT 'pending',
  agreement_reviewed_at DATETIME(3) NULL,
  contact_email VARCHAR(320) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id), KEY privacy_processors_account_idx (account_id, name),
  CONSTRAINT privacy_processors_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS privacy_processing_activities (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  purposes TEXT NOT NULL,
  data_subjects TEXT NOT NULL,
  data_categories TEXT NOT NULL,
  legal_basis VARCHAR(100) NOT NULL,
  special_category_basis VARCHAR(100) NULL,
  recipients TEXT NULL,
  retention_rule TEXT NULL,
  security_measures TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id), KEY privacy_activities_account_idx (account_id, is_active),
  CONSTRAINT privacy_activities_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS privacy_audit_events (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id CHAR(36) NULL,
  reason TEXT NULL,
  metadata JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id), KEY privacy_audit_account_idx (account_id, created_at),
  CONSTRAINT privacy_audit_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT privacy_audit_actor_fk FOREIGN KEY (actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
