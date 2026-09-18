-- One reminder per benefit expiry. The cron claims this row before delivery,
-- so repeated executions can never send the same expiry alert twice.
CREATE TABLE IF NOT EXISTS finance_expiry_reminders (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  benefit_type VARCHAR(16) NOT NULL,
  benefit_id CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY finance_expiry_reminders_unique (account_id, benefit_type, benefit_id, expires_at),
  KEY finance_expiry_reminders_contact_idx (contact_id, sent_at),
  CONSTRAINT finance_expiry_reminders_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT finance_expiry_reminders_contact_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE clinic_communication_settings
  ADD COLUMN benefit_expiry_reminder_days INT NOT NULL DEFAULT 7,
  ADD COLUMN auto_send_benefit_expiry_reminder BOOLEAN NOT NULL DEFAULT TRUE;
