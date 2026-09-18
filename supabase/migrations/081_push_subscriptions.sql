-- Device subscriptions are written only by authenticated server routes using
-- the service role. No browser receives direct table access.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('crm_user','portal_contact')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_subscription_owner_check CHECK (
    (owner_type='crm_user' AND user_id IS NOT NULL AND contact_id IS NULL) OR
    (owner_type='portal_contact' AND contact_id IS NOT NULL AND user_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_subscriptions_contact_idx ON push_subscriptions(contact_id) WHERE contact_id IS NOT NULL;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
