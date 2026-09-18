ALTER TABLE google_business_profile_reviews
  ADD COLUMN approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN approved_at DATETIME(3) NULL,
  ADD COLUMN approved_by_user_id CHAR(36) NULL;
