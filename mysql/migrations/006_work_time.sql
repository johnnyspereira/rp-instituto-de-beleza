CREATE TABLE IF NOT EXISTS work_sessions (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  work_date DATE NOT NULL,
  status ENUM('open', 'closed', 'absent') NOT NULL DEFAULT 'open',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_active_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at DATETIME(3) NULL,
  closed_at DATETIME(3) NULL,
  absence_reason TEXT NULL,
  absence_recorded_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY work_sessions_account_user_date_unique
    (account_id, user_id, work_date),
  KEY work_sessions_account_date_idx (account_id, work_date),
  KEY work_sessions_user_date_idx (user_id, work_date),
  CONSTRAINT work_sessions_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT work_sessions_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS work_breaks (
  id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  reason ENUM('forced_inactivity', 'manual', 'system_lock')
    NOT NULL DEFAULT 'forced_inactivity',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at DATETIME(3) NULL,
  justification TEXT NULL,
  justified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY work_breaks_session_started_idx (session_id, started_at),
  KEY work_breaks_user_started_idx (user_id, started_at),
  CONSTRAINT work_breaks_session_id_fk
    FOREIGN KEY (session_id) REFERENCES work_sessions(id) ON DELETE CASCADE,
  CONSTRAINT work_breaks_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT work_breaks_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

