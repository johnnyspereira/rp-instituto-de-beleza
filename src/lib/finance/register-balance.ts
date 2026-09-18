import type {
  FinanceCashMovement,
  FinanceCashSnapshot,
  FinancePaymentMethod,
} from '@/types';

export type RegisterBalance = {
  salesReceived: number;
  tipsReceived: number;
  manualEntries: number;
  outflows: number;
  netTurnBalance: number;
  byMethod: Record<FinancePaymentMethod, number>;
};

const PAYMENT_METHODS: FinancePaymentMethod[] = [
  'cash',
  'card',
  'mb_way',
  'multibanco',
  'bank_transfer',
  'voucher',
  'client_credit',
  'other',
];

export function cashMovementSign(
  type: FinanceCashMovement['movement_type']
): 1 | -1 {
  return ['withdrawal', 'expense', 'refund'].includes(type) ? -1 : 1;
}

/**
 * Produces every visible register total from the same signed ledger.
 * Tips are already present in snapshot.tips_by_method, so they are not
 * applied a second time from the movement rows.
 */
export function calculateRegisterBalance(
  snapshot: FinanceCashSnapshot | null,
  movements: FinanceCashMovement[]
): RegisterBalance {
  const payments = snapshot?.payments_by_method ?? {};
  const tips = snapshot?.tips_by_method ?? {};
  const byMethod = Object.fromEntries(
    PAYMENT_METHODS.map((method) => [
      method,
      Number(payments[method] ?? 0) + Number(tips[method] ?? 0),
    ])
  ) as Record<FinancePaymentMethod, number>;

  let manualEntries = 0;
  let outflows = 0;

  for (const movement of movements) {
    if (movement.movement_type === 'tip') continue;
    const amount = Number(movement.amount || 0);
    const sign = cashMovementSign(movement.movement_type);
    const method = movement.payment_method ?? 'cash';
    byMethod[method] += sign * amount;
    if (sign > 0) manualEntries += amount;
    else outflows += amount;
  }

  const salesReceived = Object.values(payments).reduce(
    (total, amount) => total + Number(amount ?? 0),
    0
  );
  const tipsReceived = Object.values(tips).reduce(
    (total, amount) => total + Number(amount ?? 0),
    0
  );

  return {
    salesReceived,
    tipsReceived,
    manualEntries,
    outflows,
    netTurnBalance:
      salesReceived + tipsReceived + manualEntries - outflows,
    byMethod,
  };
}
