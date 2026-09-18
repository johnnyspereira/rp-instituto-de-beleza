import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { engineSendText } from '@/lib/automations/meta-send';
import {
  appointmentConfirmationEmail,
  appointmentStatusEmail,
  appointmentStatusMessage,
  type AppointmentBenefitEmailInfo,
  type AppointmentStatus,
} from '@/lib/clinic/appointment-email';
import {
  buildAppointmentMessage,
  canMessageAppointment,
  defaultAppointmentMessageTemplates,
  renderAppointmentMessageTemplate,
  type AppointmentMessageAction,
  type AppointmentMessageTemplates,
  type AppointmentMessageRow,
} from '@/lib/clinic/appointment-messages';
import { sendLocalEmail } from '@/lib/email/smtp';
import { notifyAccountEvent } from '@/lib/notifications/account-events';
import { getPublicUrl } from '@/lib/public-url';

type Delivery = { sent: boolean; skipped: boolean; error: string | null };
export type AppointmentDeliveries = { whatsapp: Delivery; email: Delivery };

export async function sendAppointmentCommunication({
  db,
  appointmentId,
  origin,
  action = 'confirmation',
  messageOverride,
  confirmationApproved = false,
}: {
  db: SupabaseClient;
  appointmentId: string;
  origin: string;
  action?: AppointmentMessageAction;
  messageOverride?: string | null;
  confirmationApproved?: boolean;
}) {
  const { data: appointment, error } = await loadAppointment(db, appointmentId);
  if (error || !appointment)
    throw new Error(error?.message || 'Marcação não encontrada.');
  const row = appointment as AppointmentMessageRow;
  const email = appointment.contact?.email?.trim() || null;
  if (!canMessageAppointment(row) && !email)
    throw new Error(
      'O cliente não possui telefone nem email para receber a confirmação.'
    );
  const { data: settings } = await db
    .from('clinic_communication_settings')
    .select('*')
    .eq('account_id', appointment.account_id)
    .maybeSingle();
  if (action === 'confirmation' && settings?.auto_send_confirmation === false)
    return { text: null, anamnesisUrl: null, skipped: true };

  let anamnesisUrl: string | null = null;
  if (action === 'confirmation') {
    const { data: existing } = await db
      .from('clinic_anamnesis_forms')
      .select('id,public_token')
      .eq('appointment_id', appointment.id)
      .maybeSingle();
    let form = existing;
    if (!form) {
      const { data: created, error: formError } = await db
        .from('clinic_anamnesis_forms')
        .insert({
          account_id: appointment.account_id,
          contact_id: appointment.contact_id,
          appointment_id: appointment.id,
          service_id: appointment.service_id,
          public_token: randomUUID(),
          client_name: appointment.contact?.name || null,
          client_email: email,
          client_phone: appointment.contact?.phone || null,
          birth_date: appointment.contact?.birth_date || null,
          selected_modalities: [
            appointment.service?.name,
            appointment.service?.category,
          ].filter((value): value is string => Boolean(value)),
          answers: {},
          expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        })
        .select('id,public_token')
        .single();
      if (formError)
        throw new Error(`Falha ao criar anamnese: ${formError.message}`);
      form = created;
      await db
        .from('clinic_appointments')
        .update({ anamnesis_form_id: form.id })
        .eq('id', appointment.id);
    }
    anamnesisUrl = getPublicUrl(`/anamnese/${form.public_token}`, origin);
  }

  const sender = appointment.user_id || appointment.account?.owner_user_id;
  if (!sender)
    throw new Error('Não foi possível identificar o remetente da clínica.');
  const businessName = appointment.account?.name || '';
  const benefit = await loadAppointmentBenefit(db, appointment);
  const messageOptions = {
    clinicAddress: settings?.clinic_address,
    directions: settings?.directions,
    parkingInfo: settings?.parking_info,
    paymentMethods: settings?.payment_methods,
    anamnesisUrl,
    anamnesisIntro: settings?.anamnesis_intro,
    benefit,
  };
  const fallbackText = buildAppointmentMessage(
    row,
    action,
    businessName,
    messageOptions
  );
  const configuredTemplates = settings?.automated_message_templates as
    | Partial<AppointmentMessageTemplates>
    | null
    | undefined;
  const configuredTemplate = configuredTemplates?.[action];
  const generatedText =
    typeof configuredTemplate === 'string' && configuredTemplate.trim()
      ? renderAppointmentMessageTemplate(
          configuredTemplate,
          row,
          businessName,
          messageOptions
        )
      : configuredTemplates
        ? renderAppointmentMessageTemplate(
            defaultAppointmentMessageTemplates[action],
            row,
            businessName,
            messageOptions
          )
        : fallbackText;
  const text = messageOverride?.trim() || generatedText;
  const deliveries = await deliverChannels({
    db,
    appointment: row,
    accountId: appointment.account_id,
    contactId: appointment.contact_id,
    userId: sender,
    whatsappText: text,
    email,
    emailContent: appointmentConfirmationEmail({
      appointment: row,
      businessName,
      logoUrl: appointment.account?.logo_url,
      anamnesisUrl,
      benefit,
    }),
  });
  const now = new Date().toISOString();
  const update =
    action === 'pending_confirmation'
      ? { confirmation_reminder_sent_at: now }
      : action === 'reminder'
        ? { reminder_sent_at: now }
        : confirmationApproved
          ? {
              confirmation_status: 'confirmed',
              confirmation_requested_at: now,
              confirmation_response_at: now,
              confirmation_sent_at: now,
              confirmation_request_message: text,
            }
          : {
            confirmation_status: 'pending',
            confirmation_requested_at: now,
            confirmation_response_at: null,
            confirmation_sent_at: now,
            confirmation_request_message: text,
          };
  if (deliveries.whatsapp.sent || deliveries.email.sent)
    await db
      .from('clinic_appointments')
      .update(update)
      .eq('id', appointment.id);
  await logDelivery(db, appointment, action, deliveries);
  await notifyAppointmentDelivery(appointment, action, deliveries);
  return { text, anamnesisUrl, skipped: false, deliveries };
}

