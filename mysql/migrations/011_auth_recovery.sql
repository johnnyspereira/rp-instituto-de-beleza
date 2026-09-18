ALTER TABLE app_users ADD COLUMN user_metadata JSON NULL AFTER password_hash;

CREATE TABLE app_one_time_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  purpose VARCHAR(32) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX app_one_time_tokens_expiry(expires_at),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
