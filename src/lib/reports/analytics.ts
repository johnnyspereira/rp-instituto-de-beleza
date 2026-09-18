export type ReportMessage = {
  conversation_id: string;
  sender_type: string;
  created_at: string;
};

export type ReportWorkSession = {
  started_at: string;
  ended_at?: string | null;
  last_active_at?: string | null;
  breaks?: Array<{
    started_at: string;
    ended_at?: string | null;
  }> | null;
};

export function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function safeRate(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

export function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export function localDayKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function enumerateDayKeys(from: string, to: string) {
  const days: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const finish = new Date(`${to}T12:00:00`);
  while (cursor <= finish && days.length < 370) {
    days.push(localDayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function firstResponseMinutes(messages: ReportMessage[]) {
  const ordered = [...messages].sort(
    (left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  );
  const pendingInbound = new Map<string, number>();
  const samples: number[] = [];

  for (const message of ordered) {
    const timestamp = new Date(message.created_at).getTime();
    if (message.sender_type === 'customer') {
      if (!pendingInbound.has(message.conversation_id)) {
        pendingInbound.set(message.conversation_id, timestamp);
      }
      continue;
    }
    if (!['agent', 'bot'].includes(message.sender_type)) continue;
    const inboundAt = pendingInbound.get(message.conversation_id);
    if (inboundAt === undefined) continue;
    samples.push(Math.max(0, (timestamp - inboundAt) / 60_000));
    pendingInbound.delete(message.conversation_id);
  }
  return samples;
}

export function workSessionMinutes(
  session: ReportWorkSession,
  now = Date.now()
) {
  const start = new Date(session.started_at).getTime();
  const finish = session.ended_at
    ? new Date(session.ended_at).getTime()
    : session.last_active_at
      ? new Date(session.last_active_at).getTime()
      : now;
  const gross = Math.max(0, finish - start);
  const breaks = (session.breaks ?? []).reduce((total, item) => {
    const breakStart = new Date(item.started_at).getTime();
    const breakFinish = item.ended_at
      ? new Date(item.ended_at).getTime()
      : Math.min(finish, now);
    return total + Math.max(0, breakFinish - breakStart);
  }, 0);
  return Math.max(0, (gross - breaks) / 60_000);
}

export function previousPeriod(from: string, to: string) {
  const currentStart = new Date(`${from}T00:00:00`);
  const currentEnd = new Date(`${to}T23:59:59.999`);
  const duration = currentEnd.getTime() - currentStart.getTime() + 1;
  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - duration + 1);
  return {
    currentStart: currentStart.toISOString(),
    currentEnd: currentEnd.toISOString(),
    previousStart: previousStart.toISOString(),
    previousEnd: previousEnd.toISOString(),
  };
}

export function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}
