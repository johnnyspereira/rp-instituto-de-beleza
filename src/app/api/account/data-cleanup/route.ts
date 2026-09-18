import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ForbiddenError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { isMissingSchemaError } from '@/lib/mysql/schema-errors';

const CONFIRM_TEXT = 'ZERAR TESTE';

const MODULE_KEYS = [
  'inbox',
  'clients',
  'sales',
  'agenda',
  'finance',
  'marketing',
  'notifications',
  'portal',
  'catalogs',
] as const;

type ModuleKey = (typeof MODULE_KEYS)[number];

type CleanupRequest = {
  modules?: unknown;
  dryRun?: unknown;
  confirmText?: unknown;
};

type IdCache = {
  conversations?: string[];
  messages?: string[];
  broadcasts?: string[];
  automations?: string[];
  flows?: string[];
  flowRuns?: string[];
  supportTickets?: string[];
  clientPacks?: string[];
  packCatalogs?: string[];
  sales?: string[];
  pipelines?: string[];
};

type CleanupSummary = Record<
  ModuleKey,
  {
    label: string;
    count: number;
    tables: Record<string, number>;
  }
>;

const MODULE_LABELS: Record<ModuleKey, string> = {
  inbox: 'Atendimento e Inbox',
  clients: 'Clientes 360',
  sales: 'Comercial e funis',
  agenda: 'Agenda e anamnese',
  finance: 'Financeiro, POS e benefícios',
  marketing: 'Transmissões, automações e fluxos',
  notifications: 'Notificações',
  portal: 'Portal, suporte e sessões',
  catalogs: 'Catálogos e configurações de teste',
};

const CLIENT_DEPENDENCIES: ModuleKey[] = [
  'inbox',
  'sales',
  'agenda',
  'finance',
  'marketing',
  'notifications',
  'portal',
];

const CATALOG_DEPENDENCIES: ModuleKey[] = [
  'sales',
  'agenda',
  'finance',
  'marketing',
];

class CleanupTableError extends Error {
  constructor(
    readonly table: string,
    readonly operation: 'consultar' | 'limpar',
    cause: unknown
  ) {
    const detail =
      cause && typeof cause === 'object' && 'message' in cause
        ? String(cause.message)
        : 'erro desconhecido';
    super(`Não foi possível ${operation} a tabela ${table}: ${detail}`);
    this.name = 'CleanupTableError';
  }
}

function parseModules(value: unknown): ModuleKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ModuleKey =>
    MODULE_KEYS.includes(item as ModuleKey)
  );
}

function expandModules(modules: ModuleKey[]): ModuleKey[] {
  const active = new Set(modules);
  if (active.has('clients')) {
    CLIENT_DEPENDENCIES.forEach((module) => active.add(module));
  }
  if (active.has('catalogs')) {
    CATALOG_DEPENDENCIES.forEach((module) => active.add(module));
  }
  return MODULE_KEYS.filter((module) => active.has(module));
}

function emptySummary(): CleanupSummary {
  return Object.fromEntries(
    MODULE_KEYS.map((key) => [
      key,
      { label: MODULE_LABELS[key], count: 0, tables: {} },
    ])
  ) as CleanupSummary;
}

function addSummary(
  summary: CleanupSummary,
  module: ModuleKey,
  table: string,
  count: number
) {
  if (count <= 0) return;
  summary[module].count += count;
  summary[module].tables[table] = (summary[module].tables[table] ?? 0) + count;
}

