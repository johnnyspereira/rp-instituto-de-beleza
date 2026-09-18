ALTER TABLE public_site_settings
  MODIFY COLUMN site_theme ENUM('spa', 'wellness', 'clinic', 'luxury', 'corporate', 'vibrant', 'minimal')
  NOT NULL DEFAULT 'wellness';
