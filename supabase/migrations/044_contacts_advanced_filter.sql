-- Advanced contacts filter for the CRM contacts page.
-- Combines search, tags, data-quality segments, Inbox activity, and open deals
-- in one paginated query so the UI does not have to filter partial pages.

CREATE OR REPLACE FUNCTION public.filter_contacts_advanced(
  p_tag_ids UUID[] DEFAULT '{}'::UUID[],
  p_search TEXT DEFAULT NULL,
  p_segment TEXT DEFAULT 'all',
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT c.*
    FROM contacts c
    WHERE (
      NULLIF(BTRIM(COALESCE(p_search, '')), '') IS NULL
      OR c.name ILIKE '%' || BTRIM(p_search) || '%'
      OR c.phone ILIKE '%' || BTRIM(p_search) || '%'
      OR c.email ILIKE '%' || BTRIM(p_search) || '%'
      OR c.company ILIKE '%' || BTRIM(p_search) || '%'
    )
    AND (
      COALESCE(array_length(p_tag_ids, 1), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM contact_tags ct
        WHERE ct.contact_id = c.id
          AND ct.tag_id = ANY(p_tag_ids)
      )
    )
    AND (
      COALESCE(p_segment, 'all') = 'all'
      OR (
        p_segment = 'needs_info'
        AND (
          NULLIF(BTRIM(COALESCE(c.name, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(c.email, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(c.company, '')), '') IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM contact_tags ct
            WHERE ct.contact_id = c.id
          )
        )
      )
      OR (
        p_segment = 'complete'
        AND NULLIF(BTRIM(COALESCE(c.name, '')), '') IS NOT NULL
        AND NULLIF(BTRIM(COALESCE(c.phone, '')), '') IS NOT NULL
        AND NULLIF(BTRIM(COALESCE(c.email, '')), '') IS NOT NULL
        AND NULLIF(BTRIM(COALESCE(c.company, '')), '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM contact_tags ct
          WHERE ct.contact_id = c.id
        )
      )
      OR (
        p_segment = 'untagged'
        AND NOT EXISTS (
          SELECT 1
          FROM contact_tags ct
          WHERE ct.contact_id = c.id
        )
      )
      OR (
        p_segment = 'new_today'
        AND c.created_at >= date_trunc('day', NOW())
      )
      OR (
        p_segment = 'with_conversations'
        AND EXISTS (
          SELECT 1
          FROM conversations cv
          WHERE cv.contact_id = c.id
        )
      )
      OR (
        p_segment = 'with_deals'
        AND EXISTS (
          SELECT 1
          FROM deals d
          WHERE d.contact_id = c.id
            AND COALESCE(d.status, 'open') = 'open'
        )
      )
    )
  )
  SELECT filtered AS contact, COUNT(*) OVER() AS total_count
  FROM filtered
  ORDER BY filtered.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 25), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

ALTER FUNCTION public.filter_contacts_advanced(UUID[], TEXT, TEXT, INT, INT)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.filter_contacts_advanced(UUID[], TEXT, TEXT, INT, INT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_contacts_advanced(UUID[], TEXT, TEXT, INT, INT)
  TO authenticated;
