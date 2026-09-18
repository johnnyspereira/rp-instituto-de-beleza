CREATE TABLE IF NOT EXISTS google_business_profile_reviews (
  id CHAR(36) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  google_review_id VARCHAR(255) NOT NULL,
  reviewer_name VARCHAR(255) NULL,
  rating TINYINT NOT NULL,
  comment TEXT NULL,
  reviewed_at DATETIME(3) NULL,
  synced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY google_business_review_unique (account_id, google_review_id),
  KEY google_business_review_public (account_id, reviewed_at),
  CONSTRAINT google_business_profile_reviews_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
