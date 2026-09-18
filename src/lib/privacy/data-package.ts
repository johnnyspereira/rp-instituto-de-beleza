import type { SupabaseClient } from '@supabase/supabase-js';

export async function buildSubjectDataPackage(
  db: SupabaseClient,
  accountId: string,
  contactId: string
) {
  const queries = {
    subject: db
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .eq('id', contactId)
      .single(),
    appointments: db
      .from('clinic_appointments')
      .select('*')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('scheduled_start', { ascending: false }),
    anamnesis: db
      .from('clinic_anamnesis_forms')
      .select('*')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
    vouchers: db
      .from('finance_vouchers')
      .select('*')
      .eq('account_id', accountId)
      .eq('owner_contact_id', contactId)
      .order('created_at', { ascending: false }),
    packs: db
      .from('finance_client_packs')
      .select('*')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
    sales: db
      .from('finance_sales')
      .select('*,items:finance_sale_items(*),payments:finance_payments(*)')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
    invoices: db
      .from('finance_invoice_requests')
      .select('*')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('requested_at', { ascending: false }),
    consents: db
      .from('privacy_consent_events')
      .select('*')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('occurred_at', { ascending: false }),
    requests: db
      .from('privacy_data_subject_requests')
      .select('*')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
    notes: db
      .from('contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
    conversations: db
      .from('conversations')
      .select('*,messages(*)')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
  };
  const entries = await Promise.all(
    Object.entries(queries).map(
      async ([key, query]) => [key, await query] as const
    )
  );
  const failed = entries.find(([, result]) => result.error);
  if (failed) throw failed[1].error;
  return {
    exported_at: new Date().toISOString(),
    format: 'RGPD-portability-json-v2',
    ...Object.fromEntries(
      entries.map(([key, result]) => [key, result.data ?? []])
    ),
  };
}
