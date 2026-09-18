-- Fiscal provider bridge for certified invoicing integrations.

ALTER TABLE finance_invoice_requests
  ADD COLUMN IF NOT EXISTS fiscal_provider TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_document_id TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_document_type TEXT NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS fiscal_status TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (fiscal_status IN ('not_sent', 'queued', 'sent', 'issued', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS fiscal_error TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS fiscal_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiscal_issued_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS finance_invoice_requests_fiscal_queue_idx
  ON finance_invoice_requests(account_id, fiscal_provider, fiscal_status, requested_at DESC);

CREATE TABLE IF NOT EXISTS finance_fiscal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  invoice_request_id UUID REFERENCES finance_invoice_requests(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES finance_sales(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'invoice',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'sent', 'issued', 'failed', 'cancelled', 'credited')),
  external_document_id TEXT,
  document_number TEXT,
  document_url TEXT,
  document_path TEXT,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  issued_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_fiscal_documents_account_status_idx
  ON finance_fiscal_documents(account_id, provider, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS finance_fiscal_documents_provider_external_unique
  ON finance_fiscal_documents(provider, external_document_id)
  WHERE external_document_id IS NOT NULL;

ALTER TABLE finance_fiscal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_fiscal_documents_select ON finance_fiscal_documents;
CREATE POLICY finance_fiscal_documents_select
  ON finance_fiscal_documents FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS finance_fiscal_documents_manage ON finance_fiscal_documents;
CREATE POLICY finance_fiscal_documents_manage
  ON finance_fiscal_documents FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON finance_fiscal_documents;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON finance_fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
