CREATE TABLE IF NOT EXISTS contact_phone_identities (
  account_id CHAR(36) NOT NULL,
  phone_key VARCHAR(32) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id, phone_key),
  KEY contact_phone_identities_contact_idx (contact_id),
  CONSTRAINT contact_phone_identities_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT contact_phone_identities_contact_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO contact_phone_identities(account_id, phone_key, contact_id, source)
SELECT account_id,
       REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''),
       id,
       'backfill'
FROM contacts
WHERE phone IS NOT NULL AND phone <> '';

ALTER TABLE messages
  ADD COLUMN dedupe_key CHAR(64) NULL AFTER message_id;

UPDATE messages current_message
LEFT JOIN messages earlier_message
  ON earlier_message.conversation_id = current_message.conversation_id
 AND earlier_message.message_id = current_message.message_id
 AND (
   earlier_message.created_at < current_message.created_at
   OR (earlier_message.created_at = current_message.created_at AND earlier_message.id < current_message.id)
 )
SET current_message.dedupe_key = CASE
  WHEN earlier_message.id IS NULL AND current_message.message_id IS NOT NULL
    THEN SHA2(CONCAT(current_message.conversation_id, ':', current_message.message_id), 256)
  ELSE NULL
END;

ALTER TABLE messages
  ADD UNIQUE KEY messages_dedupe_key_unique (dedupe_key);
