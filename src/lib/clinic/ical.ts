export interface ICalendarEvent {
  uid: string;
  summary: string;
  startsAt: Date;
  endsAt: Date;
}

function unfold(input: string) {
  return input.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

function value(line: string) {
  const separator = line.indexOf(':');
  return separator < 0 ? '' : line.slice(separator + 1);
}

function unescapeText(input: string) {
  return input
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseCalendarDate(raw: string) {
  const match = raw.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/
  );
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00', utc] =
    match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  return utc
    ? new Date(
        Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5])
      )
    : new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
}

export function parseICalendar(input: string): ICalendarEvent[] {
  if (!input.includes('BEGIN:VCALENDAR'))
    throw new Error('O endereço não devolveu um calendário iCal válido.');
  const events: ICalendarEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of unfold(input)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current && current.STATUS !== 'CANCELLED') {
        const startsAt = parseCalendarDate(current.DTSTART || '');
        const endsAt = parseCalendarDate(current.DTEND || '');
        if (current.UID && startsAt && endsAt && endsAt > startsAt) {
          events.push({
            uid: current.UID.slice(0, 255),
            summary: unescapeText(current.SUMMARY || 'Compromisso externo'),
            startsAt,
            endsAt,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const property = line.slice(0, line.search(/[:;]/)).toUpperCase();
    if (property) current[property] = value(line);
  }

  return events;
}
