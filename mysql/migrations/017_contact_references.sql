UPDATE contacts AS contact
JOIN (
  SELECT
    missing.id,
    CAST(
      maximums.maximum_reference
      + ROW_NUMBER() OVER (
          PARTITION BY missing.account_id
          ORDER BY missing.created_at, missing.id
        )
      AS CHAR
    ) AS generated_reference
  FROM contacts AS missing
  JOIN (
    SELECT
      account_id,
      COALESCE(
        MAX(
          CASE
            WHEN client_reference REGEXP '^[0-9]+$'
              THEN CAST(client_reference AS UNSIGNED)
            ELSE 0
          END
        ),
        0
      ) AS maximum_reference
    FROM contacts
    GROUP BY account_id
  ) AS maximums ON maximums.account_id = missing.account_id
  WHERE missing.client_reference IS NULL
     OR TRIM(missing.client_reference) = ''
) AS generated ON generated.id = contact.id
SET contact.client_reference = generated.generated_reference;
