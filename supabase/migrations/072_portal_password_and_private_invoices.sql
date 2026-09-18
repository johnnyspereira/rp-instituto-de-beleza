-- Portal password onboarding through WhatsApp and private fiscal PDFs.

ALTER TABLE client_portal_access
  ADD COLUMN IF NOT EXISTS requires_password_change BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS password_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

ALTER TABLE finance_invoice_requests
  ADD COLUMN IF NOT EXISTS invoice_document_path TEXT,
  ADD COLUMN IF NOT EXISTS invoice_file_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_file_size BIGINT,
  ADD COLUMN IF NOT EXISTS invoice_uploaded_at TIMESTAMPTZ;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finance-invoices',
  'finance-invoices',
  FALSE,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Files are written and signed only by server-side service-role routes. There
-- is deliberately no public or authenticated storage.objects policy.

CREATE INDEX IF NOT EXISTS client_portal_access_password_idx
  ON client_portal_access(account_id, requires_password_change)
  WHERE requires_password_change = TRUE;

NOTIFY pgrst, 'reload schema';
