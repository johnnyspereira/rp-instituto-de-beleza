CREATE TABLE IF NOT EXISTS campaign_email_deliveries (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  campaign_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  status ENUM('sent','failed') NOT NULL,
  error_message TEXT NULL,
  sent_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY campaign_email_delivery_once (campaign_id, contact_id),
  KEY campaign_email_deliveries_account_idx (account_id, created_at),
  CONSTRAINT campaign_email_deliveries_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT campaign_email_deliveries_campaign_fk FOREIGN KEY (campaign_id) REFERENCES portal_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT campaign_email_deliveries_contact_fk FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
