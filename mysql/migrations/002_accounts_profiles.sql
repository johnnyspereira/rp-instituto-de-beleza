CREATE TABLE IF NOT EXISTS accounts (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  owner_user_id CHAR(36) NOT NULL,
  default_currency CHAR(3) NOT NULL DEFAULT 'EUR',
  crm_locale ENUM('pt', 'en') NOT NULL DEFAULT 'pt',
  timezone VARCHAR(100) NOT NULL DEFAULT 'Europe/Lisbon',
  public_url TEXT NULL,
  navigation_layout ENUM('sidebar', 'topbar') NOT NULL DEFAULT 'sidebar',
  logo_url TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY accounts_owner_user_id_unique (owner_user_id),
  CONSTRAINT accounts_owner_user_id_fk
    FOREIGN KEY (owner_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT accounts_default_currency_check
    CHECK (default_currency REGEXP '^[A-Z]{3}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(320) NOT NULL,
  avatar_url TEXT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  beta_features JSON NOT NULL,
  account_role ENUM('owner', 'admin', 'agent', 'viewer') NOT NULL,
  is_professional BOOLEAN NOT NULL DEFAULT FALSE,
  professional_title VARCHAR(255) NULL,
  professional_color VARCHAR(20) NOT NULL DEFAULT '#7c3aed',
  professional_bio TEXT NULL,
  professional_phone VARCHAR(50) NULL,
  professional_public_slug VARCHAR(255) NULL,
  professional_show_online BOOLEAN NOT NULL DEFAULT TRUE,
  commission_executant_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  commission_responsible_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  working_hours JSON NOT NULL,
  online_booking_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY profiles_user_id_unique (user_id),
  UNIQUE KEY profiles_account_professional_slug_unique
    (account_id, professional_public_slug),
  KEY profiles_account_role_idx (account_id, account_role),
  CONSTRAINT profiles_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_invitations (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  role ENUM('admin', 'agent', 'viewer') NOT NULL,
  created_by_user_id CHAR(36) NULL,
  label VARCHAR(255) NULL,
  expires_at DATETIME(3) NOT NULL,
  accepted_at DATETIME(3) NULL,
  accepted_by_user_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY account_invitations_token_hash_unique (token_hash),
  KEY account_invitations_account_pending_idx
    (account_id, accepted_at, expires_at),
  CONSTRAINT account_invitations_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT account_invitations_created_by_fk
    FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT account_invitations_accepted_by_fk
    FOREIGN KEY (accepted_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

