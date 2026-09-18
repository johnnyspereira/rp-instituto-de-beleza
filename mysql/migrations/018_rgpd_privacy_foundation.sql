-- RGPD privacy foundation: purpose-specific consent evidence, data-subject
-- requests, retention configuration and breach/accountability records.

ALTER TABLE contacts
  ALTER COLUMN whatsapp_consent SET DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketing_whatsapp_consent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE clinic_anamnesis_forms
  ADD COLUMN IF NOT EXISTS consent_recorded_at DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS privacy_notice_version VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS consent_evidence JSON NULL;

CREATE TABLE IF NOT EXISTS privacy_settings (
  account_id CHAR(36) NOT NULL,
  controller_name VARCHAR(255) NULL,
  controller_email VARCHAR(320) NULL,
  controller_address TEXT NULL,
  dpo_email VARCHAR(320) NULL,
  privacy_policy_url TEXT NULL,
  privacy_notice_version VARCHAR(80) NOT NULL DEFAULT '1.0',
  contact_retention_months INT NOT NULL DEFAULT 60,
  health_retention_months INT NOT NULL DEFAULT 60,
  communication_retention_months INT NOT NULL DEFAULT 24,
  finance_retention_months INT NOT NULL DEFAULT 120,
  inactive_contact_retention_months INT NOT NULL DEFAULT 36,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id),
  CONSTRAINT privacy_settings_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT privacy_settings_retention_check CHECK (
    contact_retention_months BETWEEN 1 AND 240 AND
    health_retention_months BETWEEN 1 AND 240 AND
    communication_retention_months BETWEEN 1 AND 120 AND
    finance_retention_months BETWEEN 1 AND 240 AND
    inactive_contact_retention_months BETWEEN 1 AND 240
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS privacy_consent_events (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  purpose ENUM(
    'operational_email', 'operational_whatsapp', 'marketing_email',
    'marketing_whatsapp', 'health_anamnesis', 'privacy_notice',
    'referral_contact'
  ) NOT NULL,
  status ENUM('granted', 'withdrawn', 'not_required') NOT NULL,
  legal_basis ENUM(
    'consent', 'contract', 'legal_obligation', 'vital_interests',
    'public_task', 'legitimate_interests'
  ) NOT NULL,
  policy_version VARCHAR(80) NULL,
  source VARCHAR(80) NOT NULL,
  actor_user_id CHAR(36) NULL,
  evidence JSON NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY privacy_consent_contact_idx (account_id, contact_id, purpose, occurred_at),
  KEY privacy_consent_account_idx (account_id, occurred_at),
  CONSTRAINT privacy_consent_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT privacy_consent_contact_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT privacy_consent_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS privacy_data_subject_requests (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  request_type ENUM(
    'access', 'rectification', 'erasure', 'restriction', 'objection',
    'portability', 'withdraw_consent'
  ) NOT NULL,
  status ENUM('received', 'identity_check', 'in_progress', 'completed', 'rejected')
    NOT NULL DEFAULT 'received',
  requester_name VARCHAR(255) NULL,
  requester_email VARCHAR(320) NULL,
  details TEXT NULL,
  source VARCHAR(80) NOT NULL DEFAULT 'admin',
  identity_verified_at DATETIME(3) NULL,
  due_at DATETIME(3) NOT NULL,
  resolution_notes TEXT NULL,
  resolved_at DATETIME(3) NULL,
  created_by_user_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY privacy_dsr_status_idx (account_id, status, due_at),
  KEY privacy_dsr_contact_idx (account_id, contact_id, created_at),
  CONSTRAINT privacy_dsr_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT privacy_dsr_contact_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT privacy_dsr_creator_fk
    FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS privacy_incidents (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  status ENUM('open', 'assessing', 'contained', 'closed') NOT NULL DEFAULT 'open',
  detected_at DATETIME(3) NOT NULL,
  authority_notification_due_at DATETIME(3) NULL,
  authority_notified_at DATETIME(3) NULL,
  subjects_notified_at DATETIME(3) NULL,
  risk_assessment TEXT NULL,
  resolution_notes TEXT NULL,
  created_by_user_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY privacy_incident_status_idx (account_id, status, detected_at),
  CONSTRAINT privacy_incident_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT privacy_incident_creator_fk
    FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
