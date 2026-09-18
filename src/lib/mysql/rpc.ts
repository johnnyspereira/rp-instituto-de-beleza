import 'server-only';

import { randomBytes, randomUUID } from 'node:crypto';
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';

import { mutate, selectRows, transaction } from '@/lib/mysql/db';

type RpcContext = { accountId: string; userId: string; bypassTenant?: boolean };
const ok = (data: unknown = null) => ({ data, error: null });
const failed = (cause: unknown) => ({
  data: null,
  error: {
    message: cause instanceof Error ? cause.message : 'MySQL operation failed.',
  },
});
const optionalText = (value: unknown) => (value == null ? null : String(value));

async function addPayment(
  connection: PoolConnection,
  input: {
    accountId: string;
    userId: string;
    saleId: string;
    method: string;
    amount: number;
    cashSessionId: string | null;
    reference: string | null;
    pin: string | null;
    notes: string | null;
  }
) {
  const [rows] = await connection.execute<
    (RowDataPacket & {
      balance_due: number;
      paid_amount: number;
      total_amount: number;
      appointment_id: string | null;
      contact_id: string | null;
      status: string;
    })[]
  >(
    'SELECT balance_due,paid_amount,total_amount,appointment_id,contact_id,status FROM finance_sales WHERE id=? AND account_id=? FOR UPDATE',
    [input.saleId, input.accountId]
  );
  const sale = rows[0];
  if (!sale || !['open', 'partially_paid'].includes(sale.status))
    throw new Error('Sale does not accept payments.');
  if (!(input.amount > 0) || input.amount > Number(sale.balance_due))
    throw new Error('Invalid payment amount.');
  if (input.method === 'cash') {
    const [cash] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM finance_cash_sessions WHERE id=? AND account_id=? AND status='open' LIMIT 1",
      [input.cashSessionId, input.accountId]
    );
    if (!cash.length) throw new Error('An open cash session is required.');
  }
  if (input.method === 'voucher') {
    const [vouchers] = await connection.execute<
      (RowDataPacket & { id: string; current_balance: number })[]
    >(
      `SELECT id,current_balance FROM finance_vouchers WHERE account_id=? AND UPPER(code)=UPPER(?) AND pin_code=? AND status='active' AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) FOR UPDATE`,
      [input.accountId, input.reference, input.pin]
    );
    const voucher = vouchers[0];
    if (!voucher || Number(voucher.current_balance) < input.amount)
      throw new Error('Voucher code or PIN is invalid.');
    await connection.execute(
      `UPDATE finance_vouchers SET current_balance=current_balance-?,status=IF(current_balance-?=0,'used','active') WHERE id=?`,
      [input.amount, input.amount, voucher.id]
    );
  }
  let wallet: { id: string; balance: number } | null = null;
  if (input.method === 'client_credit') {
    if (!sale.contact_id)
      throw new Error(
        'A venda precisa de um cliente para utilizar o cartão-saldo.'
      );
    const [wallets] = await connection.execute<
      (RowDataPacket & { id: string; balance: number })[]
    >(
      `SELECT id,balance FROM finance_client_wallets WHERE account_id=? AND contact_id=? AND currency='EUR' FOR UPDATE`,
      [input.accountId, sale.contact_id]
    );
    wallet = wallets[0] ?? null;
    if (!wallet || Number(wallet.balance) < input.amount)
      throw new Error('O cartão-saldo não tem saldo suficiente.');
  }
  const paymentId = randomUUID();
  await connection.execute(
    `INSERT INTO finance_payments(id,account_id,sale_id,cash_session_id,received_by_user_id,method,amount,reference_code,notes) VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      paymentId,
      input.accountId,
      input.saleId,
      input.cashSessionId,
      input.userId,
      input.method,
      input.amount,
      input.reference,
      input.notes,
    ]
  );
  if (wallet) {
    const balanceAfter = Number(wallet.balance) - input.amount;
    await connection.execute(
      'UPDATE finance_client_wallets SET balance=? WHERE id=?',
      [balanceAfter, wallet.id]
    );
    await connection.execute(
      `INSERT INTO finance_wallet_transactions(id,account_id,wallet_id,transaction_type,amount,balance_after,sale_id,payment_id,performed_by_user_id,description) VALUES(?,?,?,'debit',?,?,?,?,?,?)`,
      [
        randomUUID(),
        input.accountId,
        wallet.id,
        -input.amount,
        balanceAfter,
        input.saleId,
        paymentId,
        input.userId,
        'Pagamento de marcação com cartão-saldo',
      ]
    );
  }
  const paid = Number(sale.paid_amount) + input.amount;
  const complete = paid === Number(sale.total_amount);
  await connection.execute(
    `UPDATE finance_sales SET paid_amount=?,balance_due=total_amount-?,status=?,completed_at=IF(?,UTC_TIMESTAMP(3),NULL) WHERE id=?`,
    [paid, paid, complete ? 'paid' : 'partially_paid', complete, input.saleId]
  );
  // Benefits are created as pending while a sale is open. Payments can be
  // registered later from the POS, agenda or receivables screen, so activate
  // them here in the shared payment path once the sale is fully settled.
  if (complete) {
    await connection.execute(
      "UPDATE finance_vouchers SET status='active' WHERE issued_sale_id=? AND status='pending'",
      [input.saleId]
    );
    await connection.execute(
      "UPDATE finance_client_packs SET status='active' WHERE sale_id=? AND status='pending'",
      [input.saleId]
    );
  }
  if (complete && sale.appointment_id)
    await connection.execute(
      'UPDATE clinic_appointments SET paid_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?',
      [sale.appointment_id, input.accountId]
    );
}

async function ensureReferralRewards(
  connection: PoolConnection,
  accountId: string,
  referralId: string
) {
  const [rows] = await connection.execute<
    (RowDataPacket & {
      referrer_contact_id: string;
      friend_contact_id: string | null;
      referrer_reward_type: string;
      referrer_reward_value: number;
      referrer_service_id: string | null;
      friend_reward_type: string;
      friend_reward_value: number;
      friend_service_id: string | null;
      reward_validity_days: number;
    })[]
  >(
    `SELECT r.referrer_contact_id,r.friend_contact_id,s.referrer_reward_type,s.referrer_reward_value,s.referrer_service_id,s.friend_reward_type,s.friend_reward_value,s.friend_service_id,s.reward_validity_days FROM referrals r JOIN referral_program_settings s ON s.account_id=r.account_id WHERE r.id=? AND r.account_id=? FOR UPDATE`,
    [referralId, accountId]
  );
  const row = rows[0];
  if (!row)
    throw new Error('Indicação ou programa de indicações não encontrado.');
  const definitions = [
    {
      beneficiary: 'referrer',
      contactId: row.referrer_contact_id,
      type: row.referrer_reward_type,
      value: Number(row.referrer_reward_value),
      serviceId: row.referrer_service_id,
    },
    {
      beneficiary: 'friend',
      contactId: row.friend_contact_id,
      type: row.friend_reward_type,
      value: Number(row.friend_reward_value),
      serviceId: row.friend_service_id,
    },
  ];
  for (const reward of definitions) {
    if (!reward.contactId || reward.type === 'none' || reward.value <= 0)
      continue;
    await connection.execute(
      `INSERT IGNORE INTO referral_rewards(id,account_id,referral_id,beneficiary_type,contact_id,reward_type,reward_value,service_id,reward_code,expires_at,metadata) VALUES(?,?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? DAY),?)`,
      [
        randomUUID(),
        accountId,
        referralId,
        reward.beneficiary,
        reward.contactId,
        reward.type,
        reward.value,
        reward.serviceId,
        `REF-${randomBytes(5).toString('hex').toUpperCase()}`,
        Number(row.reward_validity_days || 90),
        JSON.stringify({ source: 'program_settings' }),
      ]
    );
  }
}

async function issuePendingReferrerCredits(
  connection: PoolConnection,
  accountId: string,
  referralId: string,
  userId: string,
  beneficiary: 'referrer' | 'friend' = 'referrer'
) {
  const [rewards] = await connection.execute<
    (RowDataPacket & { id: string; contact_id: string; reward_value: number })[]
  >(
    `SELECT id,contact_id,reward_value FROM referral_rewards WHERE account_id=? AND referral_id=? AND beneficiary_type=? AND reward_type='fixed_credit' AND status='pending' FOR UPDATE`,
    [accountId, referralId, beneficiary]
  );
  for (const reward of rewards) {
    const [wallets] = await connection.execute<
      (RowDataPacket & { id: string; balance: number })[]
    >(
      `SELECT id,balance FROM finance_client_wallets WHERE account_id=? AND contact_id=? AND currency='EUR' FOR UPDATE`,
      [accountId, reward.contact_id]
    );
    const walletId = wallets[0]?.id ?? randomUUID(),
      old = Number(wallets[0]?.balance ?? 0),
      amount = Number(reward.reward_value);
    if (wallets[0])
      await connection.execute(
        'UPDATE finance_client_wallets SET balance=balance+? WHERE id=?',
        [amount, walletId]
      );
    else
      await connection.execute(
        `INSERT INTO finance_client_wallets(id,account_id,contact_id,currency,balance) VALUES(?,?,?,'EUR',?)`,
        [walletId, accountId, reward.contact_id, amount]
      );
    await connection.execute(
      `INSERT INTO finance_wallet_transactions(id,account_id,wallet_id,transaction_type,amount,balance_after,referral_reward_id,performed_by_user_id,description) VALUES(?,?,?,'credit',?,?,?,?,?)`,
      [
        randomUUID(),
        accountId,
        walletId,
        amount,
        old + amount,
        reward.id,
        userId,
        beneficiary === 'friend'
          ? 'Benefício de primeira sessão do Indique & Ganhe'
          : 'Recompensa Indique & Ganhe',
      ]
    );
    await connection.execute(
      `UPDATE referral_rewards SET status='issued',issued_at=UTC_TIMESTAMP(3),issued_by_user_id=?,issued_wallet_id=?,credited_amount=?,available_amount=? WHERE id=?`,
      [userId, walletId, amount, amount, reward.id]
    );
  }
}

export async function executeMysqlRpc(
  name: string,
  args: Record<string, unknown>,
  context: RpcContext
) {
  try {
    switch (name) {
      case 'touch_presence': {
        await mutate(
          `INSERT INTO member_presence(user_id,account_id,status,last_seen_at)
          VALUES(?,?,?,UTC_TIMESTAMP(3))
          ON DUPLICATE KEY UPDATE status=VALUES(status),last_seen_at=UTC_TIMESTAMP(3)`,
          [context.userId, context.accountId, String(args.p_status ?? 'online')]
        );
        return ok(true);
      }
      case 'increment_flow_execution_count': {
        const scope = context.bypassTenant ? '' : ' AND account_id=?';
        const values = context.bypassTenant
          ? [String(args.p_flow_id)]
          : [String(args.p_flow_id), context.accountId];
        await mutate(
          `UPDATE flows SET execution_count=execution_count+1,updated_at=UTC_TIMESTAMP(3) WHERE id=?${scope}`,
          values
        );
        return ok(true);
      }
      case 'increment_automation_execution_count': {
        await mutate(
          'UPDATE automations SET execution_count=execution_count+1,last_executed_at=UTC_TIMESTAMP(3) WHERE id=?',
          [String(args.p_automation_id)]
        );
        return ok(true);
      }
      case 'claim_ai_reply_slot': {
        const result = await mutate(
          `UPDATE conversations SET ai_reply_count=ai_reply_count+1 WHERE id=? AND ai_reply_count<? AND ai_autoreply_disabled=FALSE`,
          [String(args.conversation_id), Number(args.max_replies)]
        );
        return ok(result.affectedRows === 1);
      }
      case 'filter_contacts_by_tags':
      case 'filter_contacts_advanced': {
        const tags = Array.isArray(args.p_tag_ids)
          ? args.p_tag_ids.map(String)
          : [];
        const search = String(args.p_search ?? '').trim();
        const segment =
          name === 'filter_contacts_advanced'
            ? String(args.p_segment ?? 'all')
            : 'all';
        const conditions = ['c.account_id=?'];
        const values: (string | number)[] = [context.accountId];
        if (search) {
          conditions.push(
            '(c.client_reference LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.company LIKE ?)'
          );
          for (let i = 0; i < 5; i++) values.push(`%${search}%`);
        }
        if (tags.length) {
          conditions.push(
            `EXISTS(SELECT 1 FROM contact_tags ct WHERE ct.contact_id=c.id AND ct.tag_id IN (${tags.map(() => '?').join(',')}))`
          );
          values.push(...tags);
        }
        const tagged =
          'EXISTS(SELECT 1 FROM contact_tags ct WHERE ct.contact_id=c.id)';
        if (segment === 'needs_info')
          conditions.push(
            `(NULLIF(TRIM(COALESCE(c.name,'')),'') IS NULL OR NULLIF(TRIM(COALESCE(c.email,'')),'') IS NULL OR NULLIF(TRIM(COALESCE(c.company,'')),'') IS NULL OR NOT ${tagged})`
          );
        if (segment === 'complete')
          conditions.push(
            `NULLIF(TRIM(COALESCE(c.name,'')),'') IS NOT NULL AND NULLIF(TRIM(COALESCE(c.phone,'')),'') IS NOT NULL AND NULLIF(TRIM(COALESCE(c.email,'')),'') IS NOT NULL AND NULLIF(TRIM(COALESCE(c.company,'')),'') IS NOT NULL AND ${tagged}`
          );
        if (segment === 'untagged') conditions.push(`NOT ${tagged}`);
        if (segment === 'new_today')
          conditions.push('c.created_at>=CURRENT_DATE');
        if (segment === 'with_conversations')
          conditions.push(
            'EXISTS(SELECT 1 FROM conversations cv WHERE cv.contact_id=c.id)'
          );
        if (segment === 'with_deals')
          conditions.push(
            "EXISTS(SELECT 1 FROM deals d WHERE d.contact_id=c.id AND COALESCE(d.status,'open')='open')"
          );
        if (segment === 'with_portal')
          conditions.push(
            'EXISTS(SELECT 1 FROM client_portal_access pa WHERE pa.account_id=c.account_id AND pa.contact_id=c.id)'
          );
        const where = conditions.join(' AND ');
        const totals = await selectRows<(RowDataPacket & { total: number })[]>(
          `SELECT COUNT(*) total FROM contacts c WHERE ${where}`,
          values
        );
        const limit = Math.max(0, Math.min(Number(args.p_limit ?? 25), 5000)),
          offset = Math.max(0, Number(args.p_offset ?? 0));
        const rows = await selectRows<RowDataPacket[]>(
          `SELECT c.* FROM contacts c WHERE ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
          [...values, limit, offset]
        );
        return ok(
          rows.map((contact) => ({
            contact,
            total_count: Number(totals[0]?.total ?? 0),
          }))
        );
      }
      case 'match_ai_knowledge_fts': {
        const rows = await selectRows<RowDataPacket[]>(
          `SELECT id,content,MATCH(content) AGAINST(? IN NATURAL LANGUAGE MODE) rank FROM ai_knowledge_chunks WHERE account_id=? AND MATCH(content) AGAINST(? IN NATURAL LANGUAGE MODE) ORDER BY rank DESC LIMIT ?`,
          [
            String(args.p_query),
            String(args.p_account_id),
            String(args.p_query),
            Math.max(0, Number(args.p_match_count ?? 5)),
          ]
        );
        return ok(rows);
      }
      case 'match_ai_knowledge_semantic': {
        const query = String(args.p_query_embedding ?? '')
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map(Number);
        if (!query.length || query.some((v) => !Number.isFinite(v)))
          return ok([]);
        const rows = await selectRows<
          (RowDataPacket & {
            id: string;
            content: string;
            embedding: string | number[];
          })[]
        >(
          'SELECT id,content,embedding FROM ai_knowledge_chunks WHERE account_id=? AND embedding IS NOT NULL',
          [String(args.p_account_id)]
        );
        const norm = Math.sqrt(query.reduce((s, v) => s + v * v, 0));
        const ranked = rows
          .map((row) => {
            const vector = Array.isArray(row.embedding)
              ? row.embedding
              : JSON.parse(row.embedding);
            let dot = 0,
              vnorm = 0;
            for (let i = 0; i < Math.min(query.length, vector.length); i++) {
              dot += query[i] * vector[i];
              vnorm += vector[i] * vector[i];
            }
            return {
              id: row.id,
              content: row.content,
              distance: 1 - dot / (norm * Math.sqrt(vnorm) || 1),
            };
          })
          .sort((a, b) => a.distance - b.distance)
          .slice(0, Math.max(0, Number(args.p_match_count ?? 5)));
        return ok(ranked);
      }
      case 'record_webhook_failure': {
        await mutate(
          `UPDATE webhook_endpoints SET consecutive_failures=consecutive_failures+1,
          is_active=IF(consecutive_failures+1>=?,FALSE,is_active),updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [Number(args.max_failures ?? 10), String(args.endpoint_id)]
        );
        return ok(true);
      }
      case 'process_finance_operational_reminders': {
        const now = new Date(String(args.p_now ?? new Date().toISOString()));
        const day = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        );
        const payables = await selectRows<
          (RowDataPacket & {
            id: string;
            account_id: string;
            description: string;
            amount: number;
            currency: string;
            due_date: Date;
            user_id: string;
            payable_days_before: string | number[] | null;
            overdue_daily: boolean;
          })[]
        >(
          `SELECT p.id,p.account_id,p.description,p.amount,p.currency,p.due_date,pr.user_id,s.payable_days_before,COALESCE(s.overdue_daily,TRUE) overdue_daily FROM finance_payables p JOIN profiles pr ON pr.account_id=p.account_id AND pr.account_role='owner' LEFT JOIN finance_reminder_settings s ON s.account_id=p.account_id WHERE p.status='pending' AND COALESCE(s.payables_enabled,TRUE)=TRUE`
        );
        const created: string[] = [];
        for (const payable of payables) {
          const due = new Date(payable.due_date);
          const days = Math.round(
            (Date.UTC(
              due.getUTCFullYear(),
              due.getUTCMonth(),
              due.getUTCDate()
            ) -
              day.getTime()) /
              86400000
          );
          let configured: number[] = [7, 3, 1];
          if (Array.isArray(payable.payable_days_before))
            configured = payable.payable_days_before;
          else if (typeof payable.payable_days_before === 'string') {
            try {
              const value = JSON.parse(payable.payable_days_before);
              if (Array.isArray(value)) configured = value.map(Number);
            } catch {
              configured = [7, 3, 1];
            }
          }
          if (
            !configured.includes(days) &&
            days !== 0 &&
            !(days < 0 && payable.overdue_daily)
          )
            continue;
          const id = randomUUID(),
            dedupe = `payable:${payable.id}:${day.toISOString().slice(0, 10)}`,
            title =
              days < 0
                ? 'Conta vencida exige ação'
                : days === 0
                  ? 'Conta vence hoje'
                  : 'Conta a vencer',
            body = `${payable.description} · ${payable.currency} ${Number(payable.amount).toFixed(2)} · ${days < 0 ? `atrasada ${Math.abs(days)} dia(s)` : days === 0 ? 'vence hoje' : `vence em ${days} dia(s)`}`;
          const result = await mutate(
            `INSERT IGNORE INTO notifications(id,account_id,user_id,type,category,priority,title,body,action_url,metadata,dedupe_key) VALUES(?,?,?,?,'finance',?,?,?,?,?,?)`,
            [
              id,
              payable.account_id,
              payable.user_id,
              days < 0 ? 'payable_overdue' : 'payable_due',
              days <= 0 ? 'critical' : 'high',
              title,
              body,
              '/finance?tab=treasury',
              JSON.stringify({
                payable_id: payable.id,
                due_date: payable.due_date,
                days_left: days,
              }),
              dedupe,
            ]
          );
          if (result.affectedRows) created.push(id);
        }
        if (!created.length) return ok([]);
        const rows = await selectRows<RowDataPacket[]>(
          `SELECT id,account_id,user_id,title,body,action_url FROM notifications WHERE id IN(${created.map(() => '?').join(',')})`,
          created
        );
        return ok(rows);
      }
      case 'get_finance_fund_accounts': {
        const rows = await selectRows<RowDataPacket[]>(
          `SELECT a.id,a.name,a.account_type,a.institution,a.currency,a.is_active,
          COALESCE(SUM(IF(t.direction='credit',t.amount,-t.amount)),0) balance
          FROM finance_fund_accounts a LEFT JOIN finance_fund_transactions t ON t.fund_account_id=a.id
          WHERE a.account_id=? AND a.is_active=TRUE GROUP BY a.id,a.name,a.account_type,a.institution,a.currency,a.is_active
          ORDER BY FIELD(a.account_type,'cash','bank','other'),a.name`,
          [context.accountId]
        );
        return ok(rows);
      }
      case 'get_finance_register_snapshot': {
        const id = String(args.p_cash_session_id);
        const sessions = await selectRows<
          (RowDataPacket & { opening_amount: number })[]
        >(
          'SELECT opening_amount FROM finance_cash_sessions WHERE id=? AND account_id=? LIMIT 1',
          [id, context.accountId]
        );
        if (!sessions[0]) throw new Error('Cash session not found.');
        const payments = await selectRows<
          (RowDataPacket & { method: string; total: number })[]
        >(
          `SELECT method,SUM(IF(status='refunded',-amount,amount)) total FROM finance_payments WHERE cash_session_id=? AND status IN('confirmed','refunded') GROUP BY method`,
          [id]
        );
        const movements = await selectRows<
          (RowDataPacket & {
            payment_method: string;
            movement_type: string;
            total: number;
          })[]
        >(
          `SELECT payment_method,movement_type,SUM(amount) total FROM finance_cash_movements WHERE cash_session_id=? GROUP BY payment_method,movement_type`,
          [id]
        );
        const paymentsByMethod = Object.fromEntries(
          payments.map((row) => [row.method, Number(row.total)])
        );
        const tipsByMethod: Record<string, number> = {};
        let deposits = 0;
        let outflows = 0;
        for (const row of movements) {
          const amount = Number(row.total);
          if (row.movement_type === 'tip')
            tipsByMethod[row.payment_method] = amount;
          if (
            row.payment_method === 'cash' &&
            ['deposit', 'adjustment'].includes(row.movement_type)
          )
            deposits += amount;
          if (
            row.payment_method === 'cash' &&
            ['withdrawal', 'expense', 'refund'].includes(row.movement_type)
          )
            outflows += amount;
        }
        const opening = Number(sessions[0].opening_amount);
        const cashReceived =
          (paymentsByMethod.cash ?? 0) + (tipsByMethod.cash ?? 0);
        const expected = opening + cashReceived + deposits - outflows;
        return ok({
          opening_amount: opening,
          cash_received: cashReceived,
          deposits,
          outflows,
          expected_amount: expected,
          payments_by_method: paymentsByMethod,
          tips_by_method: tipsByMethod,
          cash_deposits: deposits,
          cash_outflows: outflows,
          expected_cash: expected,
        });
      }
      case 'open_finance_cash_session_v3': {
        const positions = Array.isArray(args.p_opening_positions)
          ? (args.p_opening_positions as Record<string, unknown>[])
          : [];
        if (!positions.length)
          throw new Error('Informe pelo menos uma origem de fundos.');
        const id = randomUUID();
        let opening = 0;
        const breakdown: Record<string, number> = {};
        await transaction(async (connection) => {
          const [active] = await connection.execute<RowDataPacket[]>(
            "SELECT id FROM finance_cash_sessions WHERE account_id=? AND status='open' FOR UPDATE",
            [context.accountId]
          );
          if (active.length) throw new Error('Já existe um caixa aberto.');
          for (const position of positions) {
            const amount = Number(position.amount ?? 0);
            if (amount < 0) throw new Error('Valor inicial inválido.');
            opening += amount;
            const name = String(position.name ?? '').trim();
            if (!name) throw new Error('Nome da conta é obrigatório.');
            const [existing] = await connection.execute<
              (RowDataPacket & { id: string })[]
            >(
              'SELECT id FROM finance_fund_accounts WHERE account_id=? AND name=? LIMIT 1',
              [context.accountId, name]
            );
            const fundId = existing[0]?.id ?? randomUUID();
            if (!existing[0])
              await connection.execute(
                'INSERT INTO finance_fund_accounts(id,account_id,name,account_type,institution,currency,created_by_user_id) VALUES(?,?,?,?,?,?,?)',
                [
                  fundId,
                  context.accountId,
                  name,
                  String(position.account_type ?? 'other'),
                  optionalText(position.institution),
                  String(position.currency ?? 'EUR'),
                  context.userId,
                ]
              );
            breakdown[fundId] = amount;
            if (amount > 0)
              await connection.execute(
                `INSERT INTO finance_fund_transactions(id,account_id,fund_account_id,direction,transaction_type,amount,description,created_by_user_id) VALUES(?,?,?,'credit','opening_reconciliation',?,'Saldo de abertura',?)`,
                [
                  randomUUID(),
                  context.accountId,
                  fundId,
                  amount,
                  context.userId,
                ]
              );
          }
          await connection.execute(
            `INSERT INTO finance_cash_sessions(id,account_id,opened_by_user_id,status,opening_amount,opening_breakdown,notes) VALUES(?,?,?,'open',?,?,?)`,
            [
              id,
              context.accountId,
              context.userId,
              opening,
              JSON.stringify(breakdown),
              optionalText(args.p_notes),
            ]
          );
        });
        return ok({ id });
      }
      case 'add_finance_register_movement': {
        const id = randomUUID();
        const amount = Number(args.p_amount);
        if (!(amount > 0) || !String(args.p_description ?? '').trim())
          throw new Error('Invalid register movement.');
        const result = await mutate(
          `INSERT INTO finance_cash_movements(id,account_id,cash_session_id,movement_type,amount,description,reference,payment_method,category,occurred_at,created_by_user_id)
          SELECT ?,account_id,id,?,?,?,?,?,?,?,? FROM finance_cash_sessions WHERE id=? AND account_id=? AND status='open'`,
          [
            id,
            String(args.p_movement_type),
            amount,
            String(args.p_description).trim(),
            optionalText(args.p_reference),
            String(args.p_payment_method ?? 'cash'),
            optionalText(args.p_category),
            args.p_occurred_at == null
              ? new Date()
              : String(args.p_occurred_at),
            context.userId,
            String(args.p_cash_session_id),
            context.accountId,
          ]
        );
        if (!result.affectedRows)
          throw new Error('Open cash session not found.');
        return ok({ id });
      }
      case 'transfer_finance_funds': {
        const amount = Number(args.p_amount);
        if (
          !(amount > 0) ||
          args.p_source_account_id === args.p_destination_account_id
        )
          throw new Error('Invalid transfer.');
        const transferId = randomUUID();
        await transaction(async (connection) => {
          const [accounts] = await connection.execute<RowDataPacket[]>(
            'SELECT id FROM finance_fund_accounts WHERE account_id=? AND id IN (?,?) AND is_active=TRUE FOR UPDATE',
            [
              context.accountId,
              String(args.p_source_account_id),
              String(args.p_destination_account_id),
            ]
          );
          if (accounts.length !== 2)
            throw new Error('Financial account not found.');
          await connection.execute(
            'INSERT INTO finance_fund_transfers(id,account_id,source_account_id,destination_account_id,amount,description,created_by_user_id) VALUES(?,?,?,?,?,?,?)',
            [
              transferId,
              context.accountId,
              String(args.p_source_account_id),
              String(args.p_destination_account_id),
              amount,
              optionalText(args.p_description),
              context.userId,
            ]
          );
          for (const [fund, direction] of [
            [args.p_source_account_id, 'debit'],
            [args.p_destination_account_id, 'credit'],
          ] as const)
            await connection.execute(
              "INSERT INTO finance_fund_transactions(id,account_id,fund_account_id,transfer_id,direction,transaction_type,amount,description,created_by_user_id) VALUES(?,?,?,?,?,'transfer',?,?,?)",
              [
                randomUUID(),
                context.accountId,
                String(fund),
                transferId,
                direction,
                amount,
                String(args.p_description ?? 'Transferência interna'),
                context.userId,
              ]
            );
        });
        return ok({ id: transferId });
      }
      case 'close_finance_cash_session_v2': {
        const counted =
          args.p_counted_breakdown &&
          typeof args.p_counted_breakdown === 'object'
            ? (args.p_counted_breakdown as Record<string, unknown>)
            : {};
        const snapshotResult = await executeMysqlRpc(
          'get_finance_register_snapshot',
          { p_cash_session_id: args.p_cash_session_id },
          context
        );
        if (snapshotResult.error) throw new Error(snapshotResult.error.message);
        const snapshot = snapshotResult.data as Record<string, unknown>;
        const methods = [
          'cash',
          'card',
          'mb_way',
          'multibanco',
          'bank_transfer',
          'other',
        ];
        const expected: Record<string, number> = {};
        const reconciliation: Record<string, unknown> = {};
        const paymentsByMethod = (snapshot.payments_by_method ?? {}) as Record<
          string,
          unknown
        >;
        const tipsByMethod = (snapshot.tips_by_method ?? {}) as Record<
          string,
          unknown
        >;
        for (const method of methods) {
          expected[method] =
            method === 'cash'
              ? Number(snapshot.expected_cash)
              : Number(paymentsByMethod[method] ?? 0) +
                Number(tipsByMethod[method] ?? 0);
          const value = Number(counted[method] ?? 0);
          if (value < 0) throw new Error('Invalid counted amount.');
          reconciliation[method] = {
            expected: expected[method],
            counted: value,
            difference: value - expected[method],
          };
        }
        const cash = Number(counted.cash ?? 0);
        await mutate(
          `UPDATE finance_cash_sessions SET status='closed',closed_by_user_id=?,closing_counted_amount=?,expected_amount=?,difference_amount=?,expected_breakdown=?,closing_breakdown=?,reconciliation_breakdown=?,notes=COALESCE(?,notes),closed_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=? AND status='open'`,
          [
            context.userId,
            cash,
            Number(snapshot.expected_cash),
            cash - Number(snapshot.expected_cash),
            JSON.stringify(expected),
            JSON.stringify(counted),
            JSON.stringify(reconciliation),
            optionalText(args.p_notes),
            String(args.p_cash_session_id),
            context.accountId,
          ]
        );
        return ok(true);
      }
      case 'add_finance_payment_secure': {
        await transaction((connection) =>
          addPayment(connection, {
            accountId: context.accountId,
            userId: context.userId,
            saleId: String(args.p_sale_id),
            method: String(args.p_method),
            amount: Number(args.p_amount),
            cashSessionId: optionalText(args.p_cash_session_id),
            reference: optionalText(args.p_reference_code),
            pin: optionalText(args.p_pin_code),
            notes: optionalText(args.p_notes),
          })
        );
        return ok(true);
      }
      case 'create_finance_sale_secure': {
        const items = Array.isArray(args.p_items)
          ? (args.p_items as Record<string, unknown>[])
          : [];
        const payments = Array.isArray(args.p_payments)
          ? (args.p_payments as Record<string, unknown>[])
          : [];
        const alreadyPaidElsewhere = args.p_already_paid_elsewhere === true;
        if (!items.length) throw new Error('Sale requires at least one item.');
        let subtotal = 0,
          itemDiscount = 0,
          tax = 0;
        for (const item of items) {
          const quantity = Number(item.quantity),
            unit = Number(item.unit_price),
            discount = Number(item.discount_amount ?? 0),
            rate = Number(item.tax_rate ?? 0);
          const base = quantity * unit;
          if (
            !(quantity > 0) ||
            unit < 0 ||
            discount < 0 ||
            discount > base ||
            rate < 0 ||
            rate > 100
          )
            throw new Error('Invalid sale item.');
          subtotal += base;
          itemDiscount += discount;
          tax += Math.round(Math.max(base - discount, 0) * rate) / 100;
        }
        const saleDiscount = Math.max(Number(args.p_sale_discount ?? 0), 0);
        if (itemDiscount + saleDiscount > subtotal)
          throw new Error('Discount cannot exceed subtotal.');
        const total =
          Math.round((subtotal - itemDiscount - saleDiscount + tax) * 100) /
          100;
        const paymentTotal = payments.reduce(
          (sum, p) => sum + Number(p.amount ?? 0),
          0
        );
        if ((!alreadyPaidElsewhere && paymentTotal > total) || payments.some((p) => Number(p.amount) <= 0))
          throw new Error('Invalid sale payments.');
        if (alreadyPaidElsewhere && payments.length)
          throw new Error('Imported benefits cannot register a local payment.');
        const saleId = randomUUID();
        await transaction(async (connection) => {
          await connection.execute(
            `INSERT INTO finance_sales(id,account_id,contact_id,appointment_id,cash_session_id,created_by_user_id,status,currency,subtotal,discount_amount,tax_amount,total_amount,paid_amount,balance_due,is_historical,notes)
            VALUES(?,?,?,?,?,?,'open',?,?,?,?,?,0,?,?,?)`,
            [
              saleId,
              context.accountId,
              optionalText(args.p_contact_id),
              optionalText(args.p_appointment_id),
              optionalText(args.p_cash_session_id),
              context.userId,
              String(args.p_currency ?? 'EUR'),
              subtotal,
              itemDiscount + saleDiscount,
              tax,
              total,
              total,
              alreadyPaidElsewhere ? 1 : 0,
              optionalText(args.p_notes),
            ]
          );
          for (const item of items) {
            const quantity = Number(item.quantity),
              unit = Number(item.unit_price),
              discount = Number(item.discount_amount ?? 0),
              rate = Number(item.tax_rate ?? 0);
            const base = quantity * unit;
            const lineTax =
              Math.round(Math.max(base - discount, 0) * rate) / 100;
            const lineTotal = Math.max(base - discount, 0) + lineTax;
            const metadata =
              item.metadata && typeof item.metadata === 'object'
                ? (item.metadata as Record<string, unknown>)
                : {};
            await connection.execute(
              `INSERT INTO finance_sale_items(id,sale_id,account_id,item_type,source_id,name_snapshot,reference_snapshot,quantity,unit_price,discount_amount,tax_rate,tax_amount,line_total,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [
                randomUUID(),
                saleId,
                context.accountId,
                String(item.item_type),
                optionalText(item.source_id),
                String(item.name ?? ''),
                optionalText(item.reference),
                quantity,
                unit,
                discount,
                rate,
                lineTax,
                lineTotal,
                JSON.stringify(metadata),
              ]
            );
            if (item.item_type === 'product') {
              const count = Math.ceil(quantity);
              const [result] = await connection.execute<ResultSetHeader>(
                'UPDATE clinic_products SET stock_quantity=stock_quantity-? WHERE id=? AND account_id=? AND stock_quantity>=?',
                [count, String(item.source_id), context.accountId, count]
              );
              if (!result.affectedRows)
                throw new Error('Insufficient product stock.');
              const [stock] = await connection.execute<
                (RowDataPacket & { stock_quantity: number })[]
              >('SELECT stock_quantity FROM clinic_products WHERE id=?', [
                String(item.source_id),
              ]);
              await connection.execute(
                `INSERT INTO finance_stock_movements(id,account_id,product_id,sale_id,user_id,movement_type,quantity,stock_after) VALUES(?,?,?,?,?,'sale',?,?)`,
                [
                  randomUUID(),
                  context.accountId,
                  String(item.source_id),
                  saleId,
                  context.userId,
                  -count,
                  stock[0].stock_quantity,
                ]
              );
            }
            if (item.item_type === 'pack') {
              if (!args.p_contact_id)
                throw new Error('Packs require a client.');
              const [packs] = await connection.execute<
                (RowDataPacket & { id: string; validity_days: number })[]
              >(
                'SELECT id,validity_days FROM finance_pack_catalog WHERE id=? AND account_id=? AND is_active=TRUE',
                [String(item.source_id), context.accountId]
              );
              if (!packs[0]) throw new Error('Pack not found.');
              for (let n = 0; n < Math.ceil(quantity); n++) {
                const clientPackId = randomUUID(),
                  code = `PCK-${randomBytes(5).toString('hex').toUpperCase()}`,
                  pin = String(Math.floor(Math.random() * 1_000_000)).padStart(
                    6,
                    '0'
                  );
                await connection.execute(
                  `INSERT INTO finance_client_packs(id,account_id,contact_id,pack_id,sale_id,code,pin_code,status,expires_at) VALUES(?,?,?,?,?,?,?,'pending',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? DAY))`,
                  [
                    clientPackId,
                    context.accountId,
                    String(args.p_contact_id),
                    packs[0].id,
                    saleId,
                    code,
                    pin,
                    packs[0].validity_days,
                  ]
                );
                await connection.execute(
                  `INSERT INTO finance_client_pack_balances(id,client_pack_id,service_id,total_sessions,remaining_sessions) SELECT UUID(),?,service_id,sessions,sessions FROM finance_pack_items WHERE pack_id=?`,
                  [clientPackId, packs[0].id]
                );
              }
            }
            if (item.item_type === 'voucher') {
              // A quantity of two in POS means two independently redeemable
              // vouchers, just as it already means two client packs. Do not
              // collapse them into one one-use voucher: that loses a code,
              // PIN, delivery record and audit trail for the second sale.
              for (let n = 0; n < Math.ceil(quantity); n++) {
                const code = String(
                    n === 0 && metadata.code
                      ? metadata.code
                      : randomBytes(5).toString('hex')
                  ).toUpperCase(),
                  pin = String(
                    n === 0 && metadata.pin_code != null
                      ? metadata.pin_code
                      : Math.floor(Math.random() * 1_000_000)
                  ).padStart(6, '0'),
                  face = Number(metadata.face_value ?? unit),
                  validity =
                    metadata.validity_days == null
                      ? null
                      : Number(metadata.validity_days);
                await connection.execute(
                  `INSERT INTO finance_vouchers(id,account_id,issued_sale_id,owner_contact_id,service_id,code,pin_code,voucher_type,remaining_uses,initial_balance,current_balance,currency,status,recipient_name,message,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'pending',?,?,IF(? IS NULL,NULL,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? DAY)))`,
                  [
                    randomUUID(),
                    context.accountId,
                    saleId,
                    optionalText(args.p_contact_id),
                    optionalText(metadata.service_id),
                    code,
                    pin,
                    String(metadata.voucher_type ?? 'gift_card'),
                    metadata.remaining_uses == null
                      ? String(metadata.voucher_type ?? 'gift_card') === 'service'
                        ? 1
                        : null
                      : Number(metadata.remaining_uses),
                    face,
                    face,
                    String(args.p_currency ?? 'EUR'),
                    optionalText(metadata.recipient_name),
                    optionalText(metadata.message),
                    validity,
                    validity,
                  ]
                );
              }
            }
          }
          for (const payment of payments)
            await addPayment(connection, {
              accountId: context.accountId,
              userId: context.userId,
              saleId,
              method: String(payment.method),
              amount: Number(payment.amount),
              cashSessionId: optionalText(args.p_cash_session_id),
              reference: optionalText(payment.reference_code),
              pin: optionalText(payment.pin_code),
              notes: optionalText(payment.notes),
            });
          // A complimentary voucher or pack has no payment to register, but
          // it is still a completed sale: issue its benefits immediately.
          if (total === 0 || alreadyPaidElsewhere) {
            await connection.execute(
              `UPDATE finance_sales
               SET status='paid',paid_amount=0,balance_due=0,
                   notes=CONCAT_WS('\\n',notes,IF(?,'Pagamento efetuado anteriormente noutra plataforma.','')),
                   completed_at=COALESCE(completed_at,UTC_TIMESTAMP(3))
               WHERE id=? AND status='open'`,
              [alreadyPaidElsewhere ? 1 : 0, saleId]
            );
          }
          const [sale] = await connection.execute<
            (RowDataPacket & { status: string })[]
          >('SELECT status FROM finance_sales WHERE id=?', [saleId]);
          if (sale[0]?.status === 'paid') {
            await connection.execute(
              "UPDATE finance_vouchers SET status='active' WHERE issued_sale_id=? AND status='pending'",
              [saleId]
            );
            await connection.execute(
              "UPDATE finance_client_packs SET status='active' WHERE sale_id=? AND status='pending'",
              [saleId]
            );
          }
        });
        const completedSale = await selectRows<
          (RowDataPacket & {
            id: string;
            status: string;
            balance_due: number;
          })[]
        >(
          'SELECT id,status,balance_due FROM finance_sales WHERE id=? AND account_id=? LIMIT 1',
          [saleId, context.accountId]
        );
        return ok(
          completedSale[0] ?? { id: saleId, status: 'open', balance_due: total }
        );
      }
      case 'set_member_role': {
        const role = String(args.p_new_role);
        if (!['admin', 'agent', 'viewer'].includes(role))
          throw new Error('Invalid role.');
        const result = await mutate(
          `UPDATE profiles SET account_role=? WHERE user_id=? AND account_id=? AND account_role<>'owner'`,
          [role, String(args.p_user_id), context.accountId]
        );
        if (!result.affectedRows)
          throw new Error('Member not found or owner role cannot be changed.');
        return ok(true);
      }
      case 'set_member_professional_settings': {
        const result = await mutate(
          `UPDATE profiles SET is_professional=?,professional_title=?,professional_color=?,professional_bio=?,professional_phone=?,professional_public_slug=?,professional_show_online=?,commission_executant_percent=?,commission_responsible_percent=?,working_hours=?,online_booking_blocked=? WHERE user_id=? AND account_id=?`,
          [
            Boolean(args.p_is_professional),
            optionalText(args.p_title),
            String(args.p_color ?? '#7c3aed'),
            optionalText(args.p_bio),
            optionalText(args.p_phone),
            optionalText(args.p_public_slug),
            Boolean(args.p_show_online),
            Number(args.p_commission_executant_percent ?? 0),
            Number(args.p_commission_responsible_percent ?? 0),
            JSON.stringify(args.p_working_hours ?? {}),
            Boolean(args.p_online_booking_blocked),
            String(args.p_user_id),
            context.accountId,
          ]
        );
        if (!result.affectedRows) throw new Error('Member not found.');
        return ok(true);
      }
      case 'transfer_account_ownership': {
        const target = String(args.p_new_owner_user_id);
        await transaction(async (connection) => {
          const [member] = await connection.execute<RowDataPacket[]>(
            'SELECT user_id FROM profiles WHERE user_id=? AND account_id=? FOR UPDATE',
            [target, context.accountId]
          );
          if (!member.length) throw new Error('Member not found.');
          await connection.execute(
            "UPDATE profiles SET account_role='admin' WHERE user_id=? AND account_id=?",
            [context.userId, context.accountId]
          );
          await connection.execute(
            "UPDATE profiles SET account_role='owner' WHERE user_id=? AND account_id=?",
            [target, context.accountId]
          );
          await connection.execute(
            'UPDATE accounts SET owner_user_id=? WHERE id=? AND owner_user_id=?',
            [target, context.accountId, context.userId]
          );
        });
        return ok(true);
      }
      case 'remove_account_member': {
        const target = String(args.p_user_id);
        const personalAccount = randomUUID();
        await transaction(async (connection) => {
          const [member] = await connection.execute<
            (RowDataPacket & { full_name: string })[]
          >(
            "SELECT full_name FROM profiles WHERE user_id=? AND account_id=? AND account_role<>'owner' FOR UPDATE",
            [target, context.accountId]
          );
          if (!member[0]) throw new Error('Member not found.');
          await connection.execute(
            'INSERT INTO accounts(id,name,owner_user_id) VALUES(?,?,?)',
            [personalAccount, member[0].full_name, target]
          );
          await connection.execute(
            "UPDATE profiles SET account_id=?,account_role='owner' WHERE user_id=?",
            [personalAccount, target]
          );
        });
        return ok(personalAccount);
      }
      case 'redeem_invitation': {
        const token = String(args.p_token_hash);
        let joined = '';
        await transaction(async (connection) => {
          const [invites] = await connection.execute<
            (RowDataPacket & {
              id: string;
              account_id: string;
              role: string;
              expires_at: Date;
              accepted_at: Date | null;
            })[]
          >(
            'SELECT id,account_id,role,expires_at,accepted_at FROM account_invitations WHERE token_hash=? FOR UPDATE',
            [token]
          );
          const invite = invites[0];
          if (!invite || invite.accepted_at || invite.expires_at <= new Date())
            throw new Error('Invitation is invalid or expired.');
          const [profiles] = await connection.execute<
            (RowDataPacket & { account_id: string; account_role: string })[]
          >(
            'SELECT account_id,account_role FROM profiles WHERE user_id=? FOR UPDATE',
            [context.userId]
          );
          const profile = profiles[0];
          if (!profile) throw new Error('Caller has no profile.');
          if (profile.account_id !== invite.account_id) {
            const [usage] = await connection.execute<
              (RowDataPacket & { total: number })[]
            >(
              `SELECT (SELECT COUNT(*) FROM contacts WHERE account_id=?)+(SELECT COUNT(*) FROM conversations WHERE account_id=?)+(SELECT COUNT(*) FROM deals WHERE account_id=?) total`,
              [profile.account_id, profile.account_id, profile.account_id]
            );
            if (profile.account_role !== 'owner' || Number(usage[0]?.total) > 0)
              throw new Error(
                'The current account contains data and cannot be replaced.'
              );
            await connection.execute(
              'UPDATE profiles SET account_id=?,account_role=? WHERE user_id=?',
              [invite.account_id, invite.role, context.userId]
            );
            await connection.execute('DELETE FROM accounts WHERE id=?', [
              profile.account_id,
            ]);
          }
          await connection.execute(
            'UPDATE account_invitations SET accepted_at=UTC_TIMESTAMP(3),accepted_by_user_id=? WHERE id=?',
            [context.userId, invite.id]
          );
          joined = invite.account_id;
        });
        return ok(joined);
      }
      case 'mark_referral_contacted': {
        const id = String(args.p_referral_id);
        const result = await mutate(
          `UPDATE referrals SET status=IF(status='registered','contacted',status),contacted_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=? AND status NOT IN('rejected','rewarded')`,
          [id, context.accountId]
        );
        if (!result.affectedRows)
          throw new Error('Referral cannot be contacted.');
        await mutate(
          `INSERT INTO referral_events(id,account_id,referral_id,action,actor_user_id) VALUES(?,?,?,'contacted',?)`,
          [randomUUID(), context.accountId, id, context.userId]
        );
        return ok(true);
      }
      case 'mark_referral_not_qualified': {
        const id = String(args.p_referral_id);
        const result = await mutate(
          `UPDATE referrals SET status='rejected',rejected_at=UTC_TIMESTAMP(3),lost_at=UTC_TIMESTAMP(3),rejection_code=?,rejection_reason=?,lost_reason=? WHERE id=? AND account_id=? AND status NOT IN('rewarded','rejected')`,
          [
            optionalText(args.p_reason_code),
            optionalText(args.p_reason),
            optionalText(args.p_reason),
            id,
            context.accountId,
          ]
        );
        if (!result.affectedRows) throw new Error('Referral cannot be closed.');
        await mutate(
          `INSERT INTO referral_events(id,account_id,referral_id,action,reason,actor_user_id,metadata) VALUES(?,?,?,'not_qualified',?,?,?)`,
          [
            randomUUID(),
            context.accountId,
            id,
            optionalText(args.p_reason),
            context.userId,
            JSON.stringify({ reason_code: args.p_reason_code }),
          ]
        );
        return ok(true);
      }
      case 'manage_referral_status': {
        const id = String(args.p_referral_id),
          status = String(args.p_status);
        if (
          !['contacted', 'scheduled', 'qualified', 'rejected'].includes(status)
        )
          throw new Error('Invalid referral status.');
        const timestamp =
          status === 'contacted'
            ? 'contacted_at'
            : status === 'scheduled'
              ? 'scheduled_at'
              : status === 'qualified'
                ? 'qualified_at'
                : 'rejected_at';
        await transaction(async (connection) => {
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE referrals SET status=?,${timestamp}=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?`,
            [status, id, context.accountId]
          );
          if (!result.affectedRows) throw new Error('Referral not found.');
          if (status === 'qualified') {
            await ensureReferralRewards(connection, context.accountId, id);
            await issuePendingReferrerCredits(
              connection,
              context.accountId,
              id,
              context.userId
            );
          }
          await connection.execute(
            'INSERT INTO referral_events(id,account_id,referral_id,action,actor_user_id) VALUES(?,?,?,?,?)',
            [randomUUID(), context.accountId, id, status, context.userId]
          );
        });
        return ok(true);
      }
      case 'qualify_referral_contact': {
        let changed = false;
        await transaction(async (connection) => {
          const [rows] = await connection.execute<
            (RowDataPacket & { id: string })[]
          >(
            `SELECT id FROM referrals WHERE account_id=? AND friend_contact_id=? AND status NOT IN('rewarded','rejected') FOR UPDATE`,
            [context.accountId, String(args.p_contact_id)]
          );
          for (const row of rows) {
            await connection.execute(
              `UPDATE referrals SET status='qualified',qualification_event=?,qualified_at=COALESCE(qualified_at,UTC_TIMESTAMP(3)) WHERE id=?`,
              [String(args.p_event), row.id]
            );
            await ensureReferralRewards(connection, context.accountId, row.id);
            await issuePendingReferrerCredits(
              connection,
              context.accountId,
              row.id,
              context.userId
            );
            changed = true;
          }
        });
        return ok(changed);
      }
      case 'reconcile_referral_rewards': {
        const referralId = String(args.p_referral_id);
        await transaction(async (connection) => {
          await ensureReferralRewards(
            connection,
            context.accountId,
            referralId
          );
          const [rows] = await connection.execute<
            (RowDataPacket & { status: string })[]
          >('SELECT status FROM referrals WHERE id=? AND account_id=?', [
            referralId,
            context.accountId,
          ]);
          if (['qualified', 'rewarded'].includes(rows[0]?.status))
            await issuePendingReferrerCredits(
              connection,
              context.accountId,
              referralId,
              context.userId
            );
          const [appointments] = await connection.execute<
            (RowDataPacket & {
              id: string;
              contact_id: string;
              service_id: string;
              price: number;
              original_price: number | null;
            })[]
          >(
            `SELECT id,contact_id,service_id,price,original_price FROM clinic_appointments WHERE account_id=? AND referral_id=? AND paid_at IS NULL AND status NOT IN('cancelled','no_show') ORDER BY scheduled_start LIMIT 1 FOR UPDATE`,
            [context.accountId, referralId]
          );
          const appointment = appointments[0];
          if (!appointment) {
            const [paidAppointments] = await connection.execute<
              RowDataPacket[]
            >(
              `SELECT id FROM clinic_appointments WHERE account_id=? AND referral_id=? AND paid_at IS NOT NULL AND status NOT IN('cancelled','no_show') LIMIT 1`,
              [context.accountId, referralId]
            );
            if (paidAppointments.length)
              await issuePendingReferrerCredits(
                connection,
                context.accountId,
                referralId,
                context.userId,
                'friend'
              );
          }
          if (appointment) {
            const [friendRewards] = await connection.execute<
              (RowDataPacket & {
                id: string;
                reward_type: string;
                reward_value: number;
                service_id: string | null;
                status: string;
              })[]
            >(
              `SELECT id,reward_type,reward_value,service_id,status FROM referral_rewards WHERE referral_id=? AND beneficiary_type='friend' AND contact_id=? FOR UPDATE`,
              [referralId, appointment.contact_id]
            );
            const reward = friendRewards[0];
            if (
              reward &&
              ['pending', 'issued'].includes(reward.status) &&
              (!reward.service_id || reward.service_id === appointment.service_id)
            ) {
              const original = Number(
                appointment.original_price ?? appointment.price
              );
              const raw =
                reward.reward_type === 'percentage'
                  ? (original * Number(reward.reward_value)) / 100
                  : reward.reward_type === 'fixed_credit'
                    ? Number(reward.reward_value)
                    : 0;
              const discount = Math.max(
                0,
                Math.min(original, Math.round(raw * 100) / 100)
              );
              if (discount > 0) {
                await connection.execute(
                  `UPDATE clinic_appointments SET original_price=?,referral_discount_type=?,referral_discount_value=?,referral_discount_amount=?,price=? WHERE id=?`,
                  [
                    original,
                    reward.reward_type,
                    reward.reward_value,
                    discount,
                    original - discount,
                    appointment.id,
                  ]
                );
                await connection.execute(
                  `UPDATE referral_rewards SET status='redeemed',redeemed_at=UTC_TIMESTAMP(3),available_amount=0,metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.appointment_id',?) WHERE id=?`,
                  [appointment.id, reward.id]
                );
              }
            }
          }
        });
        return ok(true);
      }
      case 'apply_referral_appointment_discount': {
        const appointmentId = String(args.p_appointment_id);
        let output: unknown = null;
        await transaction(async (connection) => {
          const [appointments] = await connection.execute<
            (RowDataPacket & {
              id: string;
              referral_id: string | null;
              contact_id: string;
              price: number;
              original_price: number | null;
              manual_discount_amount: number | null;
              service_id: string;
            })[]
          >(
            `SELECT id,referral_id,contact_id,price,original_price,manual_discount_amount,service_id FROM clinic_appointments WHERE id=? AND account_id=? FOR UPDATE`,
            [appointmentId, context.accountId]
          );
          const appointment = appointments[0];
          if (!appointment?.referral_id)
            throw new Error(
              'Esta marcação não está associada a uma indicação.'
            );
          await ensureReferralRewards(
            connection,
            context.accountId,
            appointment.referral_id
          );
          const [rewards] = await connection.execute<
            (RowDataPacket & {
              id: string;
              reward_type: string;
              reward_value: number;
              service_id: string | null;
              status: string;
            })[]
          >(
            `SELECT id,reward_type,reward_value,service_id,status FROM referral_rewards WHERE referral_id=? AND beneficiary_type='friend' AND contact_id=? FOR UPDATE`,
            [appointment.referral_id, appointment.contact_id]
          );
          const reward = rewards[0];
          const original = Number(
            appointment.original_price ?? appointment.price
          );
          const manualDiscount = Math.max(
            0,
            Math.min(original, Number(appointment.manual_discount_amount ?? 0))
          );
          let discount = 0;
          if (
            reward &&
            ['pending', 'issued'].includes(reward.status) &&
            (reward.service_id == null ||
              reward.service_id === appointment.service_id)
          ) {
            discount =
              reward.reward_type === 'percentage'
                ? (original * Number(reward.reward_value)) / 100
                : reward.reward_type === 'fixed_credit'
                  ? Number(reward.reward_value)
                  : 0;
            discount = Math.max(
              0,
              Math.min(
                Math.max(0, original - manualDiscount),
                Math.round(discount * 100) / 100
              )
            );
            if (discount > 0)
              await connection.execute(
                `UPDATE referral_rewards SET status='redeemed',redeemed_at=UTC_TIMESTAMP(3),available_amount=0,metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.appointment_id',?) WHERE id=?`,
                [appointmentId, reward.id]
              );
          }
          await connection.execute(
            `UPDATE clinic_appointments SET original_price=?,referral_discount_type=?,referral_discount_value=?,referral_discount_amount=?,price=? WHERE id=?`,
            [
              original,
              reward?.reward_type ?? null,
              reward?.reward_value ?? 0,
              discount,
              Math.max(0, original - manualDiscount - discount),
              appointmentId,
            ]
          );
          output = {
            original_price: original,
            discount_amount: discount,
            price: Math.max(0, original - manualDiscount - discount),
            reward_type: reward?.reward_type ?? null,
            reward_value: Number(reward?.reward_value ?? 0),
          };
        });
        return ok(output);
      }
      case 'pay_appointment_with_wallet': {
        const appointmentId = String(args.p_appointment_id);
        let output: unknown = null;
        await transaction(async (connection) => {
          const [appointments] = await connection.execute<
            (RowDataPacket & {
              id: string;
              contact_id: string | null;
              service_id: string;
              price: number;
              currency: string;
              paid_at: Date | null;
              service_name: string;
            })[]
          >(
            `SELECT a.id,a.contact_id,a.service_id,a.price,a.currency,a.paid_at,s.name service_name FROM clinic_appointments a JOIN clinic_services s ON s.id=a.service_id WHERE a.id=? AND a.account_id=? FOR UPDATE`,
            [appointmentId, context.accountId]
          );
          const appointment = appointments[0];
          if (!appointment?.contact_id)
            throw new Error('A marcação precisa de um cliente.');
          if (appointment.paid_at)
            throw new Error('Esta marcação já está paga.');
          let saleId: string;
          const [sales] = await connection.execute<
            (RowDataPacket & { id: string })[]
          >(
            `SELECT id FROM finance_sales WHERE appointment_id=? AND account_id=? AND status IN('open','partially_paid') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
            [appointmentId, context.accountId]
          );
          if (sales[0]) saleId = sales[0].id;
          else {
            saleId = randomUUID();
            const amount = Number(appointment.price);
            await connection.execute(
              `INSERT INTO finance_sales(id,account_id,contact_id,appointment_id,created_by_user_id,status,currency,subtotal,total_amount,balance_due,notes) VALUES(?,?,?,?,?,'open',?,?,?,?,?)`,
              [
                saleId,
                context.accountId,
                appointment.contact_id,
                appointmentId,
                context.userId,
                appointment.currency,
                amount,
                amount,
                amount,
                'Criada pela agenda',
              ]
            );
            await connection.execute(
              `INSERT INTO finance_sale_items(id,sale_id,account_id,item_type,source_id,name_snapshot,quantity,unit_price,line_total) VALUES(?,?,?,'service',?,?,1,?,?)`,
              [
                randomUUID(),
                saleId,
                context.accountId,
                appointment.service_id,
                appointment.service_name,
                amount,
                amount,
              ]
            );
          }
          const [saleRows] = await connection.execute<
            (RowDataPacket & { balance_due: number })[]
          >('SELECT balance_due FROM finance_sales WHERE id=? FOR UPDATE', [
            saleId,
          ]);
          const due = Number(saleRows[0]?.balance_due ?? 0);
          if (due <= 0)
            throw new Error('Não existe valor pendente nesta marcação.');
          await addPayment(connection, {
            accountId: context.accountId,
            userId: context.userId,
            saleId,
            method: 'client_credit',
            amount: due,
            cashSessionId: null,
            reference: null,
            pin: null,
            notes: 'Pagamento pela agenda',
          });
          output = { sale_id: saleId, amount: due };
        });
        return ok(output);
      }
      case 'issue_referral_reward': {
        const rewardId = String(args.p_reward_id);
        await transaction(async (connection) => {
          const [rows] = await connection.execute<
            (RowDataPacket & {
              account_id: string;
              contact_id: string | null;
              reward_type: string;
              reward_value: number;
              service_id: string | null;
              status: string;
              referral_id: string;
              reward_code: string;
              expires_at: Date | null;
            })[]
          >(
            'SELECT * FROM referral_rewards WHERE id=? AND account_id=? FOR UPDATE',
            [rewardId, context.accountId]
          );
          const reward = rows[0];
          if (!reward || reward.status !== 'pending' || !reward.contact_id)
            throw new Error('Reward cannot be issued.');
          if (reward.reward_type === 'fixed_credit') {
            const [wallets] = await connection.execute<
              (RowDataPacket & { id: string; balance: number })[]
            >(
              "SELECT id,balance FROM finance_client_wallets WHERE account_id=? AND contact_id=? AND currency='EUR' FOR UPDATE",
              [context.accountId, reward.contact_id]
            );
            const walletId = wallets[0]?.id ?? randomUUID(),
              old = Number(wallets[0]?.balance ?? 0),
              amount = Number(reward.reward_value);
            if (wallets[0])
              await connection.execute(
                'UPDATE finance_client_wallets SET balance=balance+? WHERE id=?',
                [amount, walletId]
              );
            else
              await connection.execute(
                "INSERT INTO finance_client_wallets(id,account_id,contact_id,currency,balance) VALUES(?,?,?,'EUR',?)",
                [walletId, context.accountId, reward.contact_id, amount]
              );
            await connection.execute(
              `INSERT INTO finance_wallet_transactions(id,account_id,wallet_id,transaction_type,amount,balance_after,referral_reward_id,performed_by_user_id,description) VALUES(?,?,?,'credit',?,?,?,?,?)`,
              [
                randomUUID(),
                context.accountId,
                walletId,
                amount,
                old + amount,
                rewardId,
                context.userId,
                'Recompensa de indicação',
              ]
            );
            await connection.execute(
              `UPDATE referral_rewards SET status='issued',issued_at=UTC_TIMESTAMP(3),issued_wallet_id=?,credited_amount=?,available_amount=? WHERE id=?`,
              [walletId, amount, amount, rewardId]
            );
          } else {
            const voucherId = randomUUID(),
              pin = String(Math.floor(Math.random() * 1_000_000)).padStart(
                6,
                '0'
              );
            await connection.execute(
              `INSERT INTO finance_vouchers(id,account_id,owner_contact_id,service_id,code,pin_code,voucher_type,remaining_uses,initial_balance,current_balance,status,expires_at) VALUES(?,?,?,?,?,?,'service',1,0,0,'active',?)`,
              [
                voucherId,
                context.accountId,
                reward.contact_id,
                reward.service_id,
                reward.reward_code,
                pin,
                reward.expires_at,
              ]
            );
            await connection.execute(
              `UPDATE referral_rewards SET status='issued',issued_at=UTC_TIMESTAMP(3),issued_voucher_id=? WHERE id=?`,
              [voucherId, rewardId]
            );
          }
          await connection.execute(
            "UPDATE referrals SET status='rewarded',rewarded_at=UTC_TIMESTAMP(3) WHERE id=? AND NOT EXISTS(SELECT 1 FROM referral_rewards WHERE referral_id=? AND status='pending')",
            [reward.referral_id, reward.referral_id]
          );
        });
        return ok(true);
      }
      case 'reverse_referral_reward': {
        const rewardId = String(args.p_reward_id),
          reason = String(args.p_reason ?? '').trim();
        if (!reason) throw new Error('Reason is required.');
        await transaction(async (connection) => {
          const [rows] = await connection.execute<
            (RowDataPacket & {
              issued_wallet_id: string | null;
              available_amount: number;
              status: string;
              referral_id: string;
            })[]
          >(
            'SELECT issued_wallet_id,available_amount,status,referral_id FROM referral_rewards WHERE id=? AND account_id=? FOR UPDATE',
            [rewardId, context.accountId]
          );
          const reward = rows[0];
          if (!reward || reward.status !== 'issued')
            throw new Error('Reward cannot be reversed.');
          if (reward.issued_wallet_id && Number(reward.available_amount) > 0) {
            const amount = Number(reward.available_amount);
            const [wallets] = await connection.execute<
              (RowDataPacket & { balance: number })[]
            >(
              'SELECT balance FROM finance_client_wallets WHERE id=? FOR UPDATE',
              [reward.issued_wallet_id]
            );
            if (!wallets[0] || Number(wallets[0].balance) < amount)
              throw new Error('Wallet balance is insufficient.');
            await connection.execute(
              'UPDATE finance_client_wallets SET balance=balance-? WHERE id=?',
              [amount, reward.issued_wallet_id]
            );
            await connection.execute(
              `INSERT INTO finance_wallet_transactions(id,account_id,wallet_id,transaction_type,amount,balance_after,referral_reward_id,performed_by_user_id,description) VALUES(?,?,?,'debit',?,?,?,?,?)`,
              [
                randomUUID(),
                context.accountId,
                reward.issued_wallet_id,
                -amount,
                Number(wallets[0].balance) - amount,
                null,
                context.userId,
                reason,
              ]
            );
          }
          await connection.execute(
            `UPDATE referral_rewards SET status='cancelled',reversed_amount=available_amount,available_amount=0,reversed_at=UTC_TIMESTAMP(3),reversed_by_user_id=?,reversal_reason=? WHERE id=?`,
            [context.userId, reason, rewardId]
          );
        });
        return ok(true);
      }
      case 'lookup_finance_benefit_code': {
        const code = String(args.p_code ?? '').trim();
        const vouchers = await selectRows<
          (RowDataPacket & {
            id: string;
            voucher_type: string;
            code: string;
            current_balance: number;
            currency: string;
            remaining_uses: number | null;
            service_id: string | null;
            expires_at: Date | null;
          })[]
        >(
          `SELECT id,voucher_type,code,current_balance,currency,remaining_uses,service_id,expires_at FROM finance_vouchers WHERE account_id=? AND UPPER(code)=UPPER(?) AND status='active' AND(expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) AND(current_balance>0 OR COALESCE(remaining_uses,0)>0) LIMIT 1`,
          [context.accountId, code]
        );
        if (vouchers[0]) {
          const v = vouchers[0];
          return ok({
            ...v,
            kind: 'voucher',
            label:
              v.voucher_type === 'service'
                ? 'Voucher de modalidade'
                : 'Cartão presente',
            balance: v.current_balance,
            requires_pin: true,
          });
        }
        const packs = await selectRows<
          (RowDataPacket & {
            id: string;
            code: string;
            expires_at: Date | null;
            label: string;
            total_sessions: number;
            remaining_sessions: number;
          })[]
        >(
          `SELECT p.id,p.code,p.expires_at,c.name label,SUM(b.total_sessions) total_sessions,SUM(b.remaining_sessions) remaining_sessions FROM finance_client_packs p JOIN finance_pack_catalog c ON c.id=p.pack_id JOIN finance_client_pack_balances b ON b.client_pack_id=p.id WHERE p.account_id=? AND UPPER(p.code)=UPPER(?) AND p.status='active' AND(p.expires_at IS NULL OR p.expires_at>UTC_TIMESTAMP()) GROUP BY p.id,p.code,p.expires_at,c.name LIMIT 1`,
          [context.accountId, code]
        );
        return ok(
          packs[0] ? { ...packs[0], kind: 'pack', requires_pin: true } : null
        );
      }
      case 'reserve_appointment_benefit_code':
      case 'reserve_appointment_voucher':
      case 'set_appointment_benefit': {
        const appointmentId = String(args.p_appointment_id);
        let output: unknown = null;
        await transaction(async (connection) => {
          const [appointments] = await connection.execute<
            (RowDataPacket & {
              id: string;
              account_id: string;
              contact_id: string;
              service_id: string;
              price: number;
            })[]
          >(
            'SELECT id,account_id,contact_id,service_id,price FROM clinic_appointments WHERE id=? AND account_id=? FOR UPDATE',
            [appointmentId, context.accountId]
          );
          const appointment = appointments[0];
          if (!appointment?.contact_id)
            throw new Error('Appointment requires a client.');
          await connection.execute(
            "UPDATE finance_appointment_benefits SET status='released',released_at=UTC_TIMESTAMP(3) WHERE appointment_id=? AND status='reserved'",
            [appointmentId]
          );
          let type = String(args.p_benefit_type ?? ''),
            source = optionalText(args.p_source_id);
          if (name !== 'set_appointment_benefit') {
            const [vouchers] = await connection.execute<
              (RowDataPacket & { id: string })[]
            >(
              `SELECT id FROM finance_vouchers WHERE account_id=? AND UPPER(code)=UPPER(?) AND pin_code=? AND status='active' AND(expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) ${name === 'reserve_appointment_voucher' ? 'AND owner_contact_id=?' : ''} LIMIT 1 FOR UPDATE`,
              name === 'reserve_appointment_voucher'
                ? [
                    context.accountId,
                    String(args.p_code).trim(),
                    String(args.p_pin).trim(),
                    appointment.contact_id,
                  ]
                : [
                    context.accountId,
                    String(args.p_code).trim(),
                    String(args.p_pin).trim(),
                  ]
            );
            if (vouchers[0]) {
              type = 'voucher';
              source = vouchers[0].id;
            } else {
              const [packs] = await connection.execute<
                (RowDataPacket & { id: string })[]
              >(
                `SELECT id FROM finance_client_packs WHERE account_id=? AND UPPER(code)=UPPER(?) AND pin_code=? AND status='active' AND(expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) LIMIT 1 FOR UPDATE`,
                [
                  context.accountId,
                  String(args.p_code).trim(),
                  String(args.p_pin).trim(),
                ]
              );
              if (!packs[0]) throw new Error('Invalid benefit code or PIN.');
              type = 'pack';
              source = packs[0].id;
            }
          }
          if (type === 'direct' || !source) {
            output = null;
            return;
          }
          const id = randomUUID();
          if (type === 'voucher') {
            const [vouchers] = await connection.execute<
              (RowDataPacket & {
                id: string;
                voucher_type: string;
                service_id: string | null;
                remaining_uses: number | null;
                current_balance: number;
              })[]
            >(
              "SELECT id,voucher_type,service_id,remaining_uses,current_balance FROM finance_vouchers WHERE id=? AND account_id=? AND status='active' FOR UPDATE",
              [source, context.accountId]
            );
            const voucher = vouchers[0];
            if (!voucher) throw new Error('Voucher unavailable.');
            if (
              voucher.voucher_type === 'service' &&
              (voucher.service_id !== appointment.service_id ||
                Number(voucher.remaining_uses) < 1)
            )
              throw new Error('Voucher is not valid for this service.');
            const [reserved] = await connection.execute<
              (RowDataPacket & { amount: number })[]
            >(
              "SELECT COALESCE(SUM(reserved_amount),0) amount FROM finance_appointment_benefits WHERE voucher_id=? AND status='reserved'",
              [source]
            );
            const amount =
              voucher.voucher_type === 'service'
                ? Number(appointment.price)
                : Math.min(
                    Number(appointment.price),
                    Number(voucher.current_balance) - Number(reserved[0].amount)
                  );
            if (amount <= 0)
              throw new Error('Voucher has no available balance.');
            await connection.execute(
              `INSERT INTO finance_appointment_benefits(id,account_id,appointment_id,contact_id,benefit_type,voucher_id,service_id,reserved_amount,created_by_user_id) VALUES(?,?,?,?, 'voucher',?,?,?,?)`,
              [
                id,
                context.accountId,
                appointmentId,
                appointment.contact_id,
                source,
                appointment.service_id,
                amount,
                context.userId,
              ]
            );
          } else if (type === 'pack') {
            const [balances] = await connection.execute<
              (RowDataPacket & { id: string; remaining_sessions: number })[]
            >(
              `SELECT b.id,b.remaining_sessions FROM finance_client_packs p JOIN finance_client_pack_balances b ON b.client_pack_id=p.id WHERE p.id=? AND p.account_id=? AND p.contact_id=? AND p.status='active' AND b.service_id=? FOR UPDATE`,
              [
                source,
                context.accountId,
                appointment.contact_id,
                appointment.service_id,
              ]
            );
            const balance = balances[0];
            if (!balance)
              throw new Error('Pack does not include this service.');
            const [reserved] = await connection.execute<
              (RowDataPacket & { sessions: number })[]
            >(
              "SELECT COALESCE(SUM(reserved_sessions),0) sessions FROM finance_appointment_benefits WHERE client_pack_balance_id=? AND status='reserved'",
              [balance.id]
            );
            if (
              Number(balance.remaining_sessions) -
                Number(reserved[0].sessions) <
              1
            )
              throw new Error('Pack has no available sessions.');
            await connection.execute(
              `INSERT INTO finance_appointment_benefits(id,account_id,appointment_id,contact_id,benefit_type,client_pack_id,client_pack_balance_id,service_id,reserved_sessions,created_by_user_id) VALUES(?,?,?,?, 'pack',?,?,?,?,?)`,
              [
                id,
                context.accountId,
                appointmentId,
                appointment.contact_id,
                source,
                balance.id,
                appointment.service_id,
                1,
                context.userId,
              ]
            );
          } else throw new Error('Invalid benefit type.');
          const [created] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM finance_appointment_benefits WHERE id=?',
            [id]
          );
          output = created[0];
        });
        return ok(output);
      }
      case 'settle_appointment_benefit': {
        const appointmentId = String(args.p_appointment_id),
          action = String(args.p_action);
        let output: unknown = null;
        await transaction(async (connection) => {
          const [rows] = await connection.execute<
            (RowDataPacket & {
              id: string;
              benefit_type: string;
              voucher_id: string | null;
              client_pack_id: string | null;
              client_pack_balance_id: string | null;
              reserved_amount: number;
              reserved_sessions: number;
            })[]
          >(
            "SELECT * FROM finance_appointment_benefits WHERE appointment_id=? AND account_id=? AND status='reserved' FOR UPDATE",
            [appointmentId, context.accountId]
          );
          const benefit = rows[0];
          if (!benefit) return;
          if (action === 'release') {
            await connection.execute(
              "UPDATE finance_appointment_benefits SET status='released',released_at=UTC_TIMESTAMP(3) WHERE id=?",
              [benefit.id]
            );
            output = { ...benefit, status: 'released' };
            return;
          }
          if (action !== 'consume')
            throw new Error('Invalid settlement action.');
          if (benefit.benefit_type === 'voucher') {
            const [vouchers] = await connection.execute<
              (RowDataPacket & { voucher_type: string })[]
            >(
              'SELECT voucher_type FROM finance_vouchers WHERE id=? FOR UPDATE',
              [benefit.voucher_id]
            );
            const sql =
              vouchers[0]?.voucher_type === 'service'
                ? `UPDATE finance_vouchers SET remaining_uses=remaining_uses-1,status=IF(remaining_uses-1=0,'used','active'),current_balance=IF(remaining_uses-1=0,0,current_balance) WHERE id=? AND remaining_uses>=1`
                : `UPDATE finance_vouchers SET current_balance=current_balance-?,status=IF(current_balance-?=0,'used','active') WHERE id=? AND current_balance>=?`;
            const params =
              vouchers[0]?.voucher_type === 'service'
                ? [benefit.voucher_id]
                : [
                    benefit.reserved_amount,
                    benefit.reserved_amount,
                    benefit.voucher_id,
                    benefit.reserved_amount,
                  ];
            const [result] = await connection.execute<ResultSetHeader>(
              sql,
              params
            );
            if (!result.affectedRows)
              throw new Error('Voucher is no longer available.');
          } else {
            const [result] = await connection.execute<ResultSetHeader>(
              'UPDATE finance_client_pack_balances SET used_sessions=used_sessions+?,remaining_sessions=remaining_sessions-? WHERE id=? AND remaining_sessions>=?',
              [
                benefit.reserved_sessions,
                benefit.reserved_sessions,
                benefit.client_pack_balance_id,
                benefit.reserved_sessions,
              ]
            );
            if (!result.affectedRows)
              throw new Error('Pack is no longer available.');
            await connection.execute(
              "UPDATE finance_client_packs SET status='consumed' WHERE id=? AND NOT EXISTS(SELECT 1 FROM finance_client_pack_balances WHERE client_pack_id=? AND remaining_sessions>0)",
              [benefit.client_pack_id, benefit.client_pack_id]
            );
          }
          await connection.execute(
            "UPDATE finance_appointment_benefits SET status='consumed',consumed_at=UTC_TIMESTAMP(3) WHERE id=?",
            [benefit.id]
          );
          await connection.execute(
            'UPDATE clinic_appointments SET paid_at=COALESCE(paid_at,UTC_TIMESTAMP(3)) WHERE id=?',
            [appointmentId]
          );
          output = { ...benefit, status: 'consumed' };
        });
        return ok(output);
      }
      case 'get_client_360_summary': {
        const id = String(args.p_contact_id);
        const rows = await selectRows<RowDataPacket[]>(
          `SELECT
          (SELECT COUNT(*) FROM clinic_appointments WHERE contact_id=?) appointments_total,
          (SELECT COUNT(*) FROM clinic_appointments WHERE contact_id=? AND status='completed') appointments_completed,
          (SELECT COUNT(*) FROM clinic_appointments WHERE contact_id=? AND status='no_show') appointments_no_show,
          (SELECT COUNT(*) FROM clinic_appointments WHERE contact_id=? AND scheduled_start>=UTC_TIMESTAMP() AND status NOT IN('cancelled','no_show')) appointments_upcoming,
          (SELECT MIN(scheduled_start) FROM clinic_appointments WHERE contact_id=? AND scheduled_start>=UTC_TIMESTAMP() AND status NOT IN('cancelled','no_show')) next_appointment_at,
          (SELECT MAX(scheduled_start) FROM clinic_appointments WHERE contact_id=? AND status='completed') last_completed_at,
          (SELECT COUNT(*) FROM finance_sales WHERE contact_id=? AND status NOT IN('voided','refunded')) sales_count,
          COALESCE((SELECT SUM(total_amount) FROM finance_sales WHERE contact_id=? AND status NOT IN('voided','refunded')),0) total_purchased,
          COALESCE((SELECT SUM(paid_amount) FROM finance_sales WHERE contact_id=? AND status NOT IN('voided','refunded')),0) total_received,
          COALESCE((SELECT SUM(balance_due) FROM finance_sales WHERE contact_id=? AND status NOT IN('voided','refunded')),0) total_due,
          COALESCE((SELECT AVG(total_amount) FROM finance_sales WHERE contact_id=? AND status NOT IN('voided','refunded')),0) average_ticket,
          (SELECT COUNT(*) FROM conversations WHERE contact_id=?) conversations_total,COALESCE((SELECT SUM(unread_count) FROM conversations WHERE contact_id=?),0) unread_total,
          (SELECT COUNT(*) FROM deals WHERE contact_id=? AND status='open') active_deals,COALESCE((SELECT SUM(value) FROM deals WHERE contact_id=? AND status='open'),0) active_deal_value,
          COALESCE((SELECT SUM(balance) FROM finance_client_wallets WHERE contact_id=?),0) wallet_balance,
          (SELECT COUNT(*) FROM finance_vouchers WHERE owner_contact_id=? AND status='active' AND(expires_at IS NULL OR expires_at>UTC_TIMESTAMP())) active_vouchers,
          (SELECT COUNT(*) FROM finance_client_packs WHERE contact_id=? AND status='active' AND(expires_at IS NULL OR expires_at>UTC_TIMESTAMP())) active_packs,
          COALESCE((SELECT SUM(b.remaining_sessions) FROM finance_client_packs p JOIN finance_client_pack_balances b ON b.client_pack_id=p.id WHERE p.contact_id=? AND p.status='active'),0) pack_sessions_remaining`,
          Array(19).fill(id)
        );
        return ok(rows[0]);
      }
      case 'reverse_finance_sale': {
        const saleId = String(args.p_sale_id),
          mode = String(args.p_mode),
          reason = String(args.p_reason ?? '').trim();
        if (!['void', 'refund'].includes(mode) || !reason)
          throw new Error('Invalid reversal.');
        await transaction(async (connection) => {
          const [sales] = await connection.execute<
            (RowDataPacket & { status: string })[]
          >(
            'SELECT status FROM finance_sales WHERE id=? AND account_id=? FOR UPDATE',
            [saleId, context.accountId]
          );
          if (!sales[0] || ['voided', 'refunded'].includes(sales[0].status))
            throw new Error('Sale cannot be reversed.');
          const [items] = await connection.execute<
            (RowDataPacket & { source_id: string; quantity: number })[]
          >(
            "SELECT source_id,quantity FROM finance_sale_items WHERE sale_id=? AND item_type='product'",
            [saleId]
          );
          for (const item of items) {
            const quantity = Math.ceil(Number(item.quantity));
            await connection.execute(
              'UPDATE clinic_products SET stock_quantity=stock_quantity+? WHERE id=?',
              [quantity, item.source_id]
            );
            const [stock] = await connection.execute<
              (RowDataPacket & { stock_quantity: number })[]
            >('SELECT stock_quantity FROM clinic_products WHERE id=?', [
              item.source_id,
            ]);
            await connection.execute(
              `INSERT INTO finance_stock_movements(id,account_id,product_id,sale_id,user_id,movement_type,quantity,stock_after,notes) VALUES(?,?,?,?,?,'return',?,?,?)`,
              [
                randomUUID(),
                context.accountId,
                item.source_id,
                saleId,
                context.userId,
                quantity,
                stock[0].stock_quantity,
                reason,
              ]
            );
          }
          await connection.execute(
            `UPDATE finance_payments SET status=? WHERE sale_id=? AND status='confirmed'`,
            [mode === 'refund' ? 'refunded' : 'voided', saleId]
          );
          await connection.execute(
            `UPDATE finance_sales SET status=?,${mode === 'refund' ? 'refund_reason' : 'void_reason'}=?,${mode === 'refund' ? 'refunded_at' : 'voided_at'}=UTC_TIMESTAMP(3),reversed_by_user_id=?,balance_due=0 WHERE id=?`,
            [
              mode === 'refund' ? 'refunded' : 'voided',
              reason,
              context.userId,
              saleId,
            ]
          );
          await connection.execute(
            "UPDATE finance_vouchers SET status='cancelled' WHERE issued_sale_id=? AND status IN('pending','active')",
            [saleId]
          );
          await connection.execute(
            "UPDATE finance_client_packs SET status='cancelled' WHERE sale_id=? AND status IN('pending','active')",
            [saleId]
          );
        });
        return ok(true);
      }
      case 'approve_complimentary_finance_sale': {
        const saleId = String(args.p_sale_id);
        await transaction(async (connection) => {
          const [sales] = await connection.execute<
            (RowDataPacket & {
              status: string;
              total_amount: number;
              balance_due: number;
            })[]
          >(
            `SELECT status,total_amount,balance_due FROM finance_sales
             WHERE id=? AND account_id=? FOR UPDATE`,
            [saleId, context.accountId]
          );
          const sale = sales[0];
          if (!sale || !['open', 'partially_paid'].includes(sale.status))
            throw new Error('Esta venda já não pode ser aprovada.');
          if (Number(sale.total_amount) !== 0 || Number(sale.balance_due) !== 0)
            throw new Error('Só é possível aprovar vendas sem valor por receber.');
          await connection.execute(
            `UPDATE finance_sales
             SET status='paid',paid_amount=0,balance_due=0,
                 completed_at=COALESCE(completed_at,UTC_TIMESTAMP(3))
             WHERE id=?`,
            [saleId]
          );
          await connection.execute(
            "UPDATE finance_vouchers SET status='active' WHERE issued_sale_id=? AND status='pending'",
            [saleId]
          );
          await connection.execute(
            "UPDATE finance_client_packs SET status='active' WHERE sale_id=? AND status='pending'",
            [saleId]
          );
        });
        return ok(true);
      }
      case 'confirm_external_payment_link': {
        const provider = String(args.p_provider),
          session = String(args.p_external_session_id);
        await transaction(async (connection) => {
          const [links] = await connection.execute<
            (RowDataPacket & {
              id: string;
              account_id: string;
              sale_id: string | null;
              amount: number;
              status: string;
              created_by_user_id: string | null;
            })[]
          >(
            'SELECT * FROM finance_payment_links WHERE provider=? AND external_session_id=? FOR UPDATE',
            [provider, session]
          );
          const link = links[0];
          if (!link) throw new Error('Payment link not found.');
          if (link.status === 'paid') return;
          if (link.sale_id)
            await addPayment(connection, {
              accountId: link.account_id,
              userId: link.created_by_user_id ?? context.userId,
              saleId: link.sale_id,
              method: 'card',
              amount: Number(link.amount),
              cashSessionId: null,
              reference: link.id,
              pin: null,
              notes: `Pagamento ${provider}`,
            });
          await connection.execute(
            `UPDATE finance_payment_links SET status='paid',paid_at=UTC_TIMESTAMP(3),external_payment_intent_id=?,provider_payload=? WHERE id=?`,
            [
              optionalText(args.p_external_payment_intent_id),
              JSON.stringify(args.p_payload ?? {}),
              link.id,
            ]
          );
        });
        return ok(true);
      }
      case 'merge_contacts': {
        const source = String(args.p_source_contact_id),
          target = String(args.p_target_contact_id);
        if (source === target) throw new Error('Choose two different clients.');
        await transaction(async (connection) => {
          const [contacts] = await connection.execute<
            (RowDataPacket & {
              id: string;
              account_id: string;
              name: string | null;
              email: string | null;
              company: string | null;
            })[]
          >(
            'SELECT id,account_id,name,email,company FROM contacts WHERE id IN(?,?) AND account_id=? FOR UPDATE',
            [source, target, context.accountId]
          );
          const src = contacts.find((c) => c.id === source),
            dst = contacts.find((c) => c.id === target);
          if (!src || !dst) throw new Error('Client not found.');
          await connection.execute(
            `UPDATE contacts SET name=COALESCE(NULLIF(name,''),?),email=COALESCE(NULLIF(email,''),?),company=COALESCE(NULLIF(company,''),?) WHERE id=?`,
            [src.name, src.email, src.company, target]
          );
          await connection.execute(
            'INSERT IGNORE INTO contact_tags(contact_id,tag_id,created_at) SELECT ?,tag_id,created_at FROM contact_tags WHERE contact_id=?',
            [target, source]
          );
          await connection.execute(
            'DELETE FROM contact_tags WHERE contact_id=?',
            [source]
          );
          await connection.execute(
            'UPDATE IGNORE contact_custom_values SET contact_id=? WHERE contact_id=?',
            [target, source]
          );
          await connection.execute(
            'DELETE FROM contact_custom_values WHERE contact_id=?',
            [source]
          );
          const [convs] = await connection.execute<
            (RowDataPacket & { id: string; contact_id: string })[]
          >(
            'SELECT id,contact_id FROM conversations WHERE contact_id IN(?,?) AND account_id=? FOR UPDATE',
            [source, target, context.accountId]
          );
          const sourceConv = convs.find((c) => c.contact_id === source),
            targetConv = convs.find((c) => c.contact_id === target);
          if (sourceConv && targetConv) {
            for (const table of ['messages', 'message_reactions'])
              await connection.query(
                `UPDATE \`${table}\` SET conversation_id=? WHERE conversation_id=?`,
                [targetConv.id, sourceConv.id]
              );
            for (const table of [
              'deals',
              'flow_runs',
              'notifications',
              'ai_usage_log',
            ])
              await connection.query(
                `UPDATE \`${table}\` SET conversation_id=? WHERE conversation_id=?`,
                [targetConv.id, sourceConv.id]
              );
            await connection.execute('DELETE FROM conversations WHERE id=?', [
              sourceConv.id,
            ]);
          } else if (sourceConv)
            await connection.execute(
              'UPDATE conversations SET contact_id=? WHERE id=?',
              [target, sourceConv.id]
            );
          for (const table of [
            'contact_notes',
            'deals',
            'broadcast_recipients',
            'automation_logs',
            'automation_pending_executions',
            'flow_runs',
            'clinic_appointments',
            'clinic_anamnesis_forms',
            'finance_sales',
            'finance_invoice_requests',
            'finance_appointment_benefits',
            'finance_client_packs',
            'finance_payables',
            'finance_receivable_schedules',
            'referral_rewards',
            'client_activity_events',
            'portal_notifications',
            'push_subscriptions',
            'support_tickets',
            'public_site_leads',
            'notifications',
            'scheduled_whatsapp_messages',
            'crm_tasks',
          ])
            await connection.query(
              `UPDATE \`${table}\` SET contact_id=? WHERE contact_id=?`,
              [target, source]
            );
          await connection.execute(
            'UPDATE finance_vouchers SET owner_contact_id=? WHERE owner_contact_id=?',
            [target, source]
          );
          await connection.execute(
            'UPDATE referrals SET referrer_contact_id=? WHERE referrer_contact_id=?',
            [target, source]
          );
          await connection.execute(
            'UPDATE referrals SET friend_contact_id=? WHERE friend_contact_id=?',
            [target, source]
          );
          const [wallets] = await connection.execute<
            (RowDataPacket & {
              id: string;
              currency: string;
              balance: number;
            })[]
          >(
            'SELECT id,currency,balance FROM finance_client_wallets WHERE contact_id=? FOR UPDATE',
            [source]
          );
          for (const wallet of wallets) {
            const [existing] = await connection.execute<
              (RowDataPacket & { id: string })[]
            >(
              'SELECT id FROM finance_client_wallets WHERE account_id=? AND contact_id=? AND currency=? FOR UPDATE',
              [context.accountId, target, wallet.currency]
            );
            if (existing[0]) {
              await connection.execute(
                'UPDATE finance_client_wallets SET balance=balance+? WHERE id=?',
                [wallet.balance, existing[0].id]
              );
              await connection.execute(
                'UPDATE finance_wallet_transactions SET wallet_id=? WHERE wallet_id=?',
                [existing[0].id, wallet.id]
              );
              await connection.execute(
                'DELETE FROM finance_client_wallets WHERE id=?',
                [wallet.id]
              );
            } else
              await connection.execute(
                'UPDATE finance_client_wallets SET contact_id=? WHERE id=?',
                [target, wallet.id]
              );
          }
          await connection.execute('DELETE FROM contacts WHERE id=?', [source]);
        });
        return ok({
          merged: true,
          source_contact_id: source,
          target_contact_id: target,
        });
      }
      case 'settle_owner_payable': {
        const id = String(args.p_payable_id),
          method = String(args.p_payment_method ?? 'bank_transfer');
        await transaction(async (connection) => {
          const [rows] = await connection.execute<
            (RowDataPacket & {
              amount: number;
              description: string;
              status: string;
            })[]
          >(
            'SELECT amount,description,status FROM finance_payables WHERE id=? AND account_id=? FOR UPDATE',
            [id, context.accountId]
          );
          const row = rows[0];
          if (!row || row.status !== 'pending')
            throw new Error('A conta já foi liquidada ou não existe.');
          let movementId: null | string = null;
          if (method === 'cash') {
            if (!args.p_cash_session_id) throw new Error('Selecione o caixa.');
            movementId = randomUUID();
            const [result] = await connection.execute<ResultSetHeader>(
              `INSERT INTO finance_cash_movements(id,account_id,cash_session_id,movement_type,amount,description,reference,payment_method,created_by_user_id) SELECT ?,account_id,id,'expense',?,?,?,'cash',? FROM finance_cash_sessions WHERE id=? AND account_id=? AND status='open'`,
              [
                movementId,
                row.amount,
                row.description,
                optionalText(args.p_payment_reference),
                context.userId,
                String(args.p_cash_session_id),
                context.accountId,
              ]
            );
            if (!result.affectedRows)
              throw new Error('Caixa aberto não encontrado.');
          }
          await connection.execute(
            `UPDATE finance_payables SET status='paid',paid_at=UTC_TIMESTAMP(3),payment_method=?,payment_reference=?,cash_movement_id=? WHERE id=?`,
            [method, optionalText(args.p_payment_reference), movementId, id]
          );
        });
        return ok(true);
      }
      case 'settle_owner_receivable': {
        const id = String(args.p_receivable_id),
          method = String(args.p_payment_method ?? 'bank_transfer');
        await transaction(async (connection) => {
          const [rows] = await connection.execute<
            (RowDataPacket & {
              amount: number;
              description: string;
              status: string;
              sale_id: string | null;
            })[]
          >(
            'SELECT amount,description,status,sale_id FROM finance_receivable_schedules WHERE id=? AND account_id=? FOR UPDATE',
            [id, context.accountId]
          );
          const row = rows[0];
          if (!row || row.status !== 'pending')
            throw new Error('A prestação já foi liquidada ou não existe.');
          let paymentId: null | string = null;
          if (row.sale_id) {
            await addPayment(connection, {
              accountId: context.accountId,
              userId: context.userId,
              saleId: row.sale_id,
              method,
              amount: Number(row.amount),
              cashSessionId: optionalText(args.p_cash_session_id),
              reference: optionalText(args.p_payment_reference),
              pin: null,
              notes: 'Recebido pela tesouraria privada',
            });
            const [payments] = await connection.execute<
              (RowDataPacket & { id: string })[]
            >(
              'SELECT id FROM finance_payments WHERE sale_id=? ORDER BY created_at DESC LIMIT 1',
              [row.sale_id]
            );
            paymentId = payments[0]?.id ?? null;
          } else if (method === 'cash' && args.p_cash_session_id) {
            const [result] = await connection.execute<ResultSetHeader>(
              `INSERT INTO finance_cash_movements(id,account_id,cash_session_id,movement_type,amount,description,reference,payment_method,created_by_user_id) SELECT ?,account_id,id,'deposit',?,?,?,'cash',? FROM finance_cash_sessions WHERE id=? AND account_id=? AND status='open'`,
              [
                randomUUID(),
                row.amount,
                row.description,
                optionalText(args.p_payment_reference),
                context.userId,
                String(args.p_cash_session_id),
                context.accountId,
              ]
            );
            if (!result.affectedRows)
              throw new Error('Caixa aberto não encontrado.');
          }
          await connection.execute(
            `UPDATE finance_receivable_schedules SET status='received',received_at=UTC_TIMESTAMP(3),payment_method=?,payment_reference=?,payment_id=? WHERE id=?`,
            [method, optionalText(args.p_payment_reference), paymentId, id]
          );
        });
        return ok(true);
      }
      case 'adjust_clinic_product_stock': {
        await transaction(async (connection) => {
          const [rows] = await connection.execute<
            (RowDataPacket & { stock_quantity: number })[]
          >(
            'SELECT stock_quantity FROM clinic_products WHERE id=? AND account_id=? FOR UPDATE',
            [String(args.p_product_id), context.accountId]
          );
          const product = rows[0];
          if (!product) throw new Error('Product not found.');
          const quantity = Number(args.p_quantity);
          const next = product.stock_quantity + quantity;
          if (!Number.isInteger(quantity) || next < 0)
            throw new Error('Invalid stock adjustment.');
          await connection.execute(
            'UPDATE clinic_products SET stock_quantity=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?',
            [next, String(args.p_product_id)]
          );
          await connection.execute(
            `INSERT INTO finance_stock_movements(id,account_id,product_id,user_id,movement_type,quantity,stock_after,notes)
            VALUES(?,?,?,?,?,?,?,?)`,
            [
              randomUUID(),
              context.accountId,
              String(args.p_product_id),
              context.userId,
              String(args.p_movement_type ?? 'adjustment'),
              quantity,
              next,
              args.p_reason == null ? null : String(args.p_reason),
            ]
          );
        });
        return ok(true);
      }
      default:
        return {
          data: null,
          error: {
            message: `Local MySQL operation is not implemented: ${name}`,
          },
        };
    }
  } catch (cause) {
    return failed(cause);
  }
}
