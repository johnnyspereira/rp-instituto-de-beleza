import type { ClinicAppointment, ClinicService, Contact } from '@/types';

export type AppointmentMessageAction =
  'confirmation' | 'reminder' | 'pending_confirmation';

export type AppointmentMessageTemplates = Record<
  AppointmentMessageAction,
  string
>;

export const defaultAppointmentMessageTemplates: AppointmentMessageTemplates = {
  confirmation:
    '✨ *Detalhes da sua marcação* ✨\nOlá, {cliente} 😊\n\n💆 *Serviço:* {servico}\n📅 *Data:* {data}\n🕘 *Horário:* {hora}\n🎟️ {beneficio}\n🙎🏻‍♂️ *Profissional:* {profissional}\n📍 *Morada:* {morada}\n\nPara confirmar responda *CONFIRMAR*. Para alterar responda *REAGENDAR*.\n\n{link_anamnese}\n\n*{empresa}*',
  reminder:
    'Olá, {cliente}. 😊\n\nLembramos a sua sessão de *{servico}* em {data}, às {hora}.\n{beneficio}\n\nCaso necessite de apoio, responda a esta mensagem.\n\n*{empresa}*',
  pending_confirmation:
    'Olá, {cliente}. 😊\n\nAinda aguardamos a confirmação da sua sessão de *{servico}*, em {data}, às {hora}.\n\nResponda *CONFIRMAR* ou *REAGENDAR*.\n\n*{empresa}*',
};

export type AppointmentMessageOptions = {
  clinicAddress?: string | null;
  directions?: string | null;
  parkingInfo?: string | null;
  paymentMethods?: string | null;
  anamnesisUrl?: string | null;
  anamnesisIntro?: string | null;
  benefit?: {
    type: 'voucher' | 'pack' | 'referral' | 'wallet' | 'direct';
    label: string;
    detail: string;
  } | null;
};

export type AppointmentMessageRow = Omit<
  ClinicAppointment,
  'contact' | 'service' | 'professional'
