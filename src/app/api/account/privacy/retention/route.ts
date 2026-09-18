import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { sendLocalEmail } from '@/lib/email/smtp';
import { brandedEmail } from '@/lib/email/templates';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { notifyAccountEvent } from '@/lib/notifications/account-events';
import { getPublicUrl } from '@/lib/public-url';

type Mode = 'preview' | 'notify' | 'execute';
type Candidate = {
  id: string;
  name: string | null;
  email: string | null;
  updated_at: string;
  retention_notified_at: string | null;
};
const REMOVED = '[conteúdo removido por retenção RGPD]';

function monthsAgo(months: number) {
  const value = new Date();
  value.setMonth(value.getMonth() - months);
  return value;
}

function storedObject(url: string | null) {
  if (!url) return null;
  try {
    const pathname = new URL(url, 'https://local.invalid').pathname;
    const match =
      pathname.match(/^\/uploads\/([^/]+)\/(.+)$/) ??
      pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return {
      bucket: decodeURIComponent(match[1]),
      path: match[2].split('/').map(decodeURIComponent).join('/'),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const body = (await request.json().catch(() => ({}))) as {
      mode?: Mode;
      execute?: boolean;
      confirmText?: string;
    };
    const mode: Mode = body.execute ? 'execute' : body.mode || 'preview';
    if (!['preview', 'notify', 'execute'].includes(mode))
      return Response.json({ error: 'Operação inválida.' }, { status: 400 });
    if (mode === 'execute' && body.confirmText !== 'APLICAR RETENÇÃO')
      return Response.json({ error: 'Confirmação inválida.' }, { status: 400 });

    const db = supabaseAdmin();
    const { data: settings, error: settingsError } = await db
      .from('privacy_settings')
      .select('*')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    const contactCutoff = monthsAgo(
      settings?.inactive_contact_retention_months ?? 36
    );
    const healthCutoff = monthsAgo(settings?.health_retention_months ?? 60);
    const communicationCutoff = monthsAgo(
      settings?.communication_retention_months ?? 24
    );
    const financeCutoff = monthsAgo(settings?.finance_retention_months ?? 120);
    const noticeDays = Number(settings?.retention_notice_days ?? 30);
    const noticeReadyBefore = new Date(Date.now() - noticeDays * 86_400_000);

    const { data: contacts, error: contactsError } = await db
      .from('contacts')
      .select('id,name,email,updated_at,retention_notified_at')
      .eq('account_id', ctx.accountId)
      .is('anonymized_at', null)
      .lt('updated_at', contactCutoff.toISOString())
      .limit(500);
    if (contactsError) throw contactsError;
    const candidates = (contacts ?? []) as Candidate[];
    const ids = candidates.map((item) => item.id);
    const protectedIds = new Map<string, string[]>();
    const protect = (id: string | null, reason: string) => {
      if (id) protectedIds.set(id, [...(protectedIds.get(id) ?? []), reason]);
    };
    if (ids.length) {
      const [sales, invoices, requests, appointments] = await Promise.all([
        db
          .from('finance_sales')
          .select('contact_id')
          .eq('account_id', ctx.accountId)
          .in('contact_id', ids)
          .gte('created_at', financeCutoff.toISOString()),
        db
          .from('finance_invoice_requests')
          .select('contact_id')
          .eq('account_id', ctx.accountId)
          .in('contact_id', ids)
          .gte('requested_at', financeCutoff.toISOString()),
        db
          .from('privacy_data_subject_requests')
          .select('contact_id')
          .eq('account_id', ctx.accountId)
          .in('contact_id', ids)
          .in('status', ['received', 'identity_check', 'in_progress']),
        db
          .from('clinic_appointments')
          .select('contact_id')
          .eq('account_id', ctx.accountId)
          .in('contact_id', ids)
          .gte('scheduled_start', new Date().toISOString())
          .not('status', 'in', '(cancelled,no_show)'),
      ]);
      const failure =
        sales.error || invoices.error || requests.error || appointments.error;
      if (failure) throw failure;
      for (const row of sales.data ?? [])
        protect(row.contact_id, 'documento financeiro dentro do prazo legal');
      for (const row of invoices.data ?? [])
        protect(row.contact_id, 'pedido de fatura dentro do prazo legal');
      for (const row of requests.data ?? [])
        protect(row.contact_id, 'pedido RGPD em curso');
      for (const row of appointments.data ?? [])
        protect(row.contact_id, 'marcação futura');
    }
    const unprotected = candidates.filter((item) => !protectedIds.has(item.id));
    const awaitingNotice = unprotected.filter(
      (item) =>
        !item.retention_notified_at ||
        new Date(item.retention_notified_at) > noticeReadyBefore
    );
    const eligible = unprotected.filter(
      (item) =>
        item.retention_notified_at &&
        new Date(item.retention_notified_at) <= noticeReadyBefore
    );
    const excluded = candidates
      .filter((item) => protectedIds.has(item.id))
      .map((item) => ({ ...item, reasons: protectedIds.get(item.id) }));

    const [{ count: expiredAnamnesis }, { count: expiredMessages }] =
      await Promise.all([
        db
          .from('clinic_anamnesis_forms')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', ctx.accountId)
          .lt('created_at', healthCutoff.toISOString())
          .neq('status', 'revoked'),
        db
          .from('messages')
          .select('id,conversation:conversations!inner(account_id)', {
            count: 'exact',
            head: true,
          })
          .eq('conversation.account_id', ctx.accountId)
          .lt('created_at', communicationCutoff.toISOString())
          .neq('content_text', REMOVED),
      ]);

    if (mode === 'notify') {
      let notified = 0;
      const failures: string[] = [];
      const privacyUrl = getPublicUrl(
        '/privacidade',
        new URL(request.url).origin
      );
      for (const contact of unprotected.filter(
        (item) => !item.retention_notified_at
      )) {
        if (contact.email) {
          try {
            const html = brandedEmail({
              businessName: ctx.account.name,
              preheader: 'Aviso de conservação dos seus dados pessoais',
              eyebrow: 'Privacidade',
              title: 'Os seus dados atingiram o prazo de conservação',
              greeting: `Olá${contact.name ? `, ${contact.name.split(' ')[0]}` : ''}.`,
              message: `A sua ficha encontra-se inativa e será anonimizada dentro de ${noticeDays} dias. Se ainda mantém uma relação connosco ou pretende exercer os seus direitos, contacte-nos antes dessa data.`,
              action: {
                label: 'Consultar política de privacidade',
                url: privacyUrl,
              },
              notice:
                'Documentos sujeitos a conservação legal permanecem protegidos durante o respetivo prazo.',
            });
            await sendLocalEmail({
              to: contact.email,
              subject: `Aviso de conservação de dados — ${ctx.account.name}`,
              text: `A sua ficha será anonimizada dentro de ${noticeDays} dias. Consulte ${privacyUrl}.`,
              html,
            });
          } catch (error) {
            failures.push(
              `${contact.id}: ${error instanceof Error ? error.message : 'falha no email'}`
            );
            continue;
          }
        }
        const { error } = await db
          .from('contacts')
          .update({ retention_notified_at: new Date().toISOString() })
          .eq('account_id', ctx.accountId)
          .eq('id', contact.id);
        if (error) failures.push(`${contact.id}: ${error.message}`);
        else notified++;
      }
      await recordRun(db, ctx, mode, {
        contacts: notified,
        excluded: excluded.length,
        details: { failures, noticeDays },
      });
      return Response.json({ notified, failures, noticeDays });
    }

    if (mode === 'execute') {
      const now = new Date().toISOString();
      let attachments = 0;
      const errors: string[] = [];
      const { data: oldMessages, error: messageError } = await db
        .from('messages')
        .select('id,media_url,conversation:conversations!inner(account_id)')
        .eq('conversation.account_id', ctx.accountId)
        .lt('created_at', communicationCutoff.toISOString())
        .neq('content_text', REMOVED)
        .limit(2000);
      if (messageError) throw messageError;
      for (const message of oldMessages ?? []) {
        const object = storedObject(message.media_url);
        if (object) {
          const { error } = await db.storage
            .from(object.bucket)
            .remove([object.path]);
          if (error) errors.push(`anexo ${message.id}: ${error.message}`);
          else attachments++;
        }
      }
      const messageIds = (oldMessages ?? []).map((item) => item.id);
      if (messageIds.length) {
        const { error } = await db
          .from('messages')
          .update({
            content_text: REMOVED,
            media_url: null,
            interactive_payload: null,
          })
          .in('id', messageIds);
        if (error) throw error;
      }
      const { data: oldForms, error: formReadError } = await db
        .from('clinic_anamnesis_forms')
        .select('id')
        .eq('account_id', ctx.accountId)
        .lt('created_at', healthCutoff.toISOString())
        .neq('status', 'revoked')
        .limit(2000);
      if (formReadError) throw formReadError;
      const formIds = (oldForms ?? []).map((item) => item.id);
      if (formIds.length) {
        const { error } = await db
          .from('clinic_anamnesis_forms')
          .update({
            client_name: 'Titular anonimizado',
            client_email: null,
            client_phone: null,
            birth_date: null,
            answers: {},
            signature_name: null,
            consent_evidence: null,
            status: 'revoked',
          })
          .in('id', formIds);
        if (error) throw error;
      }
      for (const contact of eligible) {
        const { error } = await db
          .from('contacts')
          .update({
            phone: `anon-${contact.id}`,
            name: 'Titular anonimizado',
            email: null,
            company: null,
            avatar_url: null,
            birth_date: null,
            tax_id: null,
            address_line: null,
            postal_code: null,
            city: null,
            marketing_consent: false,
            marketing_whatsapp_consent: false,
            whatsapp_consent: false,
            privacy_review_status: 'withdrawn',
            processing_restricted_at: now,
            anonymized_at: now,
          })
          .eq('id', contact.id)
          .eq('account_id', ctx.accountId);
        if (error) errors.push(`contacto ${contact.id}: ${error.message}`);
      }
      await db
        .from('privacy_settings')
        .update({ last_retention_run_at: now })
        .eq('account_id', ctx.accountId);
      await recordRun(db, ctx, mode, {
        contacts: eligible.length,
        anamnesis: formIds.length,
        messages: messageIds.length,
        attachments,
        excluded: excluded.length,
        details: {
          errors,
          cutoffs: {
            contactCutoff,
            healthCutoff,
            communicationCutoff,
            financeCutoff,
          },
        },
      });
      await notifyAccountEvent({
        accountId: ctx.accountId,
        type: 'retention_executed',
        category: 'system',
        priority: errors.length ? 'high' : 'normal',
        title: 'Rotina RGPD concluída',
        body: `${eligible.length} ficha(s), ${formIds.length} anamnese(s), ${messageIds.length} mensagem(ns) e ${attachments} anexo(s) tratados.`,
        actionUrl: '/settings?tab=privacy',
        dedupeKey: `retention:${now}`,
        metadata: { errors },
      });
      return Response.json({
        ok: true,
        count: eligible.length,
        anamnesis: formIds.length,
        messages: messageIds.length,
        attachments,
        excluded: excluded.length,
        errors,
      });
    }

    await recordRun(db, ctx, mode, {
      contacts: eligible.length,
      anamnesis: Number(expiredAnamnesis || 0),
      messages: Number(expiredMessages || 0),
      excluded: excluded.length,
      details: { awaitingNotice: awaitingNotice.length },
    });
    return Response.json({
      cutoffs: {
        contacts: contactCutoff,
        health: healthCutoff,
        communications: communicationCutoff,
        finance: financeCutoff,
      },
      eligible,
      awaitingNotice,
      excluded,
      count: eligible.length,
      expiredAnamnesis: Number(expiredAnamnesis || 0),
      expiredMessages: Number(expiredMessages || 0),
      noticeDays,
      backup: {
        retentionDays: settings?.backup_retention_days ?? 30,
        policy: settings?.backup_erasure_policy || null,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function recordRun(
  db: ReturnType<typeof supabaseAdmin>,
  ctx: { accountId: string; userId: string },
  mode: Mode,
  counts: {
    contacts?: number;
    anamnesis?: number;
    messages?: number;
    attachments?: number;
    excluded?: number;
    details: Record<string, unknown>;
  }
) {
  const errors = counts.details.errors;
  const hasErrors = Array.isArray(errors) && errors.length > 0;
  await db
    .from('privacy_retention_runs')
    .insert({
      id: crypto.randomUUID(),
      account_id: ctx.accountId,
      actor_user_id: ctx.userId,
      mode,
      status: hasErrors ? 'completed_with_errors' : 'completed',
      contact_count: counts.contacts ?? 0,
      anamnesis_count: counts.anamnesis ?? 0,
      message_count: counts.messages ?? 0,
      attachment_count: counts.attachments ?? 0,
      excluded_count: counts.excluded ?? 0,
      details: counts.details,
    });
  await db
    .from('privacy_audit_events')
    .insert({
      id: crypto.randomUUID(),
      account_id: ctx.accountId,
      actor_user_id: ctx.userId,
      action: `retention_${mode}`,
      entity_type: 'account',
      entity_id: ctx.accountId,
      reason: mode === 'execute' ? 'Execução manual confirmada' : null,
      metadata: counts,
    });
}
