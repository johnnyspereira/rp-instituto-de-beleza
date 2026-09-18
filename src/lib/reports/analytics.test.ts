import { describe, expect, it } from 'vitest';
import {
  csvCell,
  firstResponseMinutes,
  percentageChange,
  safeRate,
  workSessionMinutes,
} from './analytics';

describe('reports analytics', () => {
  it('calculates percentage deltas without presenting infinity', () => {
    expect(percentageChange(120, 100)).toBe(20);
    expect(percentageChange(10, 0)).toBeNull();
    expect(percentageChange(0, 0)).toBe(0);
    expect(safeRate(3, 4)).toBe(75);
  });

  it('measures the first reply after each inbound sequence', () => {
    expect(
      firstResponseMinutes([
        {
          conversation_id: 'one',
          sender_type: 'customer',
          created_at: '2026-07-18T10:00:00Z',
        },
        {
          conversation_id: 'one',
          sender_type: 'customer',
          created_at: '2026-07-18T10:02:00Z',
        },
        {
          conversation_id: 'one',
          sender_type: 'agent',
          created_at: '2026-07-18T10:05:00Z',
        },
      ])
    ).toEqual([5]);
  });

  it('subtracts breaks from worked time', () => {
    expect(
      workSessionMinutes({
        started_at: '2026-07-18T09:00:00Z',
        ended_at: '2026-07-18T12:00:00Z',
        breaks: [
          {
            started_at: '2026-07-18T10:00:00Z',
            ended_at: '2026-07-18T10:30:00Z',
          },
        ],
      })
    ).toBe(150);
  });

  it('escapes CSV values', () => {
    expect(csvCell('A "quoted" value')).toBe('"A ""quoted"" value"');
  });
});
