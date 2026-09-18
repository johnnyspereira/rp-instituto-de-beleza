CREATE TABLE IF NOT EXISTS google_business_profile_connections (
  account_id CHAR(36) NOT NULL PRIMARY KEY,
  google_account_name VARCHAR(255) NULL,
  refresh_token_encrypted TEXT NOT NULL,
  connected_by_user_id CHAR(36) NOT NULL,
  connected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT google_business_profile_connections_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT google_business_profile_connections_user_fk FOREIGN KEY (connected_by_user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
