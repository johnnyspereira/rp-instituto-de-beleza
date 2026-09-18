import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';

type AutomationRule = {
  id: string;
  account_id: string;
  user_id: string | null;
  name: string;
  trigger_type: 'birthday' | 'inactivity';
  days_before: number;
  inactivity_days: number;
  send_time: string;
  message_text: string;
};

type ContactRow = {
  id: string;
  name: string | null;
  phone: string | null;
  birth_date?: string | null;
};

function isAuthorized(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected)
    return { ok: false, status: 503, error: 'cron not configured' };

  const supplied = request.headers.get('x-cron-secret') ?? '';
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);

  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true, status: 200, error: null };
}

function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function scheduledAtForToday(sendTime: string) {
  const [hours = '9', minutes = '0'] = sendTime.split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  if (date.getTime() <= Date.now()) {
    date.setMinutes(date.getMinutes() + 5);
  }
  return date.toISOString();
}

function formatMessage(
  template: string,
  contact: ContactRow,
  rule: AutomationRule
) {
  return template
    .replaceAll('{{nome}}', contact.name?.trim() || 'tudo bem')
    .replaceAll('{{telefone}}', contact.phone || '')
    .replaceAll('{{dias_inativo}}', String(rule.inactivity_days));
}

export async function GET(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = supabaseAdmin();
  const today = new Date();
  const todayKey = isoDay(today);

  const { data: rules, error } = await admin
    .from('marketing_automation_rules')
    .select(
      'id, account_id, user_id, name, trigger_type, days_before, inactivity_days, send_time, message_text'
    )
    .eq('is_active', true)
    .limit(100);

  if (error) {
    console.error('[marketing-automation] scan failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rulesProcessed = 0;
  let candidates = 0;
  let created = 0;
  let skipped = 0;

  for (const rule of (rules ?? []) as AutomationRule[]) {
    rulesProcessed++;
    const contacts = await findContactsForRule(rule, today);
    candidates += contacts.length;

    for (const contact of contacts) {
      const runKey =
        rule.trigger_type === 'birthday'
          ? `${todayKey}:birthday:${rule.days_before}`
          : `${todayKey}:inactivity:${rule.inactivity_days}`;

      const { data: logRow, error: logError } = await admin
        .from('marketing_automation_dispatch_log')
        .insert({
          account_id: rule.account_id,
          rule_id: rule.id,
          contact_id: contact.id,
          run_key: runKey,
        })
        .select('id')
        .single();

      if (logError || !logRow?.id) {
        skipped++;
        continue;
      }

      const { data: message, error: messageError } = await admin
        .from('scheduled_whatsapp_messages')
        .insert({
          account_id: rule.account_id,
          user_id: rule.user_id,
          contact_id: contact.id,
          content_text: formatMessage(rule.message_text, contact, rule),
          scheduled_at: scheduledAtForToday(rule.send_time),
          status: 'scheduled',
        })
        .select('id')
        .single();

      if (messageError || !message?.id) {
        console.error(
          '[marketing-automation] schedule failed:',
          messageError?.message
        );
        skipped++;
        continue;
      }

      await admin
        .from('marketing_automation_dispatch_log')
        .update({ scheduled_message_id: message.id })
        .eq('id', logRow.id);
      created++;
    }

    await admin
      .from('marketing_automation_rules')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', rule.id);
  }

  return NextResponse.json({ rulesProcessed, candidates, created, skipped });
}

async function findContactsForRule(rule: AutomationRule, today: Date) {
  if (rule.trigger_type === 'birthday') {
    const target = new Date(today);
    target.setDate(target.getDate() + Number(rule.days_before || 0));
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');

    const { data, error } = await supabaseAdmin()
      .from('contacts')
      .select('id, name, phone, birth_date')
      .eq('account_id', rule.account_id)
      .not('birth_date', 'is', null)
      .filter('marketing_consent', 'is', true)
      .filter('marketing_whatsapp_consent', 'is', true)
      .eq('privacy_review_status', 'current')
      .limit(2000);

    if (error) {
      console.error('[marketing-automation] birthday contacts failed:', error);
      return [];
    }

    return ((data ?? []) as ContactRow[]).filter((contact) => {
      const birthDate = contact.birth_date;
      return birthDate?.slice(5, 10) === `${month}-${day}`;
    });
  }

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - Number(rule.inactivity_days || 30));

  const { data, error } = await supabaseAdmin()
    .from('contacts')
    .select('id, name, phone, conversations!left(last_message_at, created_at)')
    .eq('account_id', rule.account_id)
    .filter('marketing_consent', 'is', true)
    .filter('marketing_whatsapp_consent', 'is', true)
    .eq('privacy_review_status', 'current')
    .limit(2000);

  if (error) {
    console.error('[marketing-automation] inactivity contacts failed:', error);
    return [];
  }

  return (
    (data ?? []) as Array<
      ContactRow & {
        conversations?: Array<{
          last_message_at: string | null;
          created_at: string | null;
        }>;
      }
    >
  ).filter((contact) => {
    const last = contact.conversations
      ?.map(
        (conversation) =>
          conversation.last_message_at ?? conversation.created_at
      )
      .filter(Boolean)
      .sort()
      .at(-1);
    return !last || new Date(last).getTime() <= cutoff.getTime();
  });
}