> & {
  contact?: Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null;
  service?: Pick<ClinicService, 'name'> | null;
  professional?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function appointmentTimeRange(appointment: AppointmentMessageRow) {
  const start = new Date(appointment.scheduled_start);
  const end = new Date(appointment.scheduled_end);
  return `${pad(start.getHours())}:${pad(start.getMinutes())}-${pad(
    end.getHours()
  )}:${pad(end.getMinutes())}`;
}

export function appointmentDateTimeLabel(appointment: AppointmentMessageRow) {
  const start = new Date(appointment.scheduled_start);
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
}

export function appointmentSentAtLabel(value: string | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function appointmentContactLabel(
  contact: AppointmentMessageRow['contact']
) {
  if (!contact) return 'Contato não vinculado';
  return contact.name?.trim() || contact.phone || 'Contato sem nome';
}

function contactGreeting(contact: AppointmentMessageRow['contact']) {
  const name = contact?.name?.trim();
  return name ? `Olá, ${name}.` : 'Olá.';
}

function professionalLabel(appointment: AppointmentMessageRow) {
  return (
    appointment.professional?.full_name ||
    appointment.professional?.email ||
    'nossa equipa'
  );
}

export function buildAppointmentMessage(
  appointment: AppointmentMessageRow,
  action: AppointmentMessageAction,
  businessName: string,
  options: AppointmentMessageOptions = {}
) {
  const service = appointment.service?.name ?? 'seu atendimento';
  const start = new Date(appointment.scheduled_start);
  const date = new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(start);
  const time = new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
  const professional = professionalLabel(appointment);
  const prefix = contactGreeting(appointment.contact);
  // All client-facing messages must identify the business. This fallback is
  // only used for legacy accounts whose account name was never populated.
  const brand = businessName.trim() || 'RP Instituto de Beleza';
  const price = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: appointment.currency || 'EUR',
  }).format(Number(appointment.price ?? 0));
  const referralDiscount = Number(
    appointment.referral_discount_amount ?? 0
  );
  const manualDiscount = Number(appointment.manual_discount_amount ?? 0);
  const originalPrice = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: appointment.currency || 'EUR',
  }).format(Number(appointment.original_price ?? appointment.price ?? 0));
  const discountLabel = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: appointment.currency || 'EUR',
  }).format(referralDiscount);
  const hasVoucherOrPack =
    options.benefit?.type === 'voucher' || options.benefit?.type === 'pack';
  const manualDiscountLabel = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: appointment.currency || 'EUR',
  }).format(manualDiscount);

  if (action === 'pending_confirmation') {
    return [
      `Olá${appointment.contact?.name ? `, ${appointment.contact.name.split(' ')[0]}` : ''}. ✨`,
      '',
      `Ainda aguardamos a confirmação da sua sessão de *${service}*, marcada para *${date} às ${time}*.`,
      '',
      'Responda *CONFIRMAR* para garantir a sua presença ou *REAGENDAR* caso precise de outro horário.',
      '',
      `Com os melhores cumprimentos,\nEquipa ${brand}`,
    ].join('\n');
  }

  const details = [
    '✨ *Detalhes do seu agendamento* ✨',
    prefix,
    '',
    `💆 Serviço: ${service}`,
    `📅 Data: ${date}`,
    `🕕 Horário: ${time}`,
    referralDiscount > 0 || manualDiscount > 0
      ? `🏷️ Valor original: ${originalPrice}`
      : null,
    manualDiscount > 0 ? `💶 Desconto aplicado: -${manualDiscountLabel}` : null,
    referralDiscount > 0
      ? `🎁 Benefício Indique & Ganhe: -${discountLabel}`
      : null,
    hasVoucherOrPack
      ? `🎟️ ${options.benefit?.label ?? 'Benefício aplicado'}`
      : `💵 Total da sessão: ${price}`,
    `🙎🏻‍♂️ Profissional: ${professional}`,
    options.clinicAddress ? `📍 Morada: ${options.clinicAddress}` : null,
    '*Para sua comodidade:*',
    options.directions ? `🚇 ${options.directions}` : null,
    options.parkingInfo ? `🚙 ${options.parkingInfo}` : null,
    options.paymentMethods ? `📲 Pagamento: ${options.paymentMethods}` : null,
    action === 'reminder'
      ? 'Esta é uma lembrança da sua sessão. Caso precise de apoio, responda a esta mensagem.'
      : 'Para confirmar a sua presença, responda *CONFIRMAR*. Para solicitar outro horário, responda *REAGENDAR*.',
  ]
    .filter((line): line is string => line !== null)
    .flatMap((line) =>
      hasVoucherOrPack && line === `🎟️ ${options.benefit?.label ?? 'Benefício aplicado'}`
        ? [line, options.benefit?.detail ?? '']
        : [line]
    )
    .filter(Boolean);

  if (options.anamnesisUrl) {
    details.push(
      'Para uma experiência personalizada e segura, pedimos que preencha previamente a sua ficha de anamnese:',
      `👉 ${options.anamnesisUrl}`,
      '',
      options.anamnesisIntro ||
        'O preenchimento é rápido e confidencial, levando apenas alguns minutos. ✨'
    );
  }
  details.push('', `Com os melhores cumprimentos,\nEquipa ${brand} 💚`);
  return details.join('\n');
}

/**
 * Renders the administrator-managed template used by automatic Agenda
 * communications. Unknown placeholders are deliberately kept untouched so a
 * typo is visible in the message instead of silently deleting content.
 */
export function renderAppointmentMessageTemplate(
  template: string,
  appointment: AppointmentMessageRow,
  businessName: string,
  options: AppointmentMessageOptions = {}
) {
  const start = new Date(appointment.scheduled_start);
  const service = appointment.service?.name ?? 'seu atendimento';
  const price = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: appointment.currency || 'EUR',
  }).format(Number(appointment.price ?? 0));
  const client = appointment.contact?.name?.trim() || 'cliente';
  const date = new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(start);
  const time = new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
  const benefit = options.benefit
    ? `${options.benefit.label}${options.benefit.detail ? ` — ${options.benefit.detail}` : ''}`
    : `Valor da sessão: ${price}`;
  const anamnesis = options.anamnesisUrl
    ? `${options.anamnesisIntro || 'Preencha a ficha de anamnese antes da sessão:'}\n👉 ${options.anamnesisUrl}`
    : '';
  const values: Record<string, string> = {
    cliente: client,
    servico: service,
    data: date,
    hora: time,
    valor: price,
    beneficio: benefit,
    profissional: professionalLabel(appointment),
    morada: options.clinicAddress || '',
    link_anamnese: anamnesis,
    empresa: businessName.trim() || 'RP Instituto de Beleza',
  };

  return template
    .replace(/\{([a-z_]+)\}/gi, (placeholder, key: string) =>
      Object.prototype.hasOwnProperty.call(values, key.toLowerCase())
        ? values[key.toLowerCase()]
        : placeholder
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function canMessageAppointment(appointment: AppointmentMessageRow) {
  return Boolean(appointment.contact?.id && appointment.contact?.phone);
}
