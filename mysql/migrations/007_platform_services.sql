CREATE TABLE IF NOT EXISTS member_presence (
  user_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  status ENUM('online', 'away') NOT NULL DEFAULT 'online',
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  KEY member_presence_account_idx (account_id),
  CONSTRAINT member_presence_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT member_presence_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_keys (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  created_by CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(64) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  scopes JSON NOT NULL,
  last_used_at DATETIME(3) NULL,
  expires_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY api_keys_key_hash_unique (key_hash),
  KEY api_keys_account_id_idx (account_id),
  CONSTRAINT api_keys_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT api_keys_created_by_fk
    FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  type VARCHAR(100) NOT NULL DEFAULT 'system_alert',
  category ENUM(
    'inbox', 'sales', 'finance', 'clinic', 'clients', 'automation',
    'system', 'broadcast', 'work_time', 'support'
  ) NOT NULL DEFAULT 'system',
  priority ENUM('low', 'normal', 'high', 'critical') NOT NULL DEFAULT 'normal',
  conversation_id CHAR(36) NULL,
  contact_id CHAR(36) NULL,
  actor_user_id CHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  action_url TEXT NULL,
  metadata JSON NOT NULL,
  dedupe_key VARCHAR(255) NULL,
  read_at DATETIME(3) NULL,
  resolved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY notifications_user_dedupe_key_unique (user_id, dedupe_key),
  KEY notifications_user_created_idx (user_id, created_at),
  KEY notifications_account_category_created_idx
    (account_id, category, created_at),
  KEY notifications_account_priority_created_idx
    (account_id, priority, created_at),
  CONSTRAINT notifications_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT notifications_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT notifications_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT notifications_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT notifications_actor_user_id_fk
    FOREIGN KEY (actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  created_by CHAR(36) NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events JSON NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_delivery_at DATETIME(3) NULL,
  failure_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY webhook_endpoints_account_id_idx (account_id),
  CONSTRAINT webhook_endpoints_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT webhook_endpoints_created_by_fk
    FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  owner_type ENUM('crm_user', 'portal_contact') NOT NULL,
  user_id CHAR(36) NULL,
  contact_id CHAR(36) NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY push_subscriptions_endpoint_unique (endpoint(191)),
  KEY push_subscriptions_user_idx (user_id),
  KEY push_subscriptions_contact_idx (contact_id),
  CONSTRAINT push_subscriptions_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT push_subscriptions_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT push_subscriptions_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT push_subscriptions_owner_check CHECK (
    (owner_type = 'crm_user' AND user_id IS NOT NULL AND contact_id IS NULL)
    OR
    (owner_type = 'portal_contact' AND contact_id IS NOT NULL AND user_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
