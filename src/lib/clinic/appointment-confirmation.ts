import type { SupabaseClient } from '@supabase/supabase-js';

export type AppointmentConfirmationDecision = 'confirmed' | 'declined' | null;

export interface AppointmentConfirmationResult {
  handled: boolean;
  decision: AppointmentConfirmationDecision;
  appointmentId?: string;
  error?: string;
}

type PendingAppointmentRow = {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
};

const CONFIRM_WORDS = new Set([
  'confirmar',
  'confirmado',
  'confirmada',
  'confirmo',
  'sim',
  'ok',
  'certo',
  'feito',
  'pode ser',
]);

const DECLINE_WORDS = new Set([
  'nao',
  'não',
  'reagendar',
  'remarcar',
  'alterar',
  'mudar',
  'cancelar',
  'cancela',
  'nao posso',
  'não posso',
]);

function normalizeReply(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyAppointmentConfirmationReply(
  messageText: string
): AppointmentConfirmationDecision {
  const normalized = normalizeReply(messageText);
  if (!normalized) return null;

  if (DECLINE_WORDS.has(normalized)) return 'declined';
  if (CONFIRM_WORDS.has(normalized)) return 'confirmed';

  if (normalized.includes('nao posso') || normalized.includes('nao consigo')) {
    return 'declined';
  }
  if (
    normalized.includes('confirmo') ||
    normalized.includes('confirmado') ||
    normalized.includes('pode ser')
  ) {
    return 'confirmed';
  }
  if (
    normalized.includes('reagendar') ||
    normalized.includes('remarcar') ||
    normalized.includes('mudar horario') ||
    normalized.includes('alterar horario')
  ) {
    return 'declined';
  }

  return null;
}

function isMissingConfirmationSchema(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205' ||
    error.message?.includes('clinic_appointments') ||
    error.message?.includes('clinic_agenda_events') ||
    error.message?.includes('confirmation_status')
  );
}

export async function handleAppointmentConfirmationReply({
  db,
  accountId,
  contactId,
  messageText,
  conversationId,
  sourceMessageId,
}: {
  db: SupabaseClient;
  accountId: string;
  contactId: string;
  messageText: string;
  conversationId?: string | null;
  sourceMessageId?: string | null;
}): Promise<AppointmentConfirmationResult> {
  const decision = classifyAppointmentConfirmationReply(messageText);
  if (!decision) return { handled: false, decision: null };

  const { data, error } = await db
    .from('clinic_appointments')
    .select('id, scheduled_start, scheduled_end, status')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('confirmation_status', 'pending')
    .gte(
      'scheduled_start',
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    )
    .order('scheduled_start', { ascending: true })
    .limit(1);

  if (error) {
    if (isMissingConfirmationSchema(error)) {
      return { handled: false, decision, error: error.message };
    }
    console.error('[clinic] appointment confirmation lookup failed:', error);
    return { handled: false, decision, error: error.message };
  }

  const appointment = (data?.[0] ?? null) as PendingAppointmentRow | null;
  if (!appointment) return { handled: false, decision };

  const now = new Date().toISOString();
  const update =
    decision === 'confirmed'
      ? {
          status: 'confirmed',
          confirmation_status: 'confirmed',
          confirmation_response_at: now,
          updated_at: now,
        }
      : {
          confirmation_status: 'declined',
          confirmation_response_at: now,
          updated_at: now,
        };

  const { error: updateError } = await db
    .from('clinic_appointments')
    .update(update)
    .eq('id', appointment.id)
    .eq('account_id', accountId);

  if (updateError) {
    if (!isMissingConfirmationSchema(updateError)) {
      console.error(
        '[clinic] appointment confirmation update failed:',
        updateError
      );
    }
    return { handled: false, decision, error: updateError.message };
  }

  const { error: eventError } = await db.from('clinic_agenda_events').insert({
    account_id: accountId,
    user_id: null,
    entity_type: 'appointment',
    entity_id: appointment.id,
    action: 'status_changed',
    reason:
      decision === 'confirmed'
        ? 'Cliente confirmou a alteração pelo WhatsApp'
        : 'Cliente pediu alteração/reagendamento pelo WhatsApp',
    metadata: {
      confirmation_decision: decision,
      contact_id: contactId,
      conversation_id: conversationId ?? null,
      source_message_id: sourceMessageId ?? null,
      reply_text: messageText,
    },
    old_starts_at: appointment.scheduled_start,
    old_ends_at: appointment.scheduled_end,
    new_starts_at: appointment.scheduled_start,
    new_ends_at: appointment.scheduled_end,
  });

  if (eventError && !isMissingConfirmationSchema(eventError)) {
    console.warn(
      '[clinic] appointment confirmation event failed:',
      eventError.message
    );
  }

  return { handled: true, decision, appointmentId: appointment.id };
}
