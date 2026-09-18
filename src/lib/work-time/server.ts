import type { SupabaseClient, User } from '@supabase/supabase-js';

import { secondsBetween, WORK_RECENT_DAYS } from './config';
import type {
  WorkBreak,
  WorkBreakReason,
  WorkSession,
  WorkTimeDay,
  WorkTimeSnapshot,
} from './types';

type WorkContext = {
  user: User;
  accountId: string;
};

const WORK_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SESSION_SELECT =
  'id, account_id, user_id, work_date, status, started_at, last_active_at, ended_at, closed_at, absence_reason, absence_recorded_at';
const BREAK_SELECT =
  'id, session_id, account_id, user_id, reason, started_at, ended_at, justification, justified_at';

export function parseWorkDate(value: unknown) {
  return typeof value === 'string' && WORK_DATE_RE.test(value)
    ? value
    : new Date().toISOString().slice(0, 10);
}

export async function requireWorkContext(
  db: SupabaseClient
): Promise<WorkContext | Response> {
  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser();

  if (userError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    return Response.json(
      { error: 'Could not load account context.' },
      { status: 500 }
    );
  }

  const accountId =
    typeof profile?.account_id === 'string' ? profile.account_id : null;
  if (!accountId) {
    return Response.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 400 }
    );
  }

  return { user, accountId };
}

export async function ensureWorkSession(
  db: SupabaseClient,
  ctx: WorkContext,
  workDate: string
): Promise<WorkSession> {
  const existing = await findWorkSession(db, ctx, workDate);
  if (existing) return existing;

  const now = new Date().toISOString();
  const { data, error } = await db
    .from('work_sessions')
    .insert({
      account_id: ctx.accountId,
      user_id: ctx.user.id,
      work_date: workDate,
      started_at: now,
      last_active_at: now,
    })
    .select(SESSION_SELECT)
    .single();

  if (!error && data) return data as WorkSession;

  const raced = await findWorkSession(db, ctx, workDate);
  if (raced) return raced;

  throw new Error(error?.message ?? 'Could not create work session.');
}

export async function findWorkSession(
  db: SupabaseClient,
  ctx: WorkContext,
  workDate: string
) {
  const { data, error } = await db
    .from('work_sessions')
    .select(SESSION_SELECT)
    .eq('account_id', ctx.accountId)
    .eq('user_id', ctx.user.id)
    .eq('work_date', workDate)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as WorkSession | null) ?? null;
}