async function fetchAccountIds(
  db: SupabaseClient,
  table: string,
  accountId: string
) {
  const ids: string[] = [];
  let from = 0;
  const pageSize = 1000;

  for (;;) {
    const { data, error } = await db
      .from(table)
      .select('id')
      .eq('account_id', accountId)
      .range(from, from + pageSize - 1);

    if (error) {
      if (isMissingSchemaError(error)) return [];
      throw new CleanupTableError(table, 'consultar', error);
    }

    const rows = (data ?? []) as Array<{ id: string | null }>;
    ids.push(...rows.flatMap((row) => (row.id ? [row.id] : [])));
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}

async function fetchChildIds(
  db: SupabaseClient,
  table: string,
  column: string,
  parentIds: string[]
) {
  if (parentIds.length === 0) return [];
  const ids: string[] = [];

  for (let i = 0; i < parentIds.length; i += 500) {
    const chunk = parentIds.slice(i, i + 500);
    const { data, error } = await db.from(table).select('id').in(column, chunk);

    if (error) {
      if (isMissingSchemaError(error)) continue;
      throw new CleanupTableError(table, 'consultar', error);
    }

    ids.push(
      ...((data ?? []) as Array<{ id: string | null }>).flatMap((row) =>
        row.id ? [row.id] : []
      )
    );
  }

  return ids;
}

async function ensureIds(
  db: SupabaseClient,
  accountId: string,
  cache: IdCache
) {
  cache.conversations ??= await fetchAccountIds(db, 'conversations', accountId);
  cache.messages ??= await fetchChildIds(
    db,
    'messages',
    'conversation_id',
    cache.conversations
  );
  cache.broadcasts ??= await fetchAccountIds(db, 'broadcasts', accountId);
  cache.automations ??= await fetchAccountIds(db, 'automations', accountId);
  cache.flows ??= await fetchAccountIds(db, 'flows', accountId);
  cache.flowRuns ??= await fetchAccountIds(db, 'flow_runs', accountId);
  cache.supportTickets ??= await fetchAccountIds(
    db,
    'support_tickets',
    accountId
  );
  cache.clientPacks ??= await fetchAccountIds(
    db,
    'finance_client_packs',
    accountId
  );
  cache.packCatalogs ??= await fetchAccountIds(
    db,
    'finance_pack_catalog',
    accountId
  );
  cache.sales ??= await fetchAccountIds(db, 'finance_sales', accountId);
  cache.pipelines ??= await fetchAccountIds(db, 'pipelines', accountId);
}

async function deleteAccountTable(
  db: SupabaseClient,
  table: string,
  accountId: string,
  execute: boolean
) {
  const query = execute
    ? db.from(table).delete({ count: 'exact' }).eq('account_id', accountId)
    : db
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId);

  const { count, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return 0;
    throw new CleanupTableError(table, execute ? 'limpar' : 'consultar', error);
  }
  return count ?? 0;
}

async function deleteChildRows(
  db: SupabaseClient,
  table: string,
  column: string,
  parentIds: string[],
  execute: boolean
) {
  if (parentIds.length === 0) return 0;
  let total = 0;

  for (let i = 0; i < parentIds.length; i += 500) {
    const chunk = parentIds.slice(i, i + 500);
    const query = execute
      ? db.from(table).delete({ count: 'exact' }).in(column, chunk)
      : db
          .from(table)
          .select('id', { count: 'exact', head: true })
          .in(column, chunk);

    const { count, error } = await query;
    if (error) {
      if (isMissingSchemaError(error)) continue;
      throw new CleanupTableError(
        table,
        execute ? 'limpar' : 'consultar',
        error
      );
    }
    total += count ?? 0;
  }

  return total;
}

