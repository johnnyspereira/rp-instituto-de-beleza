import type { AppointmentMessageRow } from '@/lib/clinic/appointment-messages';
import { brandedEmail } from '@/lib/email/templates';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentBenefitEmailInfo = {
  type: 'voucher' | 'pack' | 'referral' | 'wallet' | 'direct';
  label: string;
  detail: string;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const STATUS_COPY: Record<
  AppointmentStatus,
  { title: string; message: string }
> = {
  scheduled: {
    title: 'Agendamento marcado',
    message: 'O seu agendamento foi marcado.',
  },
  confirmed: {
    title: 'Agendamento confirmado',
    message: 'A sua presença foi confirmada.',
  },
  in_progress: {
    title: 'Atendimento iniciado',
    message: 'O seu atendimento foi iniciado.',
  },
  completed: {
    title: 'Atendimento concluído',
    message: 'O seu atendimento foi concluído. Obrigado pela preferência.',
  },
  cancelled: {
    title: 'Agendamento cancelado',
    message: 'O seu agendamento foi cancelado.',
  },
  no_show: {
    title: 'Falta registada',
    message: 'O seu agendamento foi registado como falta.',
  },
};

function appointmentDetails(appointment: AppointmentMessageRow) {
  const amount = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: appointment.currency || 'EUR',
  }).format(Number(appointment.price || 0));
  return {
    client: appointment.contact?.name?.trim() || 'Cliente',
    service: appointment.service?.name || 'Atendimento',
    professional:
      appointment.professional?.full_name ||
      appointment.professional?.email ||
      'Equipa da clínica',
    date: dateLabel(appointment.scheduled_start),
    amount,
  };
}

function emailShell(input: {
  businessName: string;
  preheader: string;
  title: string;
  greeting: string;
  message: string;
  appointment: AppointmentMessageRow;
  actionUrl?: string | null;
  actionLabel?: string;
  logoUrl?: string | null;
  benefit?: AppointmentBenefitEmailInfo | null;
}) {
  const details = appointmentDetails(input.appointment);
  const brand = input.businessName.trim() || 'RP Instituto de Beleza';
  const benefitDetails = input.benefit
    ? [
        { label: 'Forma de utilização', value: input.benefit.label },
        { label: 'Benefício reservado', value: input.benefit.detail },
      ]
    : [];
  const text = [
    input.greeting,
    input.message,
    `Serviço: ${details.service}`,
    `Data e hora: ${details.date}`,
    `Profissional: ${details.professional}`,
    `Valor: ${details.amount}`,
    input.benefit
      ? `Benefício: ${input.benefit.label} — ${input.benefit.detail}`
      : null,
    input.actionUrl ? `${input.actionLabel}: ${input.actionUrl}` : null,
    brand,
  ]
    .filter(Boolean)
    .join('\n\n');
  const html = brandedEmail({
    businessName: brand,
    logoUrl: input.logoUrl,
    signOffName: brand,
    preheader: input.preheader,
    eyebrow: 'Agenda',
    title: input.title,
    greeting: input.greeting,
    message: input.message,
    details: [
      { label: 'Serviço', value: details.service },
      { label: 'Data e hora', value: details.date },
      { label: 'Profissional', value: details.professional },
      { label: 'Valor da sessão', value: details.amount },
      ...benefitDetails,
    ],
    action: input.actionUrl
      ? { label: input.actionLabel || 'Abrir', url: input.actionUrl }
      : null,
    notice: input.actionUrl
      ? 'A ficha de anamnese é confidencial e ajuda-nos a preparar o seu atendimento com segurança.'
      : undefined,
  });
  return { subject: `${input.title} — ${brand}`, text, html };
}

export function appointmentConfirmationEmail(input: {
  appointment: AppointmentMessageRow;
  businessName: string;
  logoUrl?: string | null;
  anamnesisUrl?: string | null;
  benefit?: AppointmentBenefitEmailInfo | null;
}) {
  const name = input.appointment.contact?.name?.trim();
  return emailShell({
    businessName: input.businessName,
    preheader: 'Recebemos o seu agendamento.',
    title: 'Confirmação do seu agendamento',
    greeting: name ? `Olá, ${name}.` : 'Olá.',
    message:
      'Recebemos o seu agendamento. Para confirmar a presença ou pedir outro horário, responda ao WhatsApp da clínica.',
    appointment: input.appointment,
    logoUrl: input.logoUrl,
    benefit: input.benefit,
    actionUrl: input.anamnesisUrl,
    actionLabel: 'Preencher ficha de anamnese',
  });
}

export function appointmentStatusMessage(input: {
  appointment: AppointmentMessageRow;
  businessName: string;
  status: AppointmentStatus;
}) {
  const copy = STATUS_COPY[input.status];
  const details = appointmentDetails(input.appointment);
  const name = input.appointment.contact?.name?.trim();
  return [
    name ? `Olá, ${name}.` : 'Olá.',
    '',
    `*${copy.title}*`,
    copy.message,
    '',
    `Serviço: ${details.service}`,
    `Data e hora: ${details.date}`,
    `Profissional: ${details.professional}`,
    '',
    `Equipa ${input.businessName.trim() || 'da clínica'}`,
  ].join('\n');
}

export function appointmentStatusEmail(input: {
  appointment: AppointmentMessageRow;
  businessName: string;
  logoUrl?: string | null;
  status: AppointmentStatus;
}) {
  const copy = STATUS_COPY[input.status];
  const name = input.appointment.contact?.name?.trim();
  return emailShell({
    businessName: input.businessName,
    preheader: copy.message,
    title: copy.title,
    greeting: name ? `Olá, ${name}.` : 'Olá.',
    message: copy.message,
    appointment: input.appointment,
    logoUrl: input.logoUrl,
  });
}
