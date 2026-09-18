import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  findMissingRequiredQuestion,
  mergeAnamnesisConfig,
} from '@/lib/clinic/anamnesis-config';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { notifyAccountEvent } from '@/lib/notifications/account-events';
import {
  privacyNoticeVersion,
  requestConsentEvidence,
} from '@/lib/privacy/consent-evidence';

function tokenValid(token: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    token
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!tokenValid(token))
    return Response.json({ error: 'Ficha inválida.' }, { status: 404 });
  const db = supabaseAdmin();
  const { data: form } = await db
    .from('clinic_anamnesis_forms')
    .select(
      'id,account_id,appointment_id,service_id,status,client_name,client_email,client_phone,birth_date,selected_modalities,answers,health_consent,privacy_consent,signature_name,submitted_at,expires_at,service:clinic_services(name,category),appointment:clinic_appointments!clinic_anamnesis_forms_appointment_id_fkey(scheduled_start),account:accounts(name,logo_url)'
    )
    .eq('public_token', token)
    .maybeSingle();
  if (!form || ['expired', 'revoked'].includes(form.status))
    return Response.json({ error: 'Ficha indisponível.' }, { status: 404 });
  if (new Date(form.expires_at) < new Date() && form.status === 'pending')
    return Response.json({ error: 'Este link expirou.' }, { status: 410 });
  const { data: settings } = await db
    .from('clinic_communication_settings')
    .select('anamnesis_title,anamnesis_intro,anamnesis_form_config')
    .eq('account_id', form.account_id)
    .maybeSingle();
  const { data: privacy } = await db
    .from('privacy_settings')
    .select('privacy_notice_version,privacy_policy_url')
    .eq('account_id', form.account_id)
    .maybeSingle();
  return Response.json({
    form: {
      ...form,
      modality_locked: Boolean(
        form.appointment_id &&
        (form.service_id || form.selected_modalities?.length)
      ),
      form_title: settings?.anamnesis_title,
      form_intro: settings?.anamnesis_intro,
      config: mergeAnamnesisConfig(settings?.anamnesis_form_config),
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
  { params }: { params: Promise<{ token: string }> }
) {
  const limit = checkRateLimit(`anamnesis-submit:${tokenFrom(request)}`, {
    limit: 8,
    windowMs: 60 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);
  const { token } = await params;
  if (!tokenValid(token))
    return Response.json({ error: 'Ficha inválida.' }, { status: 404 });
  const body = (await request.json().catch(() => null)) as {
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    birthDate?: string;
    selectedModalities?: string[];
    answers?: Record<string, unknown>;
    healthConsent?: boolean;
    privacyConsent?: boolean;
    signatureName?: string;
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
  const { data: existing } = await db
    .from('clinic_anamnesis_forms')
    .select(
      'id,account_id,contact_id,appointment_id,service_id,status,expires_at,selected_modalities,service:clinic_services(name,category)'
    )
    .eq('public_token', token)
    .maybeSingle();
  if (!existing || ['reviewed', 'expired', 'revoked'].includes(existing.status))
    return Response.json({ error: 'Ficha indisponível.' }, { status: 409 });
  if (new Date(existing.expires_at) < new Date())
    return Response.json({ error: 'Este link expirou.' }, { status: 410 });

  const { data: settings } = await db
    .from('clinic_communication_settings')
    .select('anamnesis_form_config')
    .eq('account_id', existing.account_id)
    .maybeSingle();
  const appointmentService = Array.isArray(existing.service)
    ? existing.service[0]
    : existing.service;
  const appointmentModalities = existing.appointment_id
    ? Array.from(
        new Set(
          [
            ...(existing.selected_modalities || []),
            appointmentService?.name,
            appointmentService?.category,
          ].filter((value): value is string => Boolean(value))
        )
      ).slice(0, 20)
    : null;
  const selectedModalities =
    appointmentModalities || body.selectedModalities || [];
  const [noticeVersion, evidence] = await Promise.all([
    privacyNoticeVersion(db, existing.account_id),
    requestConsentEvidence(request),
  ]);
  const missingQuestion = findMissingRequiredQuestion(
    mergeAnamnesisConfig(settings?.anamnesis_form_config),
    selectedModalities,
    body.answers || {}
  );
  if (missingQuestion) {
    return Response.json(
      { error: `Responda à pergunta: ${missingQuestion.label}` },
      { status: 400 }
    );
  }

  const { error } = await db
    .from('clinic_anamnesis_forms')
    .update({
      status: 'submitted',
      client_name: body.clientName.trim().slice(0, 160),
      client_email: body.clientEmail?.trim().slice(0, 255) || null,
      client_phone: body.clientPhone?.trim().slice(0, 40) || null,
      birth_date: body.birthDate || null,
      selected_modalities: selectedModalities.slice(0, 20),
      answers: body.answers || {},
      health_consent: true,
      privacy_consent: true,
      consent_recorded_at: new Date().toISOString(),
      privacy_notice_version: noticeVersion,
      consent_evidence: evidence,
      signature_name: body.signatureName.trim().slice(0, 160),
      submitted_at: new Date().toISOString(),
    })
    .eq('id', existing.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await db.from('privacy_consent_events').insert([
    {
      id: crypto.randomUUID(),
      account_id: existing.account_id,
      contact_id: existing.contact_id,
      purpose: 'health_anamnesis',
      status: 'granted',
      legal_basis: 'consent',
      policy_version: noticeVersion,
      source: 'anamnesis_form',
      evidence,
    },
    {
      id: crypto.randomUUID(),
      account_id: existing.account_id,
      contact_id: existing.contact_id,
      purpose: 'privacy_notice',
      status: 'granted',
      legal_basis: 'consent',
      policy_version: noticeVersion,
      source: 'anamnesis_form',
      evidence,
    },
  ]);

  // Keep the client master record in sync with the identification supplied in
  // the clinical form. Previously the date only lived on the form, which made
  // it look lost everywhere else in the CRM.
  if (existing.contact_id) {
    const contactUpdate: Record<string, string | null> = {
      name: body.clientName.trim().slice(0, 160),
      email: body.clientEmail?.trim().slice(0, 255) || null,
      phone: body.clientPhone?.trim().slice(0, 40) || null,
      birth_date: body.birthDate || null,
    };
    const { error: contactError } = await db
      .from('contacts')
      .update(contactUpdate)
      .eq('id', existing.contact_id)
      .eq('account_id', existing.account_id);
    if (contactError) {
      console.error('[anamnesis] contact sync failed:', contactError.message);
      return Response.json({ error: 'A ficha foi guardada, mas não foi possível atualizar os dados do cliente.' }, { status: 500 });
    }
  }

  try {
    const serviceName = appointmentService?.name || 'sessão';
    await notifyAccountEvent({
      accountId: existing.account_id,
      type: 'anamnesis_submitted',
      category: 'clinic',
      priority: 'high',
      title: `Anamnese preenchida por ${body.clientName.trim()}`,
      body: `A ficha clínica da ${serviceName} foi enviada e está pronta para consulta.`,
      actionUrl: existing.appointment_id
        ? `/agenda?appointment=${encodeURIComponent(existing.appointment_id)}`
        : '/agenda',
      contactId: existing.contact_id,
      dedupeKey: `anamnesis-submitted:${existing.id}`,
      metadata: {
        anamnesisId: existing.id,
        appointmentId: existing.appointment_id,
        serviceName,
      },
      whatsappText: `✅ *Anamnese preenchida*\nCliente: ${body.clientName.trim()}\nSessão: ${serviceName}\nA ficha já está disponível no CRM.`,
    });
  } catch (notificationError) {
    console.error('[anamnesis] admin notification failed:', notificationError);
  }
  return Response.json({ ok: true });
}

function tokenFrom(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
