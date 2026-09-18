-- Private owner commands sent from WhatsApp Inbox.
-- A command is accepted only from the configured owner phone and a second
-- confirmation is required before the agenda is changed.

CREATE TABLE IF NOT EXISTS ai_owner_command_settings (
  account_id CHAR(36) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  authorized_phone VARCHAR(32) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Lisbon',
  updated_by_user_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id),
  CONSTRAINT ai_owner_command_settings_account_fk FOREIGN KEY (account_id)
    REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT ai_owner_command_settings_user_fk FOREIGN KEY (updated_by_user_id)
    REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_owner_command_requests (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  command_type ENUM('block_time', 'unblock_time') NOT NULL,
  payload JSON NOT NULL,
  confirmation_code CHAR(6) NOT NULL,
  status ENUM('pending', 'confirmed', 'expired', 'failed') NOT NULL DEFAULT 'pending',
  expires_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  executed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ai_owner_command_requests_lookup_idx (account_id, contact_id, status, expires_at),
  CONSTRAINT ai_owner_command_requests_account_fk FOREIGN KEY (account_id)
    REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT ai_owner_command_requests_contact_fk FOREIGN KEY (contact_id)
    REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT ai_owner_command_requests_conversation_fk FOREIGN KEY (conversation_id)
    REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
