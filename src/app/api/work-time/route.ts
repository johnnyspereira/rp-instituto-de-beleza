import { createClient } from '@/lib/supabase/server';
import {
  buildSnapshot,
  closeWorkSession,
  endOpenWorkBreak,
  ensureWorkSession,
  findWorkSession,
  parseWorkDate,
  requireWorkContext,
  startWorkBreak,
  touchWorkSession,
} from '@/lib/work-time/server';
import type { WorkBreakReason } from '@/lib/work-time/types';

export const dynamic = 'force-dynamic';

type WorkTimeAction =
  'start_day' | 'heartbeat' | 'start_break' | 'end_break' | 'close_day';

export async function GET(request: Request) {
  try {
    const db = await createClient();
    const ctx = await requireWorkContext(db);
    if (ctx instanceof Response) return ctx;

    const url = new URL(request.url);
    const workDate = parseWorkDate(url.searchParams.get('date'));
    const snapshot = await buildSnapshot(db, ctx, workDate);
    return Response.json(snapshot);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = await createClient();
    const ctx = await requireWorkContext(db);
    if (ctx instanceof Response) return ctx;

    const body = await readBody(request);
    const action = body.action;
    if (!isAction(action)) {
      return Response.json(
        { error: 'Invalid work-time action.' },
        { status: 400 }
      );
    }

    const workDate = parseWorkDate(body.date);
    const session =
      action === 'start_day'
        ? await ensureWorkSession(db, ctx, workDate)
        : await findWorkSession(db, ctx, workDate);

    if (!session) {
      const snapshot = await buildSnapshot(db, ctx, workDate);
      return Response.json(snapshot);
    }

    if (action === 'start_day') {
      await touchWorkSession(db, session);
    }

    if (action === 'heartbeat') {
      await touchWorkSession(db, session);
    }

    if (action === 'start_break') {
      const reason = isBreakReason(body.reason)
        ? body.reason
        : 'forced_inactivity';
      await startWorkBreak(db, session, reason);
    }

    if (action === 'end_break') {
      await endOpenWorkBreak(
        db,
        session.id,
        typeof body.justification === 'string' ? body.justification : null
      );
      await touchWorkSession(db, session);
    }

    if (action === 'close_day') {
      await closeWorkSession(db, session);
    }

    const snapshot = await buildSnapshot(db, ctx, workDate);
    return Response.json(snapshot);
  } catch (error) {
    return fail(error);
  }
}

async function readBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isAction(value: unknown): value is WorkTimeAction {
  return (
    value === 'start_day' ||
    value === 'heartbeat' ||
    value === 'start_break' ||
    value === 'end_break' ||
    value === 'close_day'
  );
}

function isBreakReason(value: unknown): value is WorkBreakReason {
  return (
    value === 'forced_inactivity' ||
    value === 'manual' ||
    value === 'system_lock'
  );
}

function fail(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Internal server error';
  console.error('[api/work-time] failed:', error);
  return Response.json({ error: message }, { status: 500 });
}
