import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  findMissingRequiredQuestion,
  mergeAnamnesisConfig,
} from '@/lib/clinic/anamnesis-config';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  privacyNoticeVersion,
  requestConsentEvidence,
} from '@/lib/privacy/consent-evidence';

function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = supabaseAdmin();
  const { data: settings } = await db
    .from('clinic_communication_settings')
    .select(
      'account_id,anamnesis_title,anamnesis_intro,anamnesis_form_config,account:accounts(name,logo_url)'
    )
    .ilike('anamnesis_public_slug', slug.trim())
    .eq('anamnesis_enabled', true)
    .maybeSingle();
  if (!settings)
    return Response.json({ error: 'Ficha indisponível.' }, { status: 404 });
  const { data: privacy } = await db
    .from('privacy_settings')
    .select('privacy_notice_version,privacy_policy_url')
    .eq('account_id', settings.account_id)
    .maybeSingle();
  return Response.json({
    form: {
      status: 'pending',
      client_name: null,
      client_email: null,
      client_phone: null,
      birth_date: null,
      selected_modalities: [],
      answers: {},
      signature_name: null,
      submitted_at: null,
      account: settings.account,
      form_title: settings.anamnesis_title,
      form_intro: settings.anamnesis_intro,
      config: mergeAnamnesisConfig(settings.anamnesis_form_config),
      privacy: privacy
        ? {
            version: privacy.privacy_notice_version,
            policy_url: privacy.privacy_policy_url,
          }
        : null,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = checkRateLimit(`anamnesis-public:${clientIp(request)}`, {
    limit: 6,
    windowMs: 60 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);
  const { slug } = await params;
  const body = (await request.json().catch(() => null)) as {
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    birthDate?: string;
    selectedModalities?: string[];
    answers?: Record<string, unknown>;
    signatureName?: string;
    healthConsent?: boolean;
    privacyConsent?: boolean;
  } | null;
  if (
    !body?.clientName?.trim() ||
    !body.signatureName?.trim() ||
    !body.healthConsent ||
    !body.privacyConsent
  ) {
    return Response.json(
      { error: 'Preencha a identificação, assinatura e consentimentos.' },
      { status: 400 }
    );
  }
  if (JSON.stringify(body.answers || {}).length > 30_000)
    return Response.json(
      { error: 'Ficha demasiado extensa.' },
      { status: 400 }
    );

  const db = supabaseAdmin();
  const { data: settings } = await db
    .from('clinic_communication_settings')
    .select('account_id,anamnesis_form_config')
    .ilike('anamnesis_public_slug', slug.trim())
    .eq('anamnesis_enabled', true)
    .maybeSingle();
  if (!settings)
    return Response.json({ error: 'Ficha indisponível.' }, { status: 404 });

  const missingQuestion = findMissingRequiredQuestion(
    mergeAnamnesisConfig(settings.anamnesis_form_config),
    body.selectedModalities || [],
    body.answers || {}
  );
  if (missingQuestion) {
    return Response.json(
      { error: `Responda à pergunta: ${missingQuestion.label}` },
      { status: 400 }
    );
  }

  const [noticeVersion, evidence] = await Promise.all([
    privacyNoticeVersion(db, settings.account_id),
    requestConsentEvidence(request),
  ]);

  let contactId: string | null = null;
  const email = body.clientEmail?.trim().toLowerCase();
  if (email) {
    const { data: contacts } = await db
      .from('contacts')
      .select('id')
      .eq('account_id', settings.account_id)
      .ilike('email', email)
      .limit(2);
    if (contacts?.length === 1) contactId = contacts[0].id;
  }

  const { data: form, error } = await db
    .from('clinic_anamnesis_forms')
    .insert({
      account_id: settings.account_id,
      contact_id: contactId,
      status: 'submitted',
      client_name: body.clientName.trim().slice(0, 160),
      client_email: email || null,
      client_phone: body.clientPhone?.trim().slice(0, 40) || null,
      birth_date: body.birthDate || null,
      selected_modalities: (body.selectedModalities || []).slice(0, 20),
      answers: body.answers || {},
      health_consent: true,
      privacy_consent: true,
      consent_recorded_at: new Date().toISOString(),
      privacy_notice_version: noticeVersion,
      consent_evidence: evidence,
      signature_name: body.signatureName.trim().slice(0, 160),
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (contactId) {
    const { error: contactError } = await db
      .from('contacts')
      .update({
        name: body.clientName.trim().slice(0, 160),
        phone: body.clientPhone?.trim().slice(0, 40) || null,
        birth_date: body.birthDate || null,
      })
      .eq('id', contactId)
      .eq('account_id', settings.account_id);
    if (contactError) {
      console.error('[public-anamnesis] contact sync failed:', contactError.message);
      return Response.json({ error: 'A ficha foi guardada, mas não foi possível atualizar os dados do cliente.' }, { status: 500 });
    }
  }
  await db.from('privacy_consent_events').insert([
    {
      id: crypto.randomUUID(),
      account_id: settings.account_id,
      contact_id: contactId,
      purpose: 'health_anamnesis',
      status: 'granted',
      legal_basis: 'consent',
      policy_version: noticeVersion,
      source: 'public_anamnesis',
      evidence,
    },
    {
      id: crypto.randomUUID(),
      account_id: settings.account_id,
      contact_id: contactId,
      purpose: 'privacy_notice',
      status: 'granted',
      legal_basis: 'consent',
      policy_version: noticeVersion,
      source: 'public_anamnesis',
      evidence,
    },
  ]);
  return Response.json({ ok: true, formId: form.id }, { status: 201 });
}
