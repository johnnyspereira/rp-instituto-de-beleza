import { describe, expect, it } from 'vitest';

import {
  accountDateInput,
  accountDateTimeToUtc,
  accountTimeInput,
} from './timezone';

describe('account timezone scheduling', () => {
  it('stores the exact wall-clock time selected for Lisbon in UTC', () => {
    expect(
      accountDateTimeToUtc('2026-09-11', '15:30', 'Europe/Lisbon').toISOString()
    ).toBe('2026-09-11T14:30:00.000Z');
  });

  it('keeps the selected wall-clock time through the daylight-saving change', () => {
    const value = accountDateTimeToUtc('2026-01-11', '15:30', 'Europe/Lisbon');
    expect(value.toISOString()).toBe('2026-01-11T15:30:00.000Z');
    expect(accountDateInput(value, 'Europe/Lisbon')).toBe('2026-01-11');
    expect(accountTimeInput(value, 'Europe/Lisbon')).toBe('15:30');
  });
});
