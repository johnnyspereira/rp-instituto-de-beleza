import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';
import { randomUUID } from 'node:crypto';
import {
  sendAppointmentCommunication,
  sendAppointmentStatusCommunication,
} from '@/lib/clinic/appointment-communication';
import { notifyAccountEvent } from '@/lib/notifications/account-events';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { sessionClient, admin, access } = await requirePortalAccess(slug);
    const body = (await request.json()) as Record<string, unknown>;
    const { data, error } = await sessionClient.rpc(
      'portal_create_appointment',
      {
        p_slug: slug,
        p_service_id: body.serviceId,
        p_professional_profile_id: body.professionalId,
        p_scheduled_start: body.scheduledStart,
        p_benefit_code: body.benefitCode || null,
        p_benefit_pin: body.benefitPin || null,
        p_notes: body.notes || null,
      }
    );
    if (error) return Response.json({ error: error.message }, { status: 400 });
    let alertWarning: string | null = null;
    try {
      const { data: appointment } = await admin
        .from('clinic_appointments')
        .select('id,scheduled_start,contact:contacts(name,phone),service:clinic_services(name),professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name)')
        .eq('id', String(data))
        .eq('account_id', access.account_id)
        .maybeSingle();
      if (appointment) {
        const contact = Array.isArray(appointment.contact) ? appointment.contact[0] : appointment.contact;
        const appointmentService = Array.isArray(appointment.service) ? appointment.service[0] : appointment.service;
        const professionalRow = Array.isArray(appointment.professional) ? appointment.professional[0] : appointment.professional;
        const client = contact?.name || contact?.phone || 'Cliente';
        const service = appointmentService?.name || 'Serviço';
        const professional = professionalRow?.full_name || 'Profissional';
        const when = new Intl.DateTimeFormat('pt-PT', {
          dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Lisbon',
        }).format(new Date(appointment.scheduled_start));
        await notifyAccountEvent({
          accountId: access.account_id,
          type: 'portal_appointment_created',
          category: 'clinic',
          priority: 'high',
          title: 'Nova marcação pelo Portal 360',
          body: `${client} marcou ${service} para ${when} com ${professional}.`,
          actionUrl: `/agenda?appointment=${appointment.id}`,
          contactId: access.contact_id,
          dedupeKey: `portal-appointment:${appointment.id}`,
          whatsappText: `📅 *Nova marcação pelo Portal 360*\n\nCliente: *${client}*\nServiço: *${service}*\nData: *${when}*\nProfissional: *${professional}*\n\nAbra a Agenda para gerir a marcação.`,
        });
      }
    } catch (alertError) {
      alertWarning = alertError instanceof Error ? alertError.message : 'Falha no alerta ao responsável.';
      console.error('[portal-appointment-alert]', alertError);
    }
    let messageWarning: string | null = null;
    let messageSkipped = false;
    try {
      const communication = await sendAppointmentCommunication({
        db: admin,
        appointmentId: String(data),
        origin: new URL(request.url).origin,
      });
      messageSkipped = communication.skipped;
    } catch (messageError) {
      messageWarning =
        messageError instanceof Error
          ? messageError.message
          : 'Falha no envio.';
    }
    return Response.json(
      { appointmentId: data, messageWarning, messageSkipped, alertWarning },
      { status: 201 }
    );
  } catch (error) {
    return portalErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { sessionClient, admin, access } = await requirePortalAccess(slug);
    const body = (await request.json()) as {
      appointmentId?: string;
      action?: 'cancel' | 'reschedule';
      requestedStart?: string;
      reason?: string;
    };
    if (!body.appointmentId)
      return Response.json(
        { error: 'Appointment is required' },
        { status: 400 }
      );
    if (body.action === 'reschedule') {
      const requestedStart = new Date(body.requestedStart ?? '');
      if (Number.isNaN(requestedStart.getTime()) || requestedStart <= new Date()) {
        return Response.json({ error: 'Escolha uma data e hora futuras.' }, { status: 400 });
      }
      const { data: appointment, error: appointmentError } = await admin
        .from('clinic_appointments')
        .select('id,account_id,contact_id,scheduled_start,scheduled_end,service:clinic_services(name)')
        .eq('id', body.appointmentId)
        .eq('account_id', access.account_id)
        .eq('contact_id', access.contact_id)
        .in('status', ['scheduled', 'confirmed'])
        .maybeSingle();
      if (appointmentError || !appointment) {
        return Response.json({ error: 'Esta marcação já não pode ser alterada.' }, { status: 400 });
      }
      const duration = Math.max(15, new Date(appointment.scheduled_end).getTime() - new Date(appointment.scheduled_start).getTime());
      const requestedEnd = new Date(requestedStart.getTime() + duration).toISOString();
      const { error: eventError } = await admin.from('clinic_agenda_events').insert({
        id: randomUUID(),
        account_id: access.account_id,
        user_id: null,
        entity_type: 'appointment',
        entity_id: appointment.id,
        action: 'status_changed',
        reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null,
        metadata: {
          kind: 'portal_reschedule',
          state: 'awaiting_professional',
          contact_id: access.contact_id,
          selected_slot: {
            startsAt: requestedStart.toISOString(),
            endsAt: requestedEnd,
            label: requestedStart.toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Lisbon' }),
          },
        },
        old_starts_at: appointment.scheduled_start,
        old_ends_at: appointment.scheduled_end,
        new_starts_at: requestedStart.toISOString(),
        new_ends_at: requestedEnd,
      });
      if (eventError) return Response.json({ error: eventError.message }, { status: 400 });
      const service = Array.isArray(appointment.service) ? appointment.service[0] : appointment.service;
      await notifyAccountEvent({
        accountId: access.account_id,
        type: 'appointment_reschedule_preference',
        category: 'clinic',
        priority: 'high',
        title: 'Pedido de alteração pelo Portal 360',
        body: `${service?.name || 'Sessão'}: o cliente pediu ${requestedStart.toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Lisbon' })}. Aguarda aprovação do profissional.`,
        actionUrl: `/agenda?appointment=${appointment.id}`,
        contactId: access.contact_id,
        dedupeKey: `portal-reschedule:${appointment.id}:${requestedStart.toISOString()}`,
      });
      return Response.json({ ok: true, pendingApproval: true });
    }

    const { error } = await sessionClient.rpc('portal_cancel_appointment', {
      p_slug: slug,
      p_appointment_id: body.appointmentId,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    let notificationWarning: string | null = null;
    try {
      await sendAppointmentStatusCommunication({
        db: admin,
        appointmentId: body.appointmentId,
        status: 'cancelled',
      });
    } catch (notificationError) {
      notificationWarning =
        notificationError instanceof Error
          ? notificationError.message
          : 'Falha na notificação.';
    }
    return Response.json({ ok: true, notificationWarning });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
