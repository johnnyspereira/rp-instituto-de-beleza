import { describe, expect, it } from 'vitest';

import { calculateRegisterBalance, cashMovementSign } from './register-balance';
import type { FinanceCashMovement, FinanceCashSnapshot } from '@/types';

const snapshot: FinanceCashSnapshot = {
  opening_amount: 0,
  cash_received: 145,
  deposits: 0,
  outflows: 0,
  expected_amount: 145,
  payments_by_method: { cash: 145, mb_way: 93 },
  tips_by_method: { cash: 11 },
};

function movement(
  movement_type: FinanceCashMovement['movement_type'],
  amount: number,
  payment_method: FinanceCashMovement['payment_method'] = 'cash'
): FinanceCashMovement {
  return {
    id: `${movement_type}-${amount}`,
    account_id: 'account',
    cash_session_id: 'session',
    movement_type,
    payment_method,
    amount,
    description: movement_type,
    created_at: '2026-07-23T20:00:00Z',
  };
}

describe('calculateRegisterBalance', () => {
  it('subtracts expenses and withdrawals from the turn and channel', () => {
    const result = calculateRegisterBalance(snapshot, [
      movement('expense', 20),
      movement('withdrawal', 5, 'mb_way'),
    ]);

    expect(result.netTurnBalance).toBe(224);
    expect(result.byMethod.cash).toBe(136);
    expect(result.byMethod.mb_way).toBe(88);
    expect(result.outflows).toBe(25);
  });

  it('adds deposits and adjustments and does not count tips twice', () => {
    const result = calculateRegisterBalance(snapshot, [
      movement('deposit', 10),
      movement('adjustment', 2, 'card'),
      movement('tip', 11),
    ]);

    expect(result.netTurnBalance).toBe(261);
    expect(result.byMethod.cash).toBe(166);
    expect(result.byMethod.card).toBe(2);
    expect(result.tipsReceived).toBe(11);
  });

  it('uses explicit debit and credit signs for every movement type', () => {
    expect(cashMovementSign('deposit')).toBe(1);
    expect(cashMovementSign('adjustment')).toBe(1);
    expect(cashMovementSign('tip')).toBe(1);
    expect(cashMovementSign('expense')).toBe(-1);
    expect(cashMovementSign('withdrawal')).toBe(-1);
    expect(cashMovementSign('refund')).toBe(-1);
  });
});
