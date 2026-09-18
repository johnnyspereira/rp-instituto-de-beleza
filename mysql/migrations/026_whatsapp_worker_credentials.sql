CREATE TABLE IF NOT EXISTS whatsapp_worker_credentials (
  account_id CHAR(36) NOT NULL,
  secret_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id),
  CONSTRAINT whatsapp_worker_credentials_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO whatsapp_worker_credentials(account_id, secret_hash)
VALUES(
  '999933bb-5873-4612-abaf-40db59ca6ffc',
  'fe1849aa9e65f67ed7f0379a655c539e47a577542ba3c4505140b0ed2c10ecdb'
)
ON DUPLICATE KEY UPDATE secret_hash = VALUES(secret_hash);
