import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { getFlowTemplate } from '@/lib/flows/templates';

/**
 * GET /api/flows — list the caller's flows.
 * POST /api/flows — create a new (draft) flow.
 *
 * Available to every authenticated user. The previous per-account
 * beta gate was removed when Flows went to soft-GA; the UI still
 * shows a "Beta" label so users know the surface is young, but the
 * routes themselves are open.
 */

async function requireUser(): Promise<
  | {
      ok: true;
      userId: string;
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | { ok: false; status: number; body: { error: string } }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }
  return { ok: true, userId: user.id, supabase };
}

export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const { supabase } = guard;

  const { data, error } = await supabase
    .from('flows')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const flows = data ?? [];
  const flowIds = flows.map((flow) => String(flow.id));
  if (flowIds.length === 0) {
    return NextResponse.json({ flows: [] });
  }

  const [nodesResult, runsResult] = await Promise.all([
    supabase.from('flow_nodes').select('flow_id').in('flow_id', flowIds),
    supabase.from('flow_runs').select('flow_id, status').in('flow_id', flowIds),
  ]);

  if (nodesResult.error) {
    console.warn(
      '[flows] node count summary failed:',
      nodesResult.error.message
    );
  }
  if (runsResult.error) {
    console.warn(
      '[flows] run status summary failed:',
      runsResult.error.message
    );
  }

  const nodeCounts = new Map<string, number>();
  for (const row of nodesResult.data ?? []) {
    const flowId = String(row.flow_id);
    nodeCounts.set(flowId, (nodeCounts.get(flowId) ?? 0) + 1);
  }

  const runCounts = new Map<
    string,
    {
      active: number;
      completed: number;
      failed: number;
      handedOff: number;
      total: number;
    }
  >();
  for (const row of runsResult.data ?? []) {
    const flowId = String(row.flow_id);
    const current = runCounts.get(flowId) ?? {
      active: 0,
      completed: 0,
      failed: 0,
      handedOff: 0,
      total: 0,
    };
    current.total += 1;
    if (row.status === 'active') current.active += 1;
    if (row.status === 'completed') current.completed += 1;
    if (row.status === 'failed' || row.status === 'timed_out') {
      current.failed += 1;
    }
    if (row.status === 'handed_off' || row.status === 'paused_by_agent') {
      current.handedOff += 1;
    }
    runCounts.set(flowId, current);
  }

  return NextResponse.json({
    flows: flows.map((flow) => {
      const counts = runCounts.get(String(flow.id));
      return {
        ...flow,
        node_count: nodeCounts.get(String(flow.id)) ?? 0,
        active_run_count: counts?.active ?? 0,
        completed_run_count: counts?.completed ?? 0,
        failed_run_count: counts?.failed ?? 0,
        handed_off_run_count: counts?.handedOff ?? 0,
      };
    }),
  });
}

export async function POST(request: Request) {
  // Creating a flow is a write — the RLS flows_insert policy requires
  // `agent`, but this route inserts via the service-role client which
  // bypasses RLS, so the role must be enforced here.
  try {
    await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const { userId, supabase } = guard;

  // Resolve the caller's account_id — `flows.account_id` is NOT NULL
  // post-017, so an INSERT without it trips the not-null constraint
  // even though the admin client below bypasses RLS.
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .single();
  const accountId = profile?.account_id as string | undefined;
  if (!accountId) {
    return NextResponse.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    description?: string | null;
    trigger_type?: 'keyword' | 'first_inbound_message' | 'manual';
    trigger_config?: Record<string, unknown>;
    /**
     * If set, clone the matching template's name + trigger +
     * entry_node_id + nodes[] into a fresh draft for this user.
     * `name` from the body overrides the template default if
     * provided.
     */
    template_slug?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // -------- Template clone path --------
  if (body.template_slug) {
    const template = getFlowTemplate(body.template_slug);
    if (!template) {
      return NextResponse.json(
        { error: `Unknown template_slug "${body.template_slug}"` },
        { status: 400 }
      );
    }
    const { data: flow, error: flowErr } = await admin
      .from('flows')
      .insert({
        user_id: userId,
        account_id: accountId,
        name: body.name?.trim() || template.name,
        description: template.description,
        status: 'draft',
        trigger_type: template.trigger_type,
        trigger_config: template.trigger_config,
        entry_node_id: template.entry_node_id,
      })
      .select()
      .single();
    if (flowErr || !flow) {
      return NextResponse.json(
        { error: flowErr?.message ?? 'flow insert failed' },
        { status: 500 }
      );
    }
    if (template.nodes.length > 0) {
      const { error: nodesErr } = await admin.from('flow_nodes').insert(
        template.nodes.map((n) => ({
          flow_id: flow.id,
          node_key: n.node_key,
          node_type: n.node_type,
          config: n.config,
        }))
      );
      if (nodesErr) {
        // Roll back the parent flow so a half-cloned template doesn't
        // sit as an empty draft. CASCADE on flow_id removes the
        // (probably zero) nodes too.
        await admin.from('flows').delete().eq('id', flow.id);
        return NextResponse.json({ error: nodesErr.message }, { status: 500 });
      }
    }
    return NextResponse.json({ flow }, { status: 201 });
  }

  // -------- Plain (empty) create path --------
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const trigger_type = body.trigger_type ?? 'keyword';

  const { data, error } = await admin
    .from('flows')
    .insert({
      user_id: userId,
      account_id: accountId,
      name: body.name.trim(),
      description: body.description ?? null,
      status: 'draft',
      trigger_type,
      trigger_config: body.trigger_config ?? {},
    })
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'insert failed' },
      { status: 500 }
    );
  }
  return NextResponse.json({ flow: data }, { status: 201 });
}
