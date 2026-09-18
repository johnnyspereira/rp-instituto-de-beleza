-- Purchasable Portal 360 campaigns. Existing campaigns remain informational.
ALTER TABLE portal_campaigns
  ADD COLUMN commerce_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER capacity,
  ADD COLUMN commerce_price DECIMAL(12,2) NULL AFTER commerce_enabled,
  ADD COLUMN commerce_currency VARCHAR(3) NOT NULL DEFAULT 'EUR' AFTER commerce_price,
  ADD COLUMN commerce_item_type VARCHAR(24) NULL AFTER commerce_currency,
  ADD COLUMN commerce_source_id CHAR(36) NULL AFTER commerce_item_type;

ALTER TABLE portal_campaign_enrollments
  ADD COLUMN sale_id CHAR(36) NULL AFTER contact_id,
  ADD KEY portal_campaign_enrollments_sale_idx (sale_id);