export async function loadBreaks(db: SupabaseClient, sessionId: string) {
  const { data, error } = await db
    .from('work_breaks')
    .select(BREAK_SELECT)
    .eq('session_id', sessionId)
    .order('started_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as WorkBreak[];
}

export function buildWorkTimeDay(
  session: WorkSession,
  breaks: WorkBreak[],
  nowIso: string
): WorkTimeDay {
  if (session.status === 'absent') {
    return {
      session,
      breaks,
      totals: {
        grossSeconds: 0,
        breakSeconds: 0,
        netSeconds: 0,
        openBreakSeconds: 0,
      },
    };
  }

  const effectiveEnd = session.ended_at ?? nowIso;
  const grossSeconds = secondsBetween(session.started_at, effectiveEnd);
  const breakSeconds = breaks.reduce(
    (sum, item) =>
      sum + secondsBetween(item.started_at, item.ended_at ?? nowIso),
    0
  );
  const openBreakSeconds = breaks
    .filter((item) => !item.ended_at)
    .reduce((sum, item) => sum + secondsBetween(item.started_at, nowIso), 0);

  return {
    session,
    breaks,
    totals: {
      grossSeconds,
      breakSeconds,
      netSeconds: Math.max(0, grossSeconds - breakSeconds),
      openBreakSeconds,
    },
  };
}

export async function buildSnapshot(
  db: SupabaseClient,
  ctx: WorkContext,
  workDate: string,
  options: { createIfMissing?: boolean } = {}
): Promise<WorkTimeSnapshot> {
  const nowIso = new Date().toISOString();
  await recordMissedAbsence(db, ctx, workDate);
  const session = options.createIfMissing
    ? await ensureWorkSession(db, ctx, workDate)
    : await findWorkSession(db, ctx, workDate);
  const breaks = session ? await loadBreaks(db, session.id) : [];
  const recent = await loadRecentDays(db, ctx, nowIso);

  if (!session) {
    return {
      session: null,
      breaks: [],
      totals: emptyTotals(),
      serverNow: nowIso,
      recent,
    };
  }

  const day = buildWorkTimeDay(session, breaks, nowIso);
  return { ...day, serverNow: nowIso, recent };
}

export async function touchWorkSession(
  db: SupabaseClient,
  session: WorkSession
) {
  if (session.status !== 'open') return session;
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('work_sessions')
    .update({ last_active_at: now })
    .eq('id', session.id)
    .select(SESSION_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as WorkSession;
}

export async function startWorkBreak(
  db: SupabaseClient,
  session: WorkSession,
  reason: WorkBreakReason
) {
  if (session.status !== 'open') {
    throw new Error('The work day is not open.');
  }
  const existing = await findOpenBreak(db, session.id);
  if (existing) return existing;

  const { data, error } = await db
    .from('work_breaks')
    .insert({
      session_id: session.id,
      account_id: session.account_id,
      user_id: session.user_id,
      reason,
    })
    .select(BREAK_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as WorkBreak;
}

export async function endOpenWorkBreak(
  db: SupabaseClient,
  sessionId: string,
  justification?: string | null
) {
  const existing = await findOpenBreak(db, sessionId);
  if (!existing) return null;

  const trimmedJustification = justification?.trim() ?? '';
  if (!trimmedJustification) {
    throw new Error('A break justification is required.');
  }

  const { data, error } = await db
    .from('work_breaks')
    .update({
      ended_at: new Date().toISOString(),
      justification: trimmedJustification,
      justified_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select(BREAK_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as WorkBreak;
}

export async function closeWorkSession(
  db: SupabaseClient,
  session: WorkSession
) {
  if (session.status !== 'open') {
    throw new Error('The work day is not open.');
  }

  const now = new Date().toISOString();
  const breaks = await loadBreaks(db, session.id);
  if (breaks.some((item) => !item.ended_at || !item.justification?.trim())) {
    throw new Error('All breaks must be justified before closing the day.');
  }

  const { data, error } = await db
    .from('work_sessions')
    .update({
      status: 'closed',
      ended_at: session.ended_at ?? now,
      closed_at: now,
      last_active_at: now,
    })
    .eq('id', session.id)
    .select(SESSION_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as WorkSession;
}

async function findOpenBreak(db: SupabaseClient, sessionId: string) {
  const { data, error } = await db
    .from('work_breaks')
    .select(BREAK_SELECT)
    .eq('session_id', sessionId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as WorkBreak | null) ?? null;
}

export async function recordMissedAbsence(
  db: SupabaseClient,
  ctx: WorkContext,
  todayWorkDate: string
) {
  const previousDate = addDays(todayWorkDate, -1);
  if (!previousDate) return;

  const existing = await findWorkSession(db, ctx, previousDate);
  if (existing) return;

  const start = `${previousDate}T00:00:00.000Z`;
  const end = `${previousDate}T23:59:59.000Z`;
  const now = new Date().toISOString();

  const { error } = await db.from('work_sessions').insert({
    account_id: ctx.accountId,
    user_id: ctx.user.id,
    work_date: previousDate,
    status: 'absent',
    started_at: start,
    last_active_at: start,
    ended_at: end,
    closed_at: now,
    absence_recorded_at: now,
    absence_reason: 'Ponto não iniciado no dia.',
  });

  if (error && error.code !== '23505') {
    throw new Error(error.message);
  }
}

function addDays(workDate: string, days: number) {
  if (!WORK_DATE_RE.test(workDate)) return null;
  const date = new Date(`${workDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function emptyTotals() {
  return {
    grossSeconds: 0,
    breakSeconds: 0,
    netSeconds: 0,
    openBreakSeconds: 0,
  };
}

async function loadRecentDays(
  db: SupabaseClient,
  ctx: WorkContext,
  nowIso: string
) {
  const { data, error } = await db
    .from('work_sessions')
    .select(SESSION_SELECT)
    .eq('account_id', ctx.accountId)
    .eq('user_id', ctx.user.id)
    .order('work_date', { ascending: false })
    .limit(WORK_RECENT_DAYS);

  if (error) throw new Error(error.message);

  const sessions = (data ?? []) as WorkSession[];
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length === 0) return [];

  const { data: breaksData, error: breaksError } = await db
    .from('work_breaks')
    .select(BREAK_SELECT)
    .in('session_id', sessionIds)
    .order('started_at', { ascending: true });

  if (breaksError) throw new Error(breaksError.message);

  const breaksBySession = new Map<string, WorkBreak[]>();
  for (const item of (breaksData ?? []) as WorkBreak[]) {
    const list = breaksBySession.get(item.session_id) ?? [];
    list.push(item);
    breaksBySession.set(item.session_id, list);
  }

  return sessions.map((session) =>
    buildWorkTimeDay(session, breaksBySession.get(session.id) ?? [], nowIso)
  );
}
