ALTER TABLE public_site_settings
  ADD COLUMN IF NOT EXISTS site_theme TEXT NOT NULL DEFAULT 'wellness';

ALTER TABLE public_site_settings
  DROP CONSTRAINT IF EXISTS public_site_settings_theme_check;
ALTER TABLE public_site_settings
  ADD CONSTRAINT public_site_settings_theme_check CHECK (site_theme IN (
    'wellness', 'clinic', 'luxury', 'corporate', 'vibrant', 'minimal'
  ));

NOTIFY pgrst, 'reload schema';
