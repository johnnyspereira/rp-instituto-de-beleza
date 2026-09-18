CREATE TABLE IF NOT EXISTS external_calendar_feeds (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  professional_profile_id CHAR(36) NULL,
  name VARCHAR(120) NOT NULL,
  url_encrypted TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at DATETIME(3) NULL,
  last_sync_error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY external_calendar_feeds_account_idx (account_id, enabled),
  CONSTRAINT external_calendar_feeds_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT external_calendar_feeds_user_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT external_calendar_feeds_professional_fk
    FOREIGN KEY (professional_profile_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE clinic_time_blocks
  ADD COLUMN external_calendar_feed_id CHAR(36) NULL AFTER is_online_block;

ALTER TABLE clinic_time_blocks
  ADD COLUMN external_uid VARCHAR(255) NULL AFTER external_calendar_feed_id;

ALTER TABLE clinic_time_blocks
  ADD UNIQUE KEY clinic_time_blocks_external_event_unique
    (external_calendar_feed_id, external_uid);

ALTER TABLE clinic_time_blocks
  ADD CONSTRAINT clinic_time_blocks_external_feed_fk
    FOREIGN KEY (external_calendar_feed_id)
    REFERENCES external_calendar_feeds(id) ON DELETE CASCADE;
