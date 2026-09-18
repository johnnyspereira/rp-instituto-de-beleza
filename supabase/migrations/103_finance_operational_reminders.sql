-- Finance command centre: configurable payable and cash-register reminders.

CREATE TABLE IF NOT EXISTS finance_reminder_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  payables_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  payable_days_before INTEGER[] NOT NULL DEFAULT ARRAY[7,3,1],
  overdue_daily BOOLEAN NOT NULL DEFAULT TRUE,
  cash_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timezone TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  cash_open_time TIME NOT NULL DEFAULT '09:00',
  cash_close_time TIME NOT NULL DEFAULT '22:00',
  close_repeat_minutes INTEGER NOT NULL DEFAULT 30 CHECK (close_repeat_minutes BETWEEN 5 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(payable_days_before) BETWEEN 1 AND 10),
  CHECK (payable_days_before <@ ARRAY[0,1,2,3,4,5,6,7,10,14,15,21,30,45,60,90])
);

INSERT INTO finance_reminder_settings(account_id)
SELECT id FROM accounts ON CONFLICT (account_id) DO NOTHING;

ALTER TABLE finance_reminder_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_reminder_settings_owner_select ON finance_reminder_settings;
DROP POLICY IF EXISTS finance_reminder_settings_owner_insert ON finance_reminder_settings;
DROP POLICY IF EXISTS finance_reminder_settings_owner_update ON finance_reminder_settings;
CREATE POLICY finance_reminder_settings_owner_select ON finance_reminder_settings FOR SELECT
  USING (is_account_member(account_id, 'owner'));
CREATE POLICY finance_reminder_settings_owner_insert ON finance_reminder_settings FOR INSERT
  WITH CHECK (is_account_member(account_id, 'owner'));
CREATE POLICY finance_reminder_settings_owner_update ON finance_reminder_settings FOR UPDATE
  USING (is_account_member(account_id, 'owner')) WITH CHECK (is_account_member(account_id, 'owner'));
GRANT SELECT, INSERT, UPDATE ON finance_reminder_settings TO authenticated;

