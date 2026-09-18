const FALLBACK_TIME_ZONE = 'Europe/Lisbon';

function resolvedTimeZone(timeZone?: string | null) {
  const candidate = timeZone?.trim() || FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function parts(value: Date, timeZone?: string | null) {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: resolvedTimeZone(timeZone),
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(formatted.find((part) => part.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Converts a date and time selected in the account timezone into one UTC instant. */
export function accountDateTimeToUtc(date: string, time: string, timeZone?: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time || '09:00');
  if (!match || !clock) return new Date(NaN);
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(clock[1]), Number(clock[2]));
  let instant = desired;
  // Offset may differ before and after a daylight-saving transition. Two
  // passes make the selected wall-clock time stable for account timezones.
  for (let pass = 0; pass < 2; pass += 1) {
    const local = parts(new Date(instant), timeZone);
    instant = desired - (Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - instant);
  }
  return new Date(instant);
}

export function accountDateInput(value: Date, timeZone?: string | null) {
  const local = parts(value, timeZone);
  return `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
}

export function accountTimeInput(value: Date, timeZone?: string | null) {
  const local = parts(value, timeZone);
  return `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
}

export function formatAccountDateTime(value: string | Date, timeZone?: string | null) {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: resolvedTimeZone(timeZone),
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(typeof value === 'string' ? new Date(value) : value);
}
