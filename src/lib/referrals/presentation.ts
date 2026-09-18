export type ReferralRewardType =
  'none' | 'fixed_credit' | 'percentage' | 'service';

export type ReferralQualificationEvent =
  'registration' | 'completed_appointment' | 'first_paid_sale';

export type ReferralStatus =
  | 'invited'
  | 'registered'
  | 'contacted'
  | 'scheduled'
  | 'qualified'
  | 'rewarded'
  | 'rejected';

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  invited: 'Convidado',
  registered: 'Cadastrado',
  contacted: 'Contactado',
  scheduled: 'Agendado',
  qualified: 'Qualificado',
  rewarded: 'Premiado',
  rejected: 'Não qualificado',
};

export function referralRewardDescription({
  type,
  value,
  currency = 'EUR',
  serviceName,
}: {
  type: ReferralRewardType | string;
  value: number;
  currency?: string;
  serviceName?: string | null;
}) {
  if (type === 'percentage') return `${value}% de desconto`;
  if (type === 'fixed_credit') {
    return `${new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)} em cartão-saldo`;
  }
  if (type === 'service') return serviceName || 'um procedimento de oferta';
  return 'sem benefício';
}

export function qualificationDescription(
  event: ReferralQualificationEvent | string,
  minimumAmount = 0,
  currency = 'EUR'
) {
  if (event === 'registration') return 'depois de concluir o registo';
  if (event === 'completed_appointment') {
    return 'depois de concluir o primeiro atendimento';
  }
  if (minimumAmount > 0) {
    const amount = new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency,
    }).format(minimumAmount);
    return `depois de pagar a primeira compra de pelo menos ${amount}`;
  }
  return 'depois de pagar a primeira compra';
}

export function referralConversionRate(
  rows: Array<{ status: ReferralStatus }>
) {
  if (!rows.length) return 0;
  const converted = rows.filter((row) =>
    ['qualified', 'rewarded'].includes(row.status)
  ).length;
  return Math.round((converted / rows.length) * 100);
}
