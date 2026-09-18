-- 037_account_general_settings.sql
-- Account-level CRM preferences used by Settings -> General.
-- Existing accounts_update RLS already restricts writes to admin+.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS crm_locale TEXT NOT NULL DEFAULT 'pt',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  ADD COLUMN IF NOT EXISTS public_url TEXT,
  ADD COLUMN IF NOT EXISTS navigation_layout TEXT NOT NULL DEFAULT 'sidebar';

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_crm_locale_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_crm_locale_check
  CHECK (crm_locale IN ('pt', 'en'));

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_navigation_layout_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_navigation_layout_check
  CHECK (navigation_layout IN ('sidebar', 'topbar'));

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_public_url_length;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_public_url_length
  CHECK (public_url IS NULL OR char_length(public_url) <= 2048);
