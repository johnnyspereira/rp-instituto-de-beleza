UPDATE contacts c
SET c.privacy_review_status = 'legacy_unverified',
    c.consent_reviewed_at = NULL,
    c.consent_review_source = NULL
WHERE c.anonymized_at IS NULL
  AND c.privacy_review_status = 'current'
  AND (
    c.marketing_consent = TRUE OR
    c.marketing_whatsapp_consent = TRUE OR
    c.whatsapp_consent = TRUE
  )
  AND NOT EXISTS (
    SELECT 1
    FROM privacy_consent_events p
    WHERE p.account_id = c.account_id
      AND p.contact_id = c.id
      AND p.source = 'client_portal'
      AND p.evidence IS NOT NULL
  );
