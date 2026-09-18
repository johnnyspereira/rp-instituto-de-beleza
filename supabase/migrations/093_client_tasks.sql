-- Client-linked tasks and reminders for follow-up work.

CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT,
  due_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_account_status_due
  ON crm_tasks(account_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact
  ON crm_tasks(contact_id, status, due_at);

ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view CRM tasks" ON crm_tasks;
CREATE POLICY "Members can view CRM tasks"
  ON crm_tasks FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS "Agents can create CRM tasks" ON crm_tasks;
CREATE POLICY "Agents can create CRM tasks"
  ON crm_tasks FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent') AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Agents can update CRM tasks" ON crm_tasks;
CREATE POLICY "Agents can update CRM tasks"
  ON crm_tasks FOR UPDATE
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Admins can delete CRM tasks" ON crm_tasks;
CREATE POLICY "Admins can delete CRM tasks"
  ON crm_tasks FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON crm_tasks;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON crm_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm_tasks;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