DROP TRIGGER IF EXISTS finance_reminder_settings_touch ON finance_reminder_settings;
CREATE TRIGGER finance_reminder_settings_touch BEFORE UPDATE ON finance_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION touch_owner_treasury_updated_at();

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'conversation_assigned','new_message_received','conversation_waiting','deal_created',
  'deal_stage_changed','deal_won','deal_lost','follow_up_due','task_due','automation_failed',
  'flow_handoff','flow_failed','whatsapp_connected','whatsapp_disconnected',
  'broadcast_completed','broadcast_failed','work_time_missing','work_time_pause_pending',
  'referral_registered','referral_qualified','referral_reward_issued','invoice_requested',
  'anamnesis_submitted','anamnesis_reviewed','appointment_created','appointment_rescheduled',
  'appointment_cancelled','client_created','payment_received','support_ticket_created',
  'support_new_message',
  'payable_due','payable_overdue','cash_open_due','cash_close_due','system_alert'
));
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (category IN (
  'inbox','sales','finance','clinic','clients','automation','system','broadcast',
  'work_time','support'
));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_key_idx
  ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION process_finance_operational_reminders(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS SETOF notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
  p RECORD;
  owner_row RECORD;
  local_now TIMESTAMP;
  local_day DATE;
  days_left INTEGER;
  slot INTEGER;
  open_business_day DATE;
  close_deadline TIMESTAMP;
  n notifications;
BEGIN
  FOR s IN
    SELECT a.id AS account_id, COALESCE(rs.payables_enabled, TRUE) payables_enabled,
      COALESCE(rs.payable_days_before, ARRAY[7,3,1]) payable_days_before,
      COALESCE(rs.overdue_daily, TRUE) overdue_daily, COALESCE(rs.cash_enabled, TRUE) cash_enabled,
      COALESCE(rs.timezone, 'Europe/Lisbon') timezone,
      COALESCE(rs.cash_open_time, '09:00') cash_open_time,
      COALESCE(rs.cash_close_time, '22:00') cash_close_time,
      COALESCE(rs.close_repeat_minutes, 30) close_repeat_minutes
    FROM accounts a LEFT JOIN finance_reminder_settings rs ON rs.account_id = a.id
  LOOP
    BEGIN local_now := p_now AT TIME ZONE s.timezone;
    EXCEPTION WHEN invalid_parameter_value THEN
      s.timezone := 'UTC';
      local_now := p_now AT TIME ZONE 'UTC';
    END;
    local_day := local_now::DATE;

    IF s.payables_enabled THEN
      FOR p IN SELECT * FROM finance_payables
        WHERE account_id = s.account_id AND status = 'pending'
      LOOP
        days_left := p.due_date - local_day;
        IF days_left = ANY(s.payable_days_before) OR days_left = 0 OR (days_left < 0 AND s.overdue_daily) THEN
          FOR owner_row IN SELECT user_id FROM profiles
            WHERE account_id = s.account_id AND account_role = 'owner'
          LOOP
            INSERT INTO notifications(account_id,user_id,type,category,priority,title,body,action_url,metadata,dedupe_key)
            VALUES (s.account_id, owner_row.user_id,
              CASE WHEN days_left < 0 THEN 'payable_overdue' ELSE 'payable_due' END,
              'finance', CASE WHEN days_left <= 0 THEN 'critical' ELSE 'high' END,
              CASE WHEN days_left < 0 THEN 'Conta vencida exige ação' WHEN days_left = 0 THEN 'Conta vence hoje' ELSE 'Conta a vencer' END,
              p.description || ' · ' || p.currency || ' ' || to_char(p.amount, 'FM999G999G990D00') ||
                CASE WHEN days_left < 0 THEN ' · atrasada ' || abs(days_left) || ' dia(s)'
                     WHEN days_left = 0 THEN ' · vence hoje' ELSE ' · vence em ' || days_left || ' dia(s)' END,
              '/finance?tab=treasury', jsonb_build_object('payable_id',p.id,'due_date',p.due_date,'days_left',days_left),
              'payable:' || p.id || ':' || local_day)
            ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING * INTO n;
            IF n.id IS NOT NULL THEN RETURN NEXT n; n := NULL; END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;

    IF s.cash_enabled AND local_now::TIME >= s.cash_open_time AND NOT EXISTS (
      SELECT 1 FROM finance_cash_sessions WHERE account_id=s.account_id
        AND (opened_at AT TIME ZONE s.timezone)::DATE=local_day
    ) THEN
      FOR owner_row IN SELECT user_id FROM profiles WHERE account_id=s.account_id AND account_role IN ('owner','admin') LOOP
        INSERT INTO notifications(account_id,user_id,type,category,priority,title,body,action_url,metadata,dedupe_key)
        VALUES(s.account_id,owner_row.user_id,'cash_open_due','finance','high','Abra o caixa agora',
          'O caixa das ' || to_char(s.cash_open_time,'HH24:MI') || ' ainda não foi aberto. Abra-o para iniciar a operação do dia.',
          '/finance?tab=cash',jsonb_build_object('business_date',local_day),'cash-open:'||local_day)
        ON CONFLICT (user_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING * INTO n;
        IF n.id IS NOT NULL THEN RETURN NEXT n; n := NULL; END IF;
      END LOOP;
    END IF;

    SELECT MIN((opened_at AT TIME ZONE s.timezone)::DATE) INTO open_business_day
    FROM finance_cash_sessions WHERE account_id=s.account_id AND status='open';
    close_deadline := open_business_day + s.cash_close_time;
    IF s.cash_enabled AND open_business_day IS NOT NULL AND local_now >= close_deadline THEN
      slot := floor(extract(epoch FROM (local_now - close_deadline)) / (s.close_repeat_minutes*60));
      FOR owner_row IN SELECT user_id FROM profiles WHERE account_id=s.account_id AND account_role IN ('owner','admin') LOOP
        INSERT INTO notifications(account_id,user_id,type,category,priority,title,body,action_url,metadata,dedupe_key)
        VALUES(s.account_id,owner_row.user_id,'cash_close_due','finance','critical','Feche o caixa agora',
          'O limite das ' || to_char(s.cash_close_time,'HH24:MI') || ' passou e o caixa continua aberto. Este alerta repetirá até o fecho ser detectado.',
          '/finance?tab=cash',jsonb_build_object('business_date',open_business_day,'repeat_slot',slot),
          'cash-close:'||open_business_day||':'||slot)
        ON CONFLICT (user_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING * INTO n;
        IF n.id IS NOT NULL THEN RETURN NEXT n; n := NULL; END IF;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION process_finance_operational_reminders(TIMESTAMPTZ) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION process_finance_operational_reminders(TIMESTAMPTZ) TO service_role;
NOTIFY pgrst, 'reload schema';