async function runCleanup({
  db,
  accountId,
  modules,
  execute,
}: {
  db: SupabaseClient;
  accountId: string;
  modules: ModuleKey[];
  execute: boolean;
}) {
  const active = new Set(modules);
  const cache: IdCache = {};
  await ensureIds(db, accountId, cache);

  const summary = emptySummary();

  async function account(module: ModuleKey, table: string) {
    if (!active.has(module)) return;
    addSummary(
      summary,
      module,
      table,
      await deleteAccountTable(db, table, accountId, execute)
    );
  }

  async function child(
    module: ModuleKey,
    table: string,
    column: string,
    ids: string[] | undefined
  ) {
    if (!active.has(module)) return;
    addSummary(
      summary,
      module,
      table,
      await deleteChildRows(db, table, column, ids ?? [], execute)
    );
  }

  await child('inbox', 'message_reactions', 'message_id', cache.messages);
  await child('inbox', 'messages', 'conversation_id', cache.conversations);
  await account('inbox', 'conversations');

  await account('marketing', 'automation_pending_executions');
  await account('marketing', 'automation_logs');
  await child(
    'marketing',
    'automation_steps',
    'automation_id',
    cache.automations
  );
  await account('marketing', 'automations');
  await account('marketing', 'flow_run_events');
  await account('marketing', 'flow_runs');
  await child('marketing', 'flow_nodes', 'flow_id', cache.flows);
  await account('marketing', 'flows');
  await child(
    'marketing',
    'broadcast_recipients',
    'broadcast_id',
    cache.broadcasts
  );
  await account('marketing', 'broadcasts');

  await account('agenda', 'finance_appointment_benefits');
  await account('agenda', 'clinic_agenda_events');
  await account('agenda', 'clinic_anamnesis_forms');
  await account('agenda', 'clinic_time_blocks');
  await account('agenda', 'clinic_appointments');

  await account('finance', 'finance_invoice_requests');
  await account('finance', 'finance_benefit_logs');
  await account('finance', 'finance_audit_events');
  await account('finance', 'finance_treasury_events');
  await account('finance', 'finance_payables');
  await account('finance', 'finance_receivable_schedules');
  await account('finance', 'finance_wallet_transactions');
  await account('finance', 'finance_client_wallets');
  await account('finance', 'finance_cash_movements');
  await account('finance', 'finance_stock_movements');
  await child(
    'finance',
    'finance_client_pack_balances',
    'client_pack_id',
    cache.clientPacks
  );
  await account('finance', 'finance_client_packs');
  await account('finance', 'finance_vouchers');
  await account('finance', 'finance_payments');
  await account('finance', 'finance_sale_items');
  await account('finance', 'finance_sales');
  await account('finance', 'finance_cash_sessions');

  await account('sales', 'client_activity_events');
  await account('sales', 'deals');

  await account('notifications', 'notifications');
  await account('notifications', 'push_subscriptions');

  await child(
    'portal',
    'support_ticket_messages',
    'ticket_id',
    cache.supportTickets
  );
  await account('portal', 'support_tickets');
  await account('portal', 'portal_notifications');
  await account('portal', 'client_portal_access');
  await account('portal', 'public_site_leads');

  await account('clients', 'referral_events');
  await account('clients', 'referral_rewards');
  await account('clients', 'referrals');
  await account('clients', 'referral_codes');
  await account('clients', 'contact_custom_values');
  await account('clients', 'contact_tags');
  await account('clients', 'contact_notes');
  await account('clients', 'contacts');

  await child('catalogs', 'finance_pack_items', 'pack_id', cache.packCatalogs);
  await account('catalogs', 'finance_pack_catalog');
  await child('catalogs', 'pipeline_stages', 'pipeline_id', cache.pipelines);
  await account('catalogs', 'pipelines');
  await account('catalogs', 'tags');
  await account('catalogs', 'custom_fields');
  await account('catalogs', 'quick_replies');
  await account('catalogs', 'message_templates');
  await account('catalogs', 'clinic_products');
  await account('catalogs', 'clinic_rooms');
  await account('catalogs', 'clinic_services');

  return {
    summary,
    total: Object.values(summary).reduce((sum, item) => sum + item.count, 0),
  };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const body = (await request.json().catch(() => ({}))) as CleanupRequest;
    const requestedModules = parseModules(body.modules);
    const dryRun = body.dryRun !== false;

    if (requestedModules.length === 0) {
      return NextResponse.json(
        { error: 'Selecione pelo menos uma área para limpar.' },
        { status: 400 }
      );
    }

    if (!dryRun && body.confirmText !== CONFIRM_TEXT) {
      throw new ForbiddenError('Confirmação inválida.');
    }

    const expandedModules = expandModules(requestedModules);
    const db = supabaseAdmin();
    const result = await runCleanup({
      db,
      accountId: ctx.accountId,
      modules: expandedModules,
      execute: !dryRun,
    });

    return NextResponse.json({
      ...result,
      dryRun,
      requestedModules,
      expandedModules,
      confirmText: CONFIRM_TEXT,
    });
  } catch (err) {
    if (err instanceof CleanupTableError) {
      console.error('[data-cleanup]', {
        table: err.table,
        operation: err.operation,
        message: err.message,
      });
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return toErrorResponse(err);
  }
}
