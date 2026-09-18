// ============================================================
// GET /api/account/members
//
// Lists every member of the caller's account. Admin+ only.
// Agents/viewers do not need the team roster for day-to-day operation
// and should not be able to enumerate account users via URL/API.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isAccountRole } from '@/lib/auth/roles';
import type { AccountMember } from '@/types';

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_role: string;
  created_at: string;
  is_professional?: boolean | null;
  professional_title?: string | null;
  professional_color?: string | null;
  professional_bio?: string | null;
  professional_phone?: string | null;
  professional_public_slug?: string | null;
  professional_show_online?: boolean | null;
  commission_executant_percent?: number | null;
  commission_responsible_percent?: number | null;
  working_hours?: Record<string, unknown> | null;
  online_booking_blocked?: boolean | null;
}

export async function GET() {
  try {
    const ctx = await requireRole('admin');

    // RLS on profiles allows reading any row whose account matches
    // the caller's, so this query is naturally account-scoped.
    const { data, error } = await ctx.supabase
      .from('profiles')
      .select(
        'user_id, full_name, email, avatar_url, account_role, created_at, is_professional, professional_title, professional_color, professional_bio, professional_phone, professional_public_slug, professional_show_online, commission_executant_percent, commission_responsible_percent, working_hours, online_booking_blocked'
      )
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET /api/account/members] fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load members' },
        { status: 500 }
      );
    }

    const members: AccountMember[] = (data as ProfileRow[]).flatMap((row) => {
      // Defensive: the DB enum should never let an unknown role
      // through, but if a migration ever broadens the enum without
      // updating TS, skip the row rather than crash the page.
      if (!isAccountRole(row.account_role)) return [];
      return [
        {
          user_id: row.user_id,
          full_name: row.full_name ?? '',
          email: row.email,
          avatar_url: row.avatar_url,
          role: row.account_role,
          joined_at: row.created_at,
          is_professional: Boolean(row.is_professional),
          professional_title: row.professional_title ?? null,
          professional_color: row.professional_color ?? null,
          professional_bio: row.professional_bio ?? null,
          professional_phone: row.professional_phone ?? null,
          professional_public_slug: row.professional_public_slug ?? null,
          professional_show_online: row.professional_show_online ?? true,
          commission_executant_percent: row.commission_executant_percent ?? 0,
          commission_responsible_percent:
            row.commission_responsible_percent ?? 0,
          working_hours: row.working_hours ?? {},
          online_booking_blocked: row.online_booking_blocked ?? false,
        },
      ];
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}
