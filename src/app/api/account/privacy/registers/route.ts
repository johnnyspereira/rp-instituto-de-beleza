import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
const TABLES = {
  processor: 'privacy_processors',
  activity: 'privacy_processing_activities',
  incident: 'privacy_incidents',
} as const;
export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const db = supabaseAdmin();
    const [processors, activities, incidents, audit] = await Promise.all([
      db
        .from(TABLES.processor)
        .select('*')
        .eq('account_id', ctx.accountId)
        .order('name'),
      db
        .from(TABLES.activity)
        .select('*')
        .eq('account_id', ctx.accountId)
        .order('name'),
      db
        .from(TABLES.incident)
        .select('*')
        .eq('account_id', ctx.accountId)
        .order('detected_at', { ascending: false }),
      db
        .from('privacy_audit_events')
        .select('*')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    const error =
      processors.error || activities.error || incidents.error || audit.error;
    if (error) throw error;
    return Response.json({
      processors: processors.data ?? [],
      activities: activities.data ?? [],
      incidents: incidents.data ?? [],
      audit: audit.data ?? [],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const db = supabaseAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const kind = String(body.kind) as keyof typeof TABLES;
    if (!TABLES[kind])
      return Response.json({ error: 'Registo inválido.' }, { status: 400 });
    const base = { id: crypto.randomUUID(), account_id: ctx.accountId };
    let row: Record<string, unknown>;
    if (kind === 'processor')
      row = {
        ...base,
        name: String(body.name || '').slice(0, 255),
        service: String(body.service || '').slice(0, 255),
        data_categories:
          String(body.dataCategories || '').slice(0, 3000) || null,
        processing_location: String(body.location || '').slice(0, 255) || null,
        safeguards: String(body.safeguards || '').slice(0, 3000) || null,
        agreement_status: String(body.agreementStatus || 'pending'),
      };
    else if (kind === 'activity')
      row = {
        ...base,
        name: String(body.name || '').slice(0, 255),
        purposes: String(body.purposes || ''),
        data_subjects: String(body.dataSubjects || 'Clientes'),
        data_categories: String(body.dataCategories || ''),
        legal_basis: String(body.legalBasis || ''),
        legal_reference:
          String(body.legalReference || '').slice(0, 255) || null,
        special_category_basis: String(body.specialCategoryBasis || '') || null,
        recipients: String(body.recipients || '') || null,
        retention_rule: String(body.retentionRule || '') || null,
        security_measures: String(body.securityMeasures || '') || null,
      };
    else {
      const detected = new Date().toISOString();
      const due = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      row = {
        ...base,
        title: String(body.title || '').slice(0, 255),
        description: String(body.description || ''),
        severity: String(body.severity || 'medium'),
        detected_at: detected,
        authority_notification_due_at: due,
        created_by_user_id: ctx.userId,
      };
    }
    if (!row.name && !row.title)
      return Response.json(
        { error: 'Preencha o nome ou título.' },
        { status: 400 }
      );
    const { data, error } = await db
      .from(TABLES[kind])
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    await db.from('privacy_audit_events').insert({
      id: crypto.randomUUID(),
      account_id: ctx.accountId,
      actor_user_id: ctx.userId,
      action: `${kind}_created`,
      entity_type: kind,
      entity_id: data.id,
      metadata: {},
    });
    return Response.json({ item: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
