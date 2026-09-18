export interface TablePolicy {
  accountColumn?: string;
  userColumn?: string;
  parent?: {
    localColumn: string;
    parentTable: string;
    parentColumn?: string;
  };
  minimumWriteRole?: 'viewer' | 'agent' | 'admin' | 'owner';
}

const directOperational = [
  'contacts',
  'tags',
  'custom_fields',
  'contact_notes',
  'conversations',
  'whatsapp_config',
  'message_templates',
  'pipelines',
  'deals',
  'broadcasts',
  'automations',
  'automation_logs',
  'automation_pending_executions',
  'flows',
  'flow_runs',
  'quick_replies',
  'clinic_appointments',
  'clinic_time_blocks',
  'clinic_agenda_events',
  'external_calendar_feeds',
  'work_sessions',
  'work_breaks',
  'member_presence',
  'notifications',
  'push_subscriptions',
  'client_activity_events',
  'contact_segments',
  'crm_tasks',
  'message_library_items',
  'scheduled_whatsapp_messages',
  'marketing_automation_rules',
  'marketing_automation_dispatch_log',
  'social_scheduled_posts',
  'support_tickets',
  'support_ticket_messages',
  'portal_notifications',
  'portal_campaigns',
  'portal_campaign_enrollments',
] as const;

const settingsTables = [
  'clinic_services',
  'clinic_rooms',
  'clinic_products',
  'clinic_communication_settings',
  'api_keys',
  'webhook_endpoints',
  'ai_configs',
  'ai_knowledge_documents',
  'ai_knowledge_chunks',
  'clinic_appointment_reviews',
  'business_integration_settings',
  'client_portal_settings',
  'public_site_settings',
  'referral_program_settings',
  'finance_reminder_settings',
] as const;

const financeTables = [
  'ai_usage_log',
  'finance_appointment_benefits',
  'finance_audit_events',
  'finance_benefit_logs',
  'finance_cash_movements',
  'finance_cash_sessions',
  'finance_client_pack_balances',
  'finance_client_packs',
  'finance_client_wallets',
  'finance_fiscal_documents',
  'finance_fund_accounts',
  'finance_fund_transactions',
  'finance_fund_transfers',
  'finance_goal_entries',
  'finance_goals',
  'finance_invoice_requests',
  'finance_pack_catalog',
  'finance_payables',
  'finance_payment_links',
  'finance_payments',
  'finance_receivable_schedules',
  'finance_reminder_deliveries',
  'finance_sales',
  'finance_stock_movements',
  'finance_treasury_events',
  'finance_voucher_transfer_requests',
  'finance_vouchers',
  'finance_wallet_transactions',
  'referral_codes',
  'referral_events',
  'referral_rewards',
  'referrals',
] as const;

const policies: Record<string, TablePolicy> = {
  accounts: { accountColumn: 'id', minimumWriteRole: 'admin' },
  profiles: { accountColumn: 'account_id', minimumWriteRole: 'admin' },
  account_invitations: {
    accountColumn: 'account_id',
    minimumWriteRole: 'admin',
  },
  clinic_anamnesis_forms: {
    accountColumn: 'account_id',
    minimumWriteRole: 'agent',
  },
  client_portal_access: {
    accountColumn: 'account_id',
    minimumWriteRole: 'agent',
  },
  public_site_leads: { accountColumn: 'account_id', minimumWriteRole: 'agent' },
  privacy_settings: { accountColumn: 'account_id', minimumWriteRole: 'admin' },
  privacy_consent_events: {
    accountColumn: 'account_id',
    minimumWriteRole: 'agent',
  },
  privacy_data_subject_requests: {
    accountColumn: 'account_id',
    minimumWriteRole: 'admin',
  },
  privacy_incidents: { accountColumn: 'account_id', minimumWriteRole: 'admin' },
  privacy_processors: {
    accountColumn: 'account_id',
    minimumWriteRole: 'admin',
  },
  privacy_processing_activities: {
    accountColumn: 'account_id',
    minimumWriteRole: 'admin',
  },
  privacy_audit_events: {
    accountColumn: 'account_id',
    minimumWriteRole: 'admin',
  },
  privacy_retention_runs: {
    accountColumn: 'account_id',
    minimumWriteRole: 'admin',
  },
};

const userOwnedTables = new Set([
  'contacts',
  'tags',
  'custom_fields',
  'contact_notes',
  'conversations',
  'whatsapp_config',
  'message_templates',
  'pipelines',
  'deals',
  'broadcasts',
  'quick_replies',
  'automations',
  'automation_logs',
  'automation_pending_executions',
  'flows',
  'flow_runs',
  'clinic_services',
  'clinic_rooms',
  'clinic_products',
  'clinic_appointments',
  'clinic_time_blocks',
  'clinic_agenda_events',
  'work_sessions',
  'work_breaks',
  'external_calendar_feeds',
  'member_presence',
  'notifications',
  'push_subscriptions',
  'scheduled_whatsapp_messages',
  'crm_tasks',
  'message_library_items',
  'contact_segments',
  'marketing_automation_rules',
]);

for (const table of directOperational) {
  policies[table] = {
    accountColumn: 'account_id',
    userColumn: userOwnedTables.has(table) ? 'user_id' : undefined,
    minimumWriteRole: 'agent',
  };
}

for (const table of settingsTables) {
  policies[table] = { accountColumn: 'account_id', minimumWriteRole: 'admin' };
}

for (const table of financeTables) {
  policies[table] = { accountColumn: 'account_id', minimumWriteRole: 'agent' };
}

Object.assign(policies, {
  contact_tags: {
    parent: { localColumn: 'contact_id', parentTable: 'contacts' },
    minimumWriteRole: 'agent',
  },
  contact_custom_values: {
    parent: { localColumn: 'contact_id', parentTable: 'contacts' },
    minimumWriteRole: 'agent',
  },
  messages: {
    parent: { localColumn: 'conversation_id', parentTable: 'conversations' },
    minimumWriteRole: 'agent',
  },
  message_reactions: {
    parent: { localColumn: 'conversation_id', parentTable: 'conversations' },
    minimumWriteRole: 'agent',
  },
  pipeline_stages: {
    parent: { localColumn: 'pipeline_id', parentTable: 'pipelines' },
    minimumWriteRole: 'agent',
  },
  broadcast_recipients: {
    parent: { localColumn: 'broadcast_id', parentTable: 'broadcasts' },
    minimumWriteRole: 'agent',
  },
  automation_steps: {
    parent: { localColumn: 'automation_id', parentTable: 'automations' },
    minimumWriteRole: 'agent',
  },
  flow_nodes: {
    parent: { localColumn: 'flow_id', parentTable: 'flows' },
    minimumWriteRole: 'agent',
  },
  flow_run_events: {
    parent: { localColumn: 'flow_run_id', parentTable: 'flow_runs' },
    minimumWriteRole: 'agent',
  },
  finance_pack_items: {
    parent: { localColumn: 'pack_id', parentTable: 'finance_pack_catalog' },
    minimumWriteRole: 'admin',
  },
  finance_sale_items: {
    parent: { localColumn: 'sale_id', parentTable: 'finance_sales' },
    minimumWriteRole: 'agent',
  },
});

export function getTablePolicy(table: string): TablePolicy | null {
  return policies[table] ?? null;
}

export function roleAllows(
  actual: 'owner' | 'admin' | 'agent' | 'viewer',
  required: 'owner' | 'admin' | 'agent' | 'viewer'
): boolean {
  const rank = { viewer: 0, agent: 1, admin: 2, owner: 3 } as const;
  return rank[actual] >= rank[required];
}
