ALTER TABLE public_site_settings
  ADD COLUMN google_reviews_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN google_place_id VARCHAR(255) NULL,
  ADD COLUMN google_review_url TEXT NULL;
