CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  message_id CHAR(36) NOT NULL,
  request_key VARCHAR(100) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  payload JSON NOT NULL,
  status ENUM('pending', 'processing', 'sent', 'failed', 'dead') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  lease_until DATETIME(3) NULL,
  worker_id VARCHAR(100) NULL,
  provider_message_id VARCHAR(255) NULL,
  last_error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY whatsapp_outbox_account_request_unique (account_id, request_key),
  UNIQUE KEY whatsapp_outbox_message_unique (message_id),
  KEY whatsapp_outbox_claim_idx (status, available_at, lease_until),
  KEY whatsapp_outbox_account_created_idx (account_id, created_at),
  CONSTRAINT whatsapp_outbox_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_outbox_conversation_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_outbox_user_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_outbox_message_fk
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_worker_health (
  account_id CHAR(36) NOT NULL,
  worker_id VARCHAR(100) NOT NULL,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  state VARCHAR(32) NOT NULL DEFAULT 'offline',
  qr MEDIUMTEXT NULL,
  user_jid VARCHAR(255) NULL,
  has_saved_auth BOOLEAN NOT NULL DEFAULT FALSE,
  connected_at DATETIME(3) NULL,
  last_activity_at DATETIME(3) NULL,
  last_error TEXT NULL,
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id),
  KEY whatsapp_worker_health_seen_idx (last_seen_at),
  CONSTRAINT whatsapp_worker_health_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_worker_commands (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  command_type ENUM('restart', 'logout', 'sync') NOT NULL,
  payload JSON NULL,
  status ENUM('pending', 'processing', 'done', 'failed') NOT NULL DEFAULT 'pending',
  worker_id VARCHAR(100) NULL,
  last_error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY whatsapp_worker_commands_claim_idx (account_id, status, created_at),
  CONSTRAINT whatsapp_worker_commands_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
