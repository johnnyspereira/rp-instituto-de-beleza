import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

const REQUEST_TYPES = new Set([
  'access',
  'rectification',
  'erasure',
  'restriction',
  'objection',
  'portability',
  'withdraw_consent',
]);

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function text(value: unknown, max = 1000) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : null;
}

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const db = supabaseAdmin();
    const [settings, requests, incidents] = await Promise.all([
      db
        .from('privacy_settings')
        .select('*')
        .eq('account_id', ctx.accountId)
        .maybeSingle(),
      db
        .from('privacy_data_subject_requests')
        .select('*')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false })
        .limit(100),
      db
        .from('privacy_incidents')
        .select('*')
        .eq('account_id', ctx.accountId)
        .order('detected_at', { ascending: false })
        .limit(50),
    ]);
    const error = settings.error || requests.error || incidents.error;
    if (error) throw error;
    return Response.json({
      settings: settings.data,
      requests: requests.data ?? [],
      incidents: incidents.data ?? [],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json()) as Record<string, unknown>;
    const db = supabaseAdmin();
    const { data: portal } = await db
      .from('client_portal_settings')
      .select('slug')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    const generatedPolicyUrl = portal?.slug
      ? `${new URL(request.url).origin}/privacy/${encodeURIComponent(portal.slug)}`
      : null;
    const payload = {
      account_id: ctx.accountId,
      controller_name: text(body.controllerName, 255),
      controller_email: text(body.controllerEmail, 320),
      controller_tax_id: text(body.controllerTaxId, 40),
      controller_address: text(body.controllerAddress, 2000),
      dpo_email: text(body.dpoEmail, 320),
      privacy_policy_url:
        text(body.privacyPolicyUrl, 2000) || generatedPolicyUrl,
      privacy_notice_version: text(body.privacyNoticeVersion, 80) || '1.0',
      contact_retention_months: integer(
        body.contactRetentionMonths,
        60,
        1,
        240
      ),
      health_retention_months: integer(body.healthRetentionMonths, 60, 1, 240),
      communication_retention_months: integer(
        body.communicationRetentionMonths,
        24,
        1,
        120
      ),
      finance_retention_months: integer(
        body.financeRetentionMonths,
        120,
        1,
        240
      ),
      inactive_contact_retention_months: integer(
        body.inactiveContactRetentionMonths,
        36,
        1,
        240
      ),
      retention_notice_days: integer(body.retentionNoticeDays, 30, 7, 90),
      backup_retention_days: integer(body.backupRetentionDays, 30, 1, 365),
      backup_erasure_policy: text(body.backupErasurePolicy, 5000),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db
      .from('privacy_settings')
      .upsert(payload, { onConflict: 'account_id' })
      .select('*')
      .single();
    if (error) throw error;
    const { count } = await db
      .from('privacy_processing_activities')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId);
    if (!count)
      await db.from('privacy_processing_activities').insert(
        [
          [
            'Agenda e serviços',
            'Gerir marcações e prestar serviços',
            'contract',
            null,
            'Dados identificativos, contacto e agenda',
          ],
          [
            'Faturação e benefícios',
            'Processar pagamentos, faturação, packs e vouchers',
            'legal_obligation',
            null,
            'Identificação, NIF, transações e benefícios',
          ],
          [
            'Comunicações operacionais',
            'Enviar confirmações, alterações e lembretes',
            'contract',
            null,
            'Nome, contactos e marcações',
          ],
          [
            'Marketing',
            'Enviar campanhas e promoções autorizadas',
            'consent',
            null,
            'Nome, contacto e preferências',
          ],
          [
            'Anamnese',
            'Preparar e prestar o atendimento com segurança',
            'consent',
            'explicit_consent',
            'Identificação e dados de saúde',
          ],
          [
            'Indicações',
            'Gerir o programa Indique e Ganhe',
            'consent',
            null,
            'Nome, telefone, email e relação de indicação',
          ],
        ].map(
          ([
            name,
            purposes,
            legal_basis,
            special_category_basis,
            data_categories,
          ]) => ({
            id: crypto.randomUUID(),
            account_id: ctx.accountId,
            name,
            purposes,
            data_subjects: 'Clientes e potenciais clientes',
            data_categories,
            legal_basis,
            special_category_basis,
            recipients: 'Equipa autorizada e subcontratantes necessários',
            retention_rule: 'Conforme matriz RGPD configurada',
            security_measures:
              'Controlo de acesso, auditoria, backups e transmissão segura',
          })
        )
      );
    return Response.json({ settings: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json()) as Record<string, unknown>;
    const requestType = String(body.requestType ?? '');
    if (!REQUEST_TYPES.has(requestType)) {
      return Response.json(
        { error: 'Tipo de pedido inválido.' },
        { status: 400 }
      );
    }
    const now = new Date();
    const due = new Date(now);
    due.setMonth(due.getMonth() + 1);
    const requesterEmail = text(body.requesterEmail, 320);
    let contactId = text(body.contactId, 36);
    if (!contactId && requesterEmail) {
      const { data: contact } = await supabaseAdmin()
        .from('contacts')
        .select('id')
        .eq('account_id', ctx.accountId)
        .eq('email', requesterEmail)
        .limit(1)
        .maybeSingle();
      contactId = contact?.id ?? null;
    }
    const { data, error } = await supabaseAdmin()
      .from('privacy_data_subject_requests')
      .insert({
        id: crypto.randomUUID(),
        account_id: ctx.accountId,
        contact_id: contactId,
        request_type: requestType,
        requester_name: text(body.requesterName, 255),
        requester_email: requesterEmail,
        details: text(body.details, 5000),
        source: 'admin',
        due_at: due.toISOString(),
        created_by_user_id: ctx.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return Response.json({ request: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
