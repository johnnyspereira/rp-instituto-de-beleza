import { describe, expect, it } from 'vitest';

import { parseICalendar } from './ical';

describe('parseICalendar', () => {
  it('parses Zappy-style UTC events and unfolded text', () => {
    const events = parseICalendar(`BEGIN:VCALENDAR\r
BEGIN:VEVENT\r
UID:event-1\r
DTSTART:20260828T090000Z\r
DTEND:20260828T100000Z\r
SUMMARY:Massagem\\, cliente\r
DESCRIPTION:linha longa que continua\r
 na linha seguinte\r
STATUS:CONFIRMED\r
END:VEVENT\r
END:VCALENDAR`);

    expect(events).toEqual([
      {
        uid: 'event-1',
        summary: 'Massagem, cliente',
        startsAt: new Date('2026-08-28T09:00:00.000Z'),
        endsAt: new Date('2026-08-28T10:00:00.000Z'),
      },
    ]);
  });

  it('ignores cancelled and invalid events', () => {
    const events = parseICalendar(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:cancelled
DTSTART:20260828T090000Z
DTEND:20260828T100000Z
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:invalid
DTSTART:invalid
DTEND:invalid
END:VEVENT
END:VCALENDAR`);

    expect(events).toEqual([]);
  });

  it('rejects content that is not an iCalendar', () => {
    expect(() => parseICalendar('<html>error</html>')).toThrow(
      'calendário iCal válido'
    );
  });
});
