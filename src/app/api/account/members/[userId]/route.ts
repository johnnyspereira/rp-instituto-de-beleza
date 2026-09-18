// ============================================================
// /api/account/members/[userId]
//
//   PATCH  — change a member's role.   Admin+.
//   DELETE — remove a member.          Admin+.
//
// Both delegate to SECURITY DEFINER RPCs from migration 018:
//   - set_member_role(p_user_id, p_new_role)
//   - remove_account_member(p_user_id)
//
// The RPCs do the *real* authorisation work — caller must be
// admin+, target must be in caller's account, target can't be the
// owner, can't be self. The TS layer here only forwards the call
// and maps Postgres SQLSTATEs back to HTTP statuses.
// ============================================================

import { NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isAccountRole } from '@/lib/auth/roles';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

// Map known SQLSTATEs from the RPCs (see migration 018) onto HTTP
// statuses. The `error.code` field is the SQLSTATE; the `message`
// is the human-readable RAISE message we put in the migration.
function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === '42501') {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err.code === '22023') {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error('[members route] unexpected RPC error:', err);
  return NextResponse.json(
    { error: 'Failed to update member' },
    { status: 500 }
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const ctx = await requireRole('admin');

    const limit = checkRateLimit(
      `admin:memberRole:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;

    const body = (await request.json().catch(() => null)) as {
      role?: unknown;
      professional?: {
        is_professional?: unknown;
        title?: unknown;
        color?: unknown;
        bio?: unknown;
        phone?: unknown;
        public_slug?: unknown;
        show_online?: unknown;
        commission_executant_percent?: unknown;
        commission_responsible_percent?: unknown;
        working_hours?: unknown;
        online_booking_blocked?: unknown;
      };
    } | null;
    const role = body?.role;
    const professional = body?.professional;

    if (role !== undefined && !isAccountRole(role)) {
      return NextResponse.json(
        { error: "'role' must be one of owner, admin, agent, viewer" },
        { status: 400 }
      );
    }

    // The RPC blocks promotion to / demotion from owner, but
    // surface the friendlier 400 before crossing the wire too.
    if (role === 'owner') {
      return NextResponse.json(
        {
          error:
            'Use POST /api/account/transfer-ownership to promote a member to owner',
        },
        { status: 400 }
      );
    }

    if (role === undefined && professional === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    if (role !== undefined) {
      const { error } = await ctx.supabase.rpc('set_member_role', {
        p_user_id: userId,
        p_new_role: role,
      });

      if (error) return rpcErrorToResponse(error);
    }

    if (professional !== undefined) {
      const { data: current, error: currentError } = await ctx.supabase
        .from('profiles')
        .select(
          'is_professional, professional_title, professional_color, professional_bio, professional_phone, professional_public_slug, professional_show_online, commission_executant_percent, commission_responsible_percent, working_hours, online_booking_blocked'
        )
        .eq('user_id', userId)
        .eq('account_id', ctx.accountId)
        .maybeSingle();

      if (currentError || !current) {
        console.error('[members route] professional load error:', currentError);
        return NextResponse.json(
          { error: 'Failed to load professional settings' },
          { status: 500 }
        );
      }

      const rawColor =
        typeof professional.color === 'string'
          ? professional.color.trim()
          : ((current.professional_color as string | null) ?? '#7c3aed');
      const color = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : '#7c3aed';
      const numberValue = (value: unknown) => {
        const parsed =
          typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? Number(value.replace(',', '.'))
              : 0;
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const { error } = await ctx.supabase.rpc(
        'set_member_professional_settings',
        {
          p_user_id: userId,
          p_is_professional:
            typeof professional.is_professional === 'boolean'
              ? professional.is_professional
              : Boolean(current.is_professional),
          p_title:
            typeof professional.title === 'string'
              ? professional.title.trim().slice(0, 80)
              : ((current.professional_title as string | null) ?? ''),
          p_color: color,
          p_bio:
            typeof professional.bio === 'string'
              ? professional.bio.trim().slice(0, 1000)
              : ((current.professional_bio as string | null) ?? ''),
          p_phone:
            typeof professional.phone === 'string'
              ? professional.phone.trim().slice(0, 40)
              : ((current.professional_phone as string | null) ?? ''),
          p_public_slug:
            typeof professional.public_slug === 'string'
              ? professional.public_slug
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9-]+/g, '-')
                  .replace(/^-+|-+$/g, '')
                  .slice(0, 80)
              : ((current.professional_public_slug as string | null) ?? ''),
          p_show_online:
            typeof professional.show_online === 'boolean'
              ? professional.show_online
              : ((current.professional_show_online as boolean | null) ?? true),
          p_commission_executant_percent:
            professional.commission_executant_percent === undefined
              ? ((current.commission_executant_percent as number | null) ?? 0)
              : numberValue(professional.commission_executant_percent),
          p_commission_responsible_percent:
            professional.commission_responsible_percent === undefined
              ? ((current.commission_responsible_percent as number | null) ?? 0)
              : numberValue(professional.commission_responsible_percent),
          p_working_hours:
            professional.working_hours &&
            typeof professional.working_hours === 'object'
              ? professional.working_hours
              : ((current.working_hours as Record<string, unknown> | null) ??
                {}),
          p_online_booking_blocked:
            typeof professional.online_booking_blocked === 'boolean'
              ? professional.online_booking_blocked
              : Boolean(current.online_booking_blocked),
        }
      );

      if (error) {
        console.error('[members route] professional update error:', error);
        return rpcErrorToResponse(error);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const ctx = await requireRole('admin');

    const limit = checkRateLimit(
      `admin:memberRemove:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;

    const { data, error } = await ctx.supabase.rpc('remove_account_member', {
      p_user_id: userId,
    });

    if (error) return rpcErrorToResponse(error);

    return NextResponse.json({ ok: true, newPersonalAccountId: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
