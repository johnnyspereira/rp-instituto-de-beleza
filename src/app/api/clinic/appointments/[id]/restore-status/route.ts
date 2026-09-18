import { requireRole, toErrorResponse } from '@/lib/auth/account';
import type { ClinicAppointmentStatus } from '@/types';

const RESTORABLE_STATUSES = new Set<ClinicAppointmentStatus>([
  'scheduled',
  'confirmed',
  'completed',
  'no_show',
]);

/**
 * Reopens a cancelled appointment. This is deliberately owner-only: a
 * cancellation is an audit-sensitive state and agents must not be able to
 * silently reverse it from the browser.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId, userId } = await requireRole('owner');
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
      reason?: unknown;
    } | null;
    const status = typeof body?.status === 'string' ? body.status : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!RESTORABLE_STATUSES.has(status as ClinicAppointmentStatus)) {
      return Response.json({ error: 'Escolha um novo estado válido.' }, { status: 400 });
    }
    if (reason.length < 3 || reason.length > 1000) {
      return Response.json(
        { error: 'Indique um motivo entre 3 e 1000 caracteres.' },
        { status: 400 }
      );
    }

    const { data: appointment, error: readError } = await supabase
      .from('clinic_appointments')
      .select('id,status,scheduled_start,scheduled_end')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (readError) throw readError;
    if (!appointment) {
      return Response.json({ error: 'Marcação não encontrada.' }, { status: 404 });
    }
    if (appointment.status !== 'cancelled') {
      return Response.json(
        { error: 'Apenas marcações canceladas podem ser reabertas.' },
        { status: 409 }
      );
    }

    const { error: updateError } = await supabase
      .from('clinic_appointments')
      .update({ status, cancelled_at: null })
      .eq('id', id)
      .eq('account_id', accountId);
    if (updateError) throw updateError;

    const { error: eventError } = await supabase
      .from('clinic_agenda_events')
      .insert({
        id: crypto.randomUUID(),
        account_id: accountId,
        user_id: userId,
        entity_type: 'appointment',
        entity_id: id,
        action: 'status_changed',
        reason,
        metadata: {
          previous_status: 'cancelled',
          new_status: status,
          changed_by: 'owner_reopen',
        },
        old_starts_at: appointment.scheduled_start,
        old_ends_at: appointment.scheduled_end,
        new_starts_at: appointment.scheduled_start,
        new_ends_at: appointment.scheduled_end,
      });
    if (eventError) throw eventError;

    return Response.json({ success: true, status });
  } catch (error) {
    return toErrorResponse(error);
  }
}
