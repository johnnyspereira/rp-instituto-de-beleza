import { formatCurrency } from '@/lib/currency';
import type { FinanceInvoiceRequest, FinancePaymentMethod } from '@/types';

export const PAYMENT_METHODS: Array<{
  value: FinancePaymentMethod;
  label: string;
}> = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'card', label: 'Cartão / SumUp (iPhone)' },
  { value: 'mb_way', label: 'MB Way' },
  { value: 'multibanco', label: 'Multibanco' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'client_credit', label: 'Crédito do cliente' },
  { value: 'other', label: 'Outro' },
];

export const REGISTER_METHODS = PAYMENT_METHODS.filter(
  (method) => !['voucher', 'client_credit'].includes(method.value)
);

export const SALE_STATUS: Record<string, string> = {
  open: 'Pendente',
  partially_paid: 'Parcial',
  paid: 'Paga',
  voided: 'Anulada',
  refunded: 'Reembolsada',
};

export function paymentMethodLabel(method: string) {
  return PAYMENT_METHODS.find((item) => item.value === method)?.label || method;
}

export function money(value: number, currency: string) {
  return formatCurrency(Number(value || 0), currency);
}

export function datetimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function randomPin() {
  return String(
    crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  ).padStart(6, '0');
}

export function isMissingFinanceSchema(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message?.includes('finance_') ||
    error.message?.includes('create_finance_sale')
  );
}

export function invoiceRequestStatus(
  status: FinanceInvoiceRequest['status']
) {
  return {
    pending: 'Pendente',
    processing: 'Em processamento',
    issued: 'Emitida',
    rejected: 'Rejeitada',
    cancelled: 'Cancelada',
  }[status];
}
