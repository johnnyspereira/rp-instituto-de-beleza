ALTER TABLE privacy_settings
  ADD COLUMN IF NOT EXISTS controller_tax_id VARCHAR(40) NULL;

-- Configure the RP data controller in the CRM after installing the account.
-- No identity or tax details from the source business are seeded here.
