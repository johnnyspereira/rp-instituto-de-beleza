import { randomUUID } from 'node:crypto';

import {
  resolveAuditUserId,
  findOrCreateContact,
  ContactError,
} from '@/lib/api/v1/contacts';
import { sendAppointmentCommunication } from '@/lib/clinic/appointment-communication';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  );
}

async function portalSettings(slug: string) {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('client_portal_settings')
    .select('account_id,booking_enabled,booking_advance_days')
    .ilike('slug', slug.trim())
    .eq('enabled', true)
    .eq('booking_enabled', true)
    .maybeSingle();
  return { admin, settings: data };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { admin, settings } = await portalSettings(slug);
  if (!settings)
    return Response.json(
      { error: 'Agendamento indisponível.' },
      { status: 404 }
    );
  const [services, professionals] = await Promise.all([
    admin
      .from('clinic_services')
      .select('id,name,duration_minutes,price,currency')
      .eq('account_id', settings.account_id)
      .eq('is_active', true)
      .eq('internal_booking_enabled', true)
      .order('name'),
    admin
      .from('profiles')
      .select('id,full_name,professional_title')
      .eq('account_id', settings.account_id)
      .eq('is_professional', true)
      .order('full_name'),
  ]);
  return Response.json({
    services: services.data ?? [],
    professionals: professionals.data ?? [],
    bookingAdvanceDays: settings.booking_advance_days ?? 90,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = checkRateLimit(`guest-booking:${clientIp(request)}`, {
    limit: 8,
    windowMs: 60 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);
  try {
    const { slug } = await params;
    const { admin, settings } = await portalSettings(slug);
    if (!settings)
      return Response.json(
        { error: 'Agendamento indisponível.' },
        { status: 404 }
      );
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      email?: string;
      phone?: string;
      serviceId?: string;
      professionalId?: string;
      scheduledStart?: string;
      notes?: string;
    } | null;
    const name = body?.name?.trim() || '';
    const email = body?.email?.trim().toLowerCase() || '';
    const phone = body?.phone?.trim() || '';
    if (
      name.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !phone
    ) {
      return Response.json(
        { error: 'Preencha nome, email e telemóvel válidos.' },
        { status: 400 }
      );
    }
    const start = new Date(body?.scheduledStart || '');
    if (!Number.isFinite(start.getTime()) || start <= new Date()) {
      return Response.json(
        { error: 'Escolha uma data e hora futuras.' },
        { status: 400 }
      );
    }
    const max = new Date();
    max.setDate(max.getDate() + Number(settings.booking_advance_days ?? 90));
    if (start > max)
      return Response.json(
        { error: 'A data ultrapassa o limite de antecedência.' },
        { status: 400 }
      );

    const { data: service } = await admin
      .from('clinic_services')
      .select('id,duration_minutes,price,currency')
      .eq('id', body?.serviceId || '')
      .eq('account_id', settings.account_id)
      .eq('is_active', true)
      .eq('internal_booking_enabled', true)
      .maybeSingle();
    if (!service)
      return Response.json({ error: 'Serviço inválido.' }, { status: 400 });
    const { data: professional } = await admin
      .from('profiles')
      .select('id')
      .eq('id', body?.professionalId || '')
      .eq('account_id', settings.account_id)
      .eq('is_professional', true)
      .maybeSingle();
    if (!professional)
      return Response.json(
        { error: 'Profissional inválido.' },
        { status: 400 }
      );
    const end = new Date(
      start.getTime() + Number(service.duration_minutes || 60) * 60_000
    );

    const [appointments, blocks] = await Promise.all([
      admin
        .from('clinic_appointments')
        .select('id,status')
        .eq('account_id', settings.account_id)
        .eq('professional_profile_id', professional.id)
        .lt('scheduled_start', end.toISOString())
        .gt('scheduled_end', start.toISOString())
        .limit(25),
      admin
        .from('clinic_time_blocks')
        .select('id')
        .eq('account_id', settings.account_id)
        .lt('starts_at', end.toISOString())
        .gt('ends_at', start.toISOString())
        .or(
          `professional_profile_id.eq.${professional.id},professional_profile_id.is.null`
        )
        .limit(1),
    ]);
    const activeAppointments = (appointments.data ?? []).filter(
      (item) => !['cancelled', 'canceled', 'no_show'].includes(item.status)
    );
    if (activeAppointments.length || blocks.data?.length) {
      return Response.json(
        { error: 'Esse horário já não está disponível. Escolha outro.' },
        { status: 409 }
      );
    }

    const auditUserId = await resolveAuditUserId(admin, settings.account_id);
    const contact = await findOrCreateContact(
      admin,
      settings.account_id,
      auditUserId,
      {
        phone,
        name,
        email,
      }
    );
    if (!contact.created) {
      await admin
        .from('contacts')
        .update({ name, email })
        .eq('id', contact.id)
        .eq('account_id', settings.account_id);
    }
    const appointmentId = randomUUID();
    const { error } = await admin.from('clinic_appointments').insert({
      id: appointmentId,
      account_id: settings.account_id,
      user_id: auditUserId,
      contact_id: contact.id,
      service_id: service.id,
      professional_profile_id: professional.id,
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      status: 'scheduled',
      source: 'public_link',
      price: Number(service.price ?? 0),
      currency: service.currency || 'EUR',
      notes: body?.notes?.trim().slice(0, 2000) || null,
      confirmation_status: 'pending',
    });
    if (error) throw new Error(error.message);
    try {
      await sendAppointmentCommunication({
        db: admin,
        appointmentId,
        origin: new URL(request.url).origin,
      });
    } catch (error) {
      console.warn('[guest-booking] confirmation delivery failed:', error);
    }
    return Response.json({ ok: true, appointmentId }, { status: 201 });
  } catch (error) {
    if (error instanceof ContactError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error('[guest-booking] failed:', error);
    return Response.json(
      { error: 'Não foi possível concluir o agendamento.' },
      { status: 500 }
    );
  }
}
