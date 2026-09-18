import 'server-only';

import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { engineSendText } from '@/lib/automations/meta-send';
import { mutate, selectRows, transaction } from '@/lib/mysql/db';

type Benefit = RowDataPacket & {
  benefit_id: string;
  benefit_type: 'voucher' | 'pack';
  account_id: string;
  contact_id: string;
  user_id: string;
  contact_name: string | null;
  phone: string | null;
  label: string | null;
  code: string | null;
  expires_at: Date | string;
  remaining: number | string;
  reminder_days: number | string;
};

function dateLabel(value: Date | string) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric',
  }).format(new Date(value));
}

async function findOrCreateConversation(input: {
  accountId: string;
  contactId: string;
  userId: string;
}) {
  return transaction(async (connection) => {
    const [existing] = await connection.execute<(RowDataPacket & { id: string })[]>(
      'SELECT id FROM conversations WHERE account_id=? AND contact_id=? ORDER BY created_at ASC LIMIT 1 FOR UPDATE',
      [input.accountId, input.contactId]
    );
    if (existing[0]?.id) return existing[0].id;
    const id = randomUUID();
    await connection.execute(
      "INSERT INTO conversations(id,account_id,user_id,contact_id,status) VALUES(?,?,?,?,'open')",
      [id, input.accountId, input.userId, input.contactId]
    );
    return id;
  });
}

async function claim(benefit: Benefit) {
  try {
    await mutate(
      `INSERT INTO finance_expiry_reminders(id,account_id,benefit_type,benefit_id,expires_at,contact_id)
       VALUES(?,?,?,?,?,?)`,
      [randomUUID(), benefit.account_id, benefit.benefit_type, benefit.benefit_id, benefit.expires_at, benefit.contact_id]
    );
    return true;
  } catch (error) {
    // Duplicate key is an expected outcome when the cron runs again.
    if (error instanceof Error && /duplicate|1062/i.test(error.message)) return false;
    throw error;
  }
}

export async function sendBenefitExpiryReminders(limit = 100) {
  const rows = await selectRows<Benefit[]>(
    `SELECT * FROM (
      SELECT v.id benefit_id,'voucher' benefit_type,v.account_id,v.owner_contact_id contact_id,
        a.owner_user_id user_id,c.name contact_name,c.phone,s.name label,v.code,v.expires_at,
        CASE WHEN v.voucher_type='service' THEN COALESCE(v.remaining_uses,0) ELSE COALESCE(v.current_balance,0) END remaining,
        COALESCE(cs.benefit_expiry_reminder_days,7) reminder_days
      FROM finance_vouchers v
      JOIN accounts a ON a.id=v.account_id
      JOIN contacts c ON c.id=v.owner_contact_id
      LEFT JOIN clinic_services s ON s.id=v.service_id
      LEFT JOIN clinic_communication_settings cs ON cs.account_id=v.account_id
      WHERE v.status='active' AND v.expires_at IS NOT NULL
        AND (v.remaining_uses>0 OR v.current_balance>0)
        AND COALESCE(cs.auto_send_benefit_expiry_reminder,TRUE)=TRUE
        AND v.expires_at>UTC_TIMESTAMP(3)
        AND v.expires_at<=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL COALESCE(cs.benefit_expiry_reminder_days,7) DAY)
      UNION ALL
      SELECT p.id benefit_id,'pack' benefit_type,p.account_id,p.contact_id,
        a.owner_user_id user_id,c.name contact_name,c.phone,pc.name label,p.code,p.expires_at,
        COALESCE(SUM(b.remaining_sessions),0) remaining,
        COALESCE(cs.benefit_expiry_reminder_days,7) reminder_days
      FROM finance_client_packs p
      JOIN accounts a ON a.id=p.account_id
      JOIN contacts c ON c.id=p.contact_id
      JOIN finance_pack_catalog pc ON pc.id=p.pack_id
      LEFT JOIN finance_client_pack_balances b ON b.client_pack_id=p.id
      LEFT JOIN clinic_communication_settings cs ON cs.account_id=p.account_id
      WHERE p.status='active' AND p.expires_at IS NOT NULL
        AND COALESCE(cs.auto_send_benefit_expiry_reminder,TRUE)=TRUE
        AND p.expires_at>UTC_TIMESTAMP(3)
        AND p.expires_at<=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL COALESCE(cs.benefit_expiry_reminder_days,7) DAY)
      GROUP BY p.id,p.account_id,p.contact_id,a.owner_user_id,c.name,c.phone,pc.name,p.code,p.expires_at,cs.benefit_expiry_reminder_days
      HAVING remaining>0
    ) benefits
    WHERE phone IS NOT NULL AND TRIM(phone)<>'' AND user_id IS NOT NULL
    ORDER BY expires_at ASC LIMIT ?`,
    [Math.max(1, Math.min(100, limit))]
  );
  let sent = 0;
  let skipped = 0;
  const failed: Array<{ benefit_id: string; error: string }> = [];
  for (const benefit of rows) {
    if (!(await claim(benefit))) { skipped += 1; continue; }
    try {
      const conversationId = await findOrCreateConversation({
        accountId: benefit.account_id, contactId: benefit.contact_id, userId: benefit.user_id,
      });
      const name = benefit.contact_name?.trim() ? `Olá, ${benefit.contact_name.split(' ')[0]}.` : 'Olá.';
      const kind = benefit.benefit_type === 'voucher' ? 'voucher' : 'pack';
      const quantity = benefit.benefit_type === 'pack'
        ? `${Number(benefit.remaining)} sessão${Number(benefit.remaining) === 1 ? '' : 'ões'} disponível${Number(benefit.remaining) === 1 ? '' : 'is'}`
        : 'saldo/utilização disponível';
      await engineSendText({
        accountId: benefit.account_id, userId: benefit.user_id, conversationId, contactId: benefit.contact_id,
        text: `${name}\n\n⏳ O seu ${kind}${benefit.label ? ` de *${benefit.label}*` : ''} termina em *${dateLabel(benefit.expires_at)}*.\n${quantity}${benefit.code ? `\nCódigo: *${benefit.code}*` : ''}\n\nSe quiser utilizar antes da validade, responda a esta mensagem e ajudamos a agendar.`,
      });
      sent += 1;
    } catch (error) {
      failed.push({ benefit_id: benefit.benefit_id, error: error instanceof Error ? error.message : String(error) });
      await mutate(
        'DELETE FROM finance_expiry_reminders WHERE account_id=? AND benefit_type=? AND benefit_id=? AND expires_at=?',
        [benefit.account_id, benefit.benefit_type, benefit.benefit_id, benefit.expires_at]
      ).catch(() => undefined);
    }
  }
  return { checked: rows.length, sent, skipped, failed };
}
