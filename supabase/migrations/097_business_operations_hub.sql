-- Business operations hub: fiscal providers, payment providers and stock controls.
-- This introduces the product-facing structure for Zappy-like management gaps
-- without requiring external provider credentials on day one.

CREATE TABLE IF NOT EXISTS business_integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('fiscal', 'payments', 'ads', 'email', 'booking_ai')),
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'configured', 'active', 'paused', 'error')),
  display_name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_error TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, category, provider)
);

CREATE INDEX IF NOT EXISTS idx_business_integration_settings_account
  ON business_integration_settings(account_id, category, status);

ALTER TABLE business_integration_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_integration_settings_select ON business_integration_settings;
CREATE POLICY business_integration_settings_select
  ON business_integration_settings FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS business_integration_settings_manage ON business_integration_settings;
CREATE POLICY business_integration_settings_manage
  ON business_integration_settings FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON business_integration_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON business_integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS finance_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES finance_sales(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'paid', 'expired', 'cancelled', 'failed')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT,
  external_reference TEXT,
  payment_url TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_payment_links_account_status
  ON finance_payment_links(account_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_payment_links_sale
  ON finance_payment_links(sale_id);

ALTER TABLE finance_payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_payment_links_select ON finance_payment_links;
CREATE POLICY finance_payment_links_select
  ON finance_payment_links FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS finance_payment_links_manage ON finance_payment_links;
CREATE POLICY finance_payment_links_manage
  ON finance_payment_links FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON finance_payment_links;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON finance_payment_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE clinic_products
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS supplier_reference TEXT,
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0);

CREATE OR REPLACE VIEW business_operations_stock_alerts AS
SELECT
  p.account_id,
  p.id AS product_id,
  p.name,
  p.sku,
  p.stock_quantity,
  p.low_stock_threshold,
  p.price,
  p.cost_price,
  p.currency,
  p.supplier_name,
  p.updated_at,
  CASE
    WHEN p.stock_quantity <= 0 THEN 'out_of_stock'
    WHEN p.stock_quantity <= p.low_stock_threshold THEN 'low_stock'
    ELSE 'ok'
  END AS stock_status
FROM clinic_products p
WHERE p.is_active = TRUE;

NOTIFY pgrst, 'reload schema';