export async function sendAppointmentStatusCommunication(input: {
  db: SupabaseClient;
  appointmentId: string;
  status: AppointmentStatus;
}) {
  const { data: appointment, error } = await loadAppointment(
    input.db,
    input.appointmentId
  );
  if (error || !appointment)
    throw new Error(error?.message || 'Marcação não encontrada.');
  const sender = appointment.user_id || appointment.account?.owner_user_id;
  if (!sender)
    throw new Error('Não foi possível identificar o remetente da clínica.');
  const row = appointment as AppointmentMessageRow;
  const businessName = appointment.account?.name || '';
  const deliveries = await deliverChannels({
    db: input.db,
    appointment: row,
    accountId: appointment.account_id,
    contactId: appointment.contact_id,
    userId: sender,
    whatsappText: appointmentStatusMessage({
      appointment: row,
      businessName,
      status: input.status,
    }),
    email: appointment.contact?.email?.trim() || null,
    emailContent: appointmentStatusEmail({
      appointment: row,
      businessName,
      logoUrl: appointment.account?.logo_url,
      status: input.status,
    }),
  });
  await logDelivery(
    input.db,
    appointment,
    'status_changed',
    deliveries,
    input.status
  );
  await notifyAppointmentDelivery(
    appointment,
    'status_changed',
    deliveries,
    input.status
  );
  return { deliveries };
}

async function notifyAppointmentDelivery(
  appointment: {
    account_id: string;
    id: string;
    contact_id: string;
    contact?: { name?: string | null } | null;
  },
  action: AppointmentMessageAction | 'status_changed',
  deliveries: AppointmentDeliveries,
  status?: AppointmentStatus
) {
  const failed = [deliveries.email.error, deliveries.whatsapp.error].filter(
    Boolean
  );
  const sentChannels = [
    deliveries.email.sent ? 'email' : null,
    deliveries.whatsapp.sent ? 'WhatsApp' : null,
  ].filter((channel): channel is string => Boolean(channel));
  const client = appointment.contact?.name || 'Cliente';
  const successful = sentChannels.length > 0;
  try {
    await notifyAccountEvent({
      accountId: appointment.account_id,
      type: successful
        ? 'appointment_communication_sent'
        : 'appointment_communication_failed',
      category: 'clinic',
      priority: failed.length ? 'high' : 'normal',
      title: successful
        ? `Comunicação enviada a ${client}`
        : `Falha ao notificar ${client}`,
      body: successful
        ? `${action === 'status_changed' ? `Estado alterado para ${status}. ` : ''}Enviado por ${sentChannels.join(' e ')}${failed.length ? `; falhou: ${failed.join(' | ')}` : '.'}`
        : failed.join(' | ') || 'Nenhum canal de comunicação disponível.',
      actionUrl: `/agenda?appointment=${encodeURIComponent(appointment.id)}`,
      contactId: appointment.contact_id,
      dedupeKey: `appointment:${appointment.id}:${action}:${status || 'none'}:${Date.now()}`,
      metadata: { appointmentId: appointment.id, action, status, deliveries },
    });
  } catch (notificationError) {
    console.error(
      '[appointment] internal notification failed:',
      notificationError
    );
  }
}

function loadAppointment(db: SupabaseClient, appointmentId: string) {
  return db
    .from('clinic_appointments')
    .select(
      '*, contact:contacts(id,name,phone,email,birth_date), service:clinic_services(id,name,category), professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name,email), account:accounts(name,logo_url,owner_user_id)'
    )
    .eq('id', appointmentId)
    .single();
}

