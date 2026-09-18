import 'server-only';

import type { RowDataPacket } from 'mysql2';
import { db } from '@/lib/mysql/db';

type Relation = { target: string; local: string; foreign: string; many?: boolean };
const r = (target: string, local: string, foreign = 'id', many = false): Relation => ({ target, local, foreign, many });

const relations: Record<string, Record<string, Relation>> = {
  automation_logs: { contact: r('contacts','contact_id'), automation: r('automations','automation_id') },
  broadcast_recipients: { contact: r('contacts','contact_id'), broadcast: r('broadcasts','broadcast_id') },
  deals: { contact: r('contacts','contact_id'), assignee: r('profiles','assigned_to'), stage: r('pipeline_stages','stage_id'), pipeline: r('pipelines','pipeline_id') },
  clinic_anamnesis_forms: { service: r('clinic_services','service_id'), appointment: r('clinic_appointments','appointment_id'), account: r('accounts','account_id') },
  finance_invoice_requests: { sale: r('finance_sales','sale_id'), contact: r('contacts','contact_id') },
  finance_payment_links: { sale: r('finance_sales','sale_id'), contact: r('contacts','contact_id') },
  finance_reminder_deliveries: { notification: r('notifications','notification_id') },
  flow_runs: { contact: r('contacts','contact_id'), flows: r('flows','flow_id') },
  referrals: { referrer: r('contacts','referrer_contact_id'), friend: r('contacts','friend_contact_id'), code: r('referral_codes','referral_code_id'), rewards: r('referral_rewards','id','referral_id',true), events: r('referral_events','id','referral_id',true) },
  referral_rewards: { service: r('clinic_services','service_id'), voucher: r('finance_vouchers','issued_voucher_id'), wallet: r('finance_client_wallets','issued_wallet_id') },
  referral_codes: { referrer: r('contacts','contact_id'), account: r('accounts','account_id') },
  message_reactions: { contact: r('contacts','contact_id'), conversations: r('conversations','conversation_id') },
  messages: { conversation: r('conversations','conversation_id'), conversations: r('conversations','conversation_id') },
  conversations: { contact: r('contacts','contact_id') },
  public_site_settings: { account: r('accounts','account_id') },
  clinic_appointments: { contact: r('contacts','contact_id'), service: r('clinic_services','service_id'), room: r('clinic_rooms','room_id'), professional: r('profiles','professional_profile_id'), account: r('accounts','account_id'), anamnesis: r('clinic_anamnesis_forms','anamnesis_form_id'), benefits: r('finance_appointment_benefits','id','appointment_id',true), sales: r('finance_sales','id','appointment_id',true) },
  clinic_time_blocks: { room: r('clinic_rooms','room_id'), professional: r('profiles','professional_profile_id') },
  finance_appointment_benefits: { voucher: r('finance_vouchers','voucher_id'), client_pack: r('finance_client_packs','client_pack_id'), client_pack_balance: r('finance_client_pack_balances','client_pack_balance_id'), appointment: r('clinic_appointments','appointment_id') },
  finance_vouchers: { owner: r('contacts','owner_contact_id'), service: r('clinic_services','service_id'), account: r('accounts','account_id') },
  finance_pack_catalog: { items: r('finance_pack_items','id','pack_id',true) },
  finance_pack_items: { service: r('clinic_services','service_id') },
  finance_client_packs: { contact: r('contacts','contact_id'), pack: r('finance_pack_catalog','pack_id'), balances: r('finance_client_pack_balances','id','client_pack_id',true) },
  finance_client_pack_balances: { service: r('clinic_services','service_id') },
  finance_sales: { contact: r('contacts','contact_id'), appointment: r('clinic_appointments','appointment_id'), items: r('finance_sale_items','id','sale_id',true), payments: r('finance_payments','id','sale_id',true) },
  finance_stock_movements: { product: r('clinic_products','product_id') },
  finance_goals: { entries: r('finance_goal_entries','id','goal_id',true) },
  finance_wallet_transactions: { wallet: r('finance_client_wallets','wallet_id') },
  finance_client_wallets: { contact: r('contacts','contact_id') },
  finance_voucher_transfer_requests: { voucher: r('finance_vouchers','voucher_id') },
  finance_fiscal_documents: { sale: r('finance_sales','sale_id'), contact: r('contacts','contact_id'), invoice_request: r('finance_invoice_requests','invoice_request_id') },
  contact_tags: { tag: r('tags','tag_id'), tags: r('tags','tag_id') },
  contacts: { tags: r('contact_tags','id','contact_id',true) },
  crm_tasks: { contact: r('contacts','contact_id') },
  scheduled_whatsapp_messages: { contact: r('contacts','contact_id') },
  pipeline_stages: { pipeline: r('pipelines','pipeline_id') },
  automation_pending_executions: { automation: r('automations','automation_id') },
  portal_campaigns: { enrollments: r('portal_campaign_enrollments','id','campaign_id',true) },
  portal_campaign_enrollments: { contact: r('contacts','contact_id') },
  support_tickets: { messages: r('support_ticket_messages','id','ticket_id',true), contact: r('contacts','contact_id') },
  social_scheduled_posts: { segment: r('contact_segments','segment_id') },
  work_sessions: { breaks: r('work_breaks','id','session_id',true) },
};

type Node = { alias: string; children: Node[] };
function parse(selection: string): Node[] {
  const result: Node[] = []; let token = ''; let depth = 0;
  const flush = () => { const value = token.trim(); token = ''; if (!value || !value.includes('(')) return; const open = value.indexOf('('); const head = value.slice(0,open).trim().replace(/!.*$/,''); const alias = head.includes(':') ? head.split(':')[0].trim() : head; result.push({ alias, children: parse(value.slice(open+1,-1)) }); };
  for (const char of selection) { if (char === '(') depth++; if (char === ')') depth--; if (char === ',' && depth === 0) flush(); else token += char; } flush(); return result;
}

export async function hydrateRelationships(table: string, selection: string | undefined, source: RowDataPacket[]) {
  if (!selection?.includes('(') || !source.length) return source;
  await hydrate(table, source as Record<string, unknown>[], parse(selection)); return source;
}

async function hydrate(table: string, rows: Record<string, unknown>[], nodes: Node[]) {
  for (const node of nodes) {
    const relation = relations[table]?.[node.alias]; if (!relation) continue;
    const keys = [...new Set(rows.map((row) => row[relation.local]).filter((value) => value != null).map(String))];
    if (!keys.length) { for (const row of rows) row[node.alias] = relation.many ? [] : null; continue; }
    const placeholders = keys.map(() => '?').join(',');
    const [related] = await db().execute<RowDataPacket[]>(`SELECT * FROM \`${relation.target}\` WHERE \`${relation.foreign}\` IN (${placeholders})`, keys);
    await hydrate(relation.target, related as Record<string, unknown>[], node.children);
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const item of related) { const key = String(item[relation.foreign]); grouped.set(key, [...(grouped.get(key) ?? []), item]); }
    for (const row of rows) { const found = grouped.get(String(row[relation.local])) ?? []; row[node.alias] = relation.many ? found : (found[0] ?? null); }
  }
}
