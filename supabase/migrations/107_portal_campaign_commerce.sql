-- A campaign can remain informational or become a purchasable portal offer.
ALTER TABLE portal_campaigns
  ADD COLUMN IF NOT EXISTS commerce_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS commerce_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS commerce_currency TEXT NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS commerce_item_type TEXT,
  ADD COLUMN IF NOT EXISTS commerce_source_id UUID;

ALTER TABLE portal_campaign_enrollments
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES finance_sales(id) ON DELETE SET NULL;

ALTER TABLE portal_campaigns
  ADD CONSTRAINT portal_campaigns_commerce_check CHECK (
    (commerce_enabled = FALSE AND commerce_price IS NULL AND commerce_item_type IS NULL)
    OR
    (commerce_enabled = TRUE AND commerce_price IS NOT NULL AND commerce_price > 0 AND commerce_item_type IN ('service','pack','voucher'))
  );