async function loadAppointmentBenefit(
  db: SupabaseClient,
  appointment: {
    id: string;
    currency?: string | null;
    referral_discount_amount?: number | null;
  }
): Promise<AppointmentBenefitEmailInfo> {
  const currency = appointment.currency || 'EUR';
  const money = (value: number) =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(
      value
    );
  const referralDiscount = Number(appointment.referral_discount_amount || 0);
  if (referralDiscount > 0)
    return {
      type: 'referral',
      label: 'Indique & Ganhe',
      detail: `${money(referralDiscount)} de desconto aplicado nesta sessão`,
    };

  const { data: benefits } = await db
    .from('finance_appointment_benefits')
    .select(
      'benefit_type,status,reserved_amount,reserved_sessions,voucher_id,client_pack_id'
    )
    .eq('appointment_id', appointment.id)
    .in('status', ['reserved', 'consumed'])
    .limit(1);
  const benefit = benefits?.[0];
  if (benefit?.benefit_type === 'voucher') {
    const { data: voucher } = await db
      .from('finance_vouchers')
      .select('code')
      .eq('id', benefit.voucher_id)
      .maybeSingle();
    return {
      type: 'voucher',
      label: `Voucher${voucher?.code ? ` ${voucher.code}` : ''}`,
      detail:
        Number(benefit.reserved_amount || 0) > 0
          ? `${money(Number(benefit.reserved_amount))} reservados para esta sessão`
          : 'Utilização reservada para esta sessão',
    };
  }
  if (benefit?.benefit_type === 'pack') {
    const { data: pack } = await db
      .from('finance_client_packs')
      .select('code,pack:finance_pack_catalog(name)')
      .eq('id', benefit.client_pack_id)
      .maybeSingle();
    const catalog = Array.isArray(pack?.pack) ? pack.pack[0] : pack?.pack;
    return {
      type: 'pack',
      label: catalog?.name || `Pack${pack?.code ? ` ${pack.code}` : ''}`,
      detail: `${Number(benefit.reserved_sessions || 1)} sessão reservada no pack`,
    };
  }
  return {
    type: 'direct',
    label: 'Pagamento direto',
    detail: 'Sem voucher ou pack associado a esta marcação',
  };
}

async function deliverChannels(input: {
  db: SupabaseClient;
  appointment: AppointmentMessageRow;
  accountId: string;
  contactId: string;
  userId: string;
  whatsappText: string;
  email: string | null;
  emailContent: { subject: string; text: string; html: string };
}) {
  const result: AppointmentDeliveries = {
    whatsapp: { sent: false, skipped: false, error: null },
    email: { sent: false, skipped: false, error: null },
  };
  if (canMessageAppointment(input.appointment)) {
    try {
      const conversationId = await findOrCreateConversation(
        input.db,
        input.accountId,
        input.contactId,
        input.userId
      );
      await engineSendText({
        accountId: input.accountId,
        userId: input.userId,
        conversationId,
        contactId: input.contactId,
        text: input.whatsappText,
      });
      result.whatsapp.sent = true;
    } catch (error) {
      result.whatsapp.error = errorMessage(error, 'Falha no WhatsApp.');
    }
  } else result.whatsapp.skipped = true;
  if (input.email) {
    try {
      await sendLocalEmail({ to: input.email, profile: 'agenda', ...input.emailContent });
      result.email.sent = true;
    } catch (error) {
      result.email.error = errorMessage(error, 'Falha no email.');
    }
  } else result.email.skipped = true;
  return result;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function logDelivery(
  db: SupabaseClient,
  appointment: {
    account_id: string;
    id: string;
    contact_id: string;
    contact?: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
  },
  action: AppointmentMessageAction | 'status_changed',
  deliveries: AppointmentDeliveries,
  status?: AppointmentStatus
) {
  await db.from('clinic_agenda_events').insert({
    account_id: appointment.account_id,
    entity_type: 'appointment',
    entity_id: appointment.id,
    action: 'message_sent',
    reason:
      action === 'status_changed'
        ? `Notificação de estado enviada: ${status}`
        : 'Comunicação automática da marcação enviada',
    metadata: {
      message_action: action,
      status: status ?? null,
      contact_id: appointment.contact_id,
      recipient: {
        name: appointment.contact?.name ?? null,
        phone: appointment.contact?.phone ?? null,
        email: appointment.contact?.email ?? null,
      },
      deliveries,
    },
  });
}

async function findOrCreateConversation(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  userId: string
) {
  const { data: existing } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (existing?.[0]?.id) return existing[0].id as string;
  const { data: created, error } = await db
    .from('conversations')
    .insert({ account_id: accountId, user_id: userId, contact_id: contactId })
    .select('id')
    .single();
  if (error || !created)
    throw new Error(error?.message || 'Falha ao criar conversa.');
  return created.id as string;
}
