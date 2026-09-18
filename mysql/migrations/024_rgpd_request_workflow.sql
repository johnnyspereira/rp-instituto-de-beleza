ALTER TABLE privacy_data_subject_requests
  ADD COLUMN IF NOT EXISTS identity_verification_method VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS identity_verification_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS action_summary TEXT NULL,
  ADD COLUMN IF NOT EXISTS erasure_retention_justification TEXT NULL;
