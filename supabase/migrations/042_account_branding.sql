-- Account branding used by Settings -> General.
-- Existing accounts_update RLS already restricts account writes to admin+.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_logo_url_length;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_logo_url_length
  CHECK (logo_url IS NULL OR char_length(logo_url) <= 2048);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'account-branding',
  'account-branding',
  TRUE,
  2097152,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Account branding is publicly readable" ON storage.objects;
CREATE POLICY "Account branding is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'account-branding');

DROP POLICY IF EXISTS "Admins can upload account branding" ON storage.objects;
CREATE POLICY "Admins can upload account branding"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'account-branding'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_role IN ('owner', 'admin')
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Admins can update account branding" ON storage.objects;
CREATE POLICY "Admins can update account branding"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'account-branding'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_role IN ('owner', 'admin')
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Admins can delete account branding" ON storage.objects;
CREATE POLICY "Admins can delete account branding"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'account-branding'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_role IN ('owner', 'admin')
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
