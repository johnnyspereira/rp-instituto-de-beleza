-- Social publishing planner for Instagram + WhatsApp marketing preparation.
-- Instagram can be published through Meta's official Content Publishing API
-- once credentials are configured. WhatsApp Status publishing is not available
-- in the official Cloud API, so WhatsApp entries are stored as prepared
-- campaign/status tasks rather than unsafe automation.

CREATE TYPE social_post_platform AS ENUM ('instagram', 'whatsapp');
CREATE TYPE social_post_type AS ENUM (
  'instagram_feed',
  'instagram_reel',
  'instagram_story',
  'whatsapp_campaign',
  'whatsapp_status_reminder'
);
CREATE TYPE social_post_status AS ENUM (
  'draft',
  'scheduled',
  'ready',
  'publishing',
  'published',
  'failed',
  'cancelled'
);

CREATE TABLE social_scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  platform social_post_platform NOT NULL,
  post_type social_post_type NOT NULL,
  status social_post_status NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  cover_url TEXT,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  target_segment_id UUID REFERENCES contact_segments(id) ON DELETE SET NULL,
  provider_post_id TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (platform = 'instagram' AND post_type IN ('instagram_feed', 'instagram_reel', 'instagram_story'))
    OR
    (platform = 'whatsapp' AND post_type IN ('whatsapp_campaign', 'whatsapp_status_reminder'))
  ),
  CHECK (
    status = 'draft'
    OR scheduled_at IS NOT NULL
    OR status IN ('published', 'failed', 'cancelled')
  )
);

CREATE INDEX social_scheduled_posts_account_status_idx
  ON social_scheduled_posts(account_id, status, scheduled_at);

CREATE INDEX social_scheduled_posts_account_platform_idx
  ON social_scheduled_posts(account_id, platform, scheduled_at);

CREATE TRIGGER social_scheduled_posts_updated_at
  BEFORE UPDATE ON social_scheduled_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE social_scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY social_scheduled_posts_select
  ON social_scheduled_posts
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY social_scheduled_posts_insert
  ON social_scheduled_posts
  FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

CREATE POLICY social_scheduled_posts_update
  ON social_scheduled_posts
  FOR UPDATE
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

CREATE POLICY social_scheduled_posts_delete
  ON social_scheduled_posts
  FOR DELETE
  USING (is_account_member(account_id, 'admin'));
