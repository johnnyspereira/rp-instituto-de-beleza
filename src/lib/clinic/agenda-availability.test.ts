import { describe, expect, it } from 'vitest';

import {
  availabilityConflictMessage,
  findAvailabilityConflicts,
  intervalsOverlap,
  snapMinutesToGrid,
  type AgendaResource,
} from './agenda-availability';

const resources: AgendaResource[] = [
  {
    id: 'appointment-1',
    kind: 'appointment',
    startsAt: '2026-07-20T10:00:00.000Z',
    endsAt: '2026-07-20T11:00:00.000Z',
    professionalId: 'professional-1',
    roomId: 'room-1',
    status: 'confirmed',
  },
  {
    id: 'block-1',
    kind: 'time_block',
    startsAt: '2026-07-20T12:00:00.000Z',
    endsAt: '2026-07-20T13:00:00.000Z',
  },
];

describe('agenda availability', () => {
  it('uses half-open intervals so adjacent slots do not conflict', () => {
    expect(
      intervalsOverlap(
        new Date('2026-07-20T09:00:00Z'),
        new Date('2026-07-20T10:00:00Z'),
        new Date('2026-07-20T10:00:00Z'),
        new Date('2026-07-20T11:00:00Z')
      )
    ).toBe(false);
  });

  it('detects conflicts by professional or room', () => {
    const conflicts = findAvailabilityConflicts(resources, {
      startsAt: new Date('2026-07-20T10:30:00Z'),
      endsAt: new Date('2026-07-20T11:30:00Z'),
      professionalId: 'professional-1',
    });
    expect(conflicts.map((item) => item.id)).toEqual(['appointment-1']);
  });

  it('treats a block without resource as a global block', () => {
    const conflicts = findAvailabilityConflicts(resources, {
      startsAt: new Date('2026-07-20T12:15:00Z'),
      endsAt: new Date('2026-07-20T12:30:00Z'),
      professionalId: 'professional-2',
    });
    expect(conflicts.map((item) => item.id)).toEqual(['block-1']);
  });

  it('ignores the edited entity and cancelled appointments', () => {
    const conflicts = findAvailabilityConflicts(
      [...resources, { ...resources[0], id: 'cancelled', status: 'cancelled' }],
      {
        startsAt: new Date('2026-07-20T10:15:00Z'),
        endsAt: new Date('2026-07-20T10:45:00Z'),
        roomId: 'room-1',
        excludeAppointmentId: 'appointment-1',
      }
    );
    expect(conflicts).toEqual([]);
  });

  it('builds a readable conflict message and snaps drag minutes', () => {
    expect(availabilityConflictMessage(resources)).toContain(
      '1 marcação e 1 bloqueio'
    );
    expect(snapMinutesToGrid(37)).toBe(30);
    expect(snapMinutesToGrid(38)).toBe(45);
  });

  it('ignores cancelled and malformed ghost appointments', () => {
    const conflicts = findAvailabilityConflicts(
      [
        { ...resources[0], status: 'CANCELLED' },
        { ...resources[0], id: 'invalid', startsAt: 'invalid-date' },
      ],
      {
        startsAt: new Date('2026-02-10T10:00:00.000Z'),
        endsAt: new Date('2026-02-10T10:30:00.000Z'),
        professionalId: 'pro-1',
      }
    );
    expect(conflicts).toEqual([]);
  });
});
