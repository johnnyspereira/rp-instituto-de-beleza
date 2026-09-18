-- Binary attachments received through the local WhatsApp QR bridge.
-- The bridge sends the bytes to the authenticated CRM endpoint, which keeps
-- them here rather than relying on a temporary WhatsApp Web download URL.
CREATE TABLE IF NOT EXISTS whatsapp_bridge_media (
  message_id VARCHAR(255) NOT NULL,
  account_id CHAR(36) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  filename VARCHAR(512) NULL,
  data LONGBLOB NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  PRIMARY KEY (message_id),
  KEY whatsapp_bridge_media_account_created_idx (account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
