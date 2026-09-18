-- Public voucher transfer requests. A request never changes ownership
-- automatically: staff must contact the recipient and approve it manually.

CREATE TABLE IF NOT EXISTS finance_voucher_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  voucher_id UUID NOT NULL REFERENCES finance_vouchers(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL CHECK (char_length(recipient_name) BETWEEN 2 AND 160),
  recipient_phone TEXT NOT NULL CHECK (char_length(recipient_phone) BETWEEN 7 AND 30),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'contacted', 'approved', 'rejected', 'cancelled')
  ),
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_voucher_transfer_requests_account_status
  ON finance_voucher_transfer_requests(account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_voucher_transfer_requests_voucher
  ON finance_voucher_transfer_requests(voucher_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS finance_voucher_transfer_one_pending
  ON finance_voucher_transfer_requests(voucher_id)
  WHERE status = 'pending';

ALTER TABLE finance_voucher_transfer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_voucher_transfer_staff_select
  ON finance_voucher_transfer_requests;
DROP POLICY IF EXISTS finance_voucher_transfer_staff_update
  ON finance_voucher_transfer_requests;

CREATE POLICY finance_voucher_transfer_staff_select
  ON finance_voucher_transfer_requests
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY finance_voucher_transfer_staff_update
  ON finance_voucher_transfer_requests
  FOR UPDATE USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

GRANT SELECT, UPDATE ON finance_voucher_transfer_requests TO authenticated;

NOTIFY pgrst, 'reload schema';
