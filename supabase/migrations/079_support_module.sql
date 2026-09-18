CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL, created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  number BIGINT GENERATED ALWAYS AS IDENTITY, subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 160),
  category TEXT NOT NULL DEFAULT 'general', priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_customer','resolved','closed')),
  source TEXT NOT NULL DEFAULT 'backoffice' CHECK (source IN ('backoffice','portal')), assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, author_type TEXT NOT NULL CHECK (author_type IN ('staff','client')),
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_account_idx ON support_tickets(account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_ticket_messages(ticket_id, created_at);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_tickets_staff_read ON support_tickets FOR SELECT USING (is_account_member(account_id));
CREATE POLICY support_tickets_staff_insert ON support_tickets FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY support_tickets_staff_update ON support_tickets FOR UPDATE USING (is_account_member(account_id, 'agent')) WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY support_messages_staff_read ON support_ticket_messages FOR SELECT USING (is_account_member(account_id));
CREATE POLICY support_messages_staff_insert ON support_ticket_messages FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') AND author_type = 'staff');
ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE support_ticket_messages;
NOTIFY pgrst, 'reload schema';
