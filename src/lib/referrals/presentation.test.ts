import { describe, expect, it } from 'vitest';

import {
  qualificationDescription,
  referralConversionRate,
  referralRewardDescription,
} from './presentation';

describe('referral presentation', () => {
  it('describes wallet, percentage and service rewards', () => {
    expect(
      referralRewardDescription({ type: 'fixed_credit', value: 5 })
    ).toContain('5,00');
    expect(referralRewardDescription({ type: 'percentage', value: 20 })).toBe(
      '20% de desconto'
    );
    expect(
      referralRewardDescription({
        type: 'service',
        value: 0,
        serviceName: 'Massagem Relaxante',
      })
    ).toBe('Massagem Relaxante');
  });

  it('explains every qualification event', () => {
    expect(qualificationDescription('registration')).toContain('registo');
    expect(qualificationDescription('completed_appointment')).toContain(
      'atendimento'
    );
    expect(qualificationDescription('first_paid_sale', 20)).toContain('20,00');
  });

  it('calculates conversion without dividing by zero', () => {
    expect(referralConversionRate([])).toBe(0);
    expect(
      referralConversionRate([
        { status: 'registered' },
        { status: 'qualified' },
        { status: 'rewarded' },
        { status: 'rejected' },
      ])
    ).toBe(50);
  });
});
