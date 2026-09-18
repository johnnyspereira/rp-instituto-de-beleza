import type { AppointmentStatus } from '@/lib/clinic/appointment-email';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendAppointmentStatusCommunication } from '@/lib/clinic/appointment-communication';
import { sendAppointmentReviewRequest } from '@/lib/clinic/appointment-review';
import { createClient } from '@/lib/supabase/server';

const STATUSES = new Set<AppointmentStatus>([
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await createClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !STATUSES.has(body.status as AppointmentStatus))
    return Response.json({ error: 'Estado inválido.' }, { status: 400 });
  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('profiles')
    .select('account_id,account_role')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile || !['owner', 'admin', 'agent'].includes(profile.account_role))
    return Response.json({ error: 'Sem permissão.' }, { status: 403 });
  const { id } = await params;
  const { data: appointment } = await db
    .from('clinic_appointments')
    .select('id,status')
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .maybeSingle();
  if (!appointment)
    return Response.json(
      { error: 'Marcação não encontrada.' },
      { status: 404 }
    );
  if (appointment.status !== body.status)
    return Response.json(
      { error: 'O estado da marcação foi alterado novamente.' },
      { status: 409 }
    );
  try {
    const notification = await sendAppointmentStatusCommunication({
        db,
        appointmentId: id,
        status: body.status as AppointmentStatus,
      });
    const review = body.status === 'completed'
      ? await sendAppointmentReviewRequest(db, id, request.url).catch((error) => ({ error: error instanceof Error ? error.message : 'Falha ao enviar avalia\u00e7\u00e3o.' }))
      : null;
    return Response.json({ ...notification, review });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Falha no envio.' },
      { status: 502 }
    );
  }
}
