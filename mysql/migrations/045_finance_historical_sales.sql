-- Historical sales were paid outside the CRM. They must be retained for
-- audit, but must never be included in operational cash or receivable totals.
ALTER TABLE finance_sales
  ADD COLUMN is_historical TINYINT(1) NOT NULL DEFAULT 0 AFTER balance_due,
  ADD KEY finance_sales_account_historical_created_idx (account_id, is_historical, created_at);

-- Backfill the marker used by the POS before the dedicated column existed.
UPDATE finance_sales
SET is_historical = 1
WHERE is_historical = 0
  AND notes LIKE '%Pagamento efetuado anteriormente noutra plataforma.%';
