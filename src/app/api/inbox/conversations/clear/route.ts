import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

const CONFIRMATION_PHRASE = 'CLEAR_INBOX';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const body = (await request.json().catch(() => null)) as {
      confirmation?: unknown;
    } | null;

    if (body?.confirmation !== CONFIRMATION_PHRASE) {
      return NextResponse.json(
        { error: 'Confirmation phrase is required.' },
        { status: 400 }
      );
    }

    const { count, error: countError } = await ctx.supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId);

    if (countError) {
      console.error('[inbox/clear] conversation count failed:', countError);
      return NextResponse.json(
        { error: 'Failed to count conversations.' },
        { status: 500 }
      );
    }

    const { error: dealsError } = await ctx.supabase
      .from('deals')
      .update({ conversation_id: null })
      .eq('account_id', ctx.accountId)
      .not('conversation_id', 'is', null);

    if (dealsError) {
      console.error('[inbox/clear] deal unlink failed:', dealsError);
      return NextResponse.json(
        { error: 'Failed to unlink deals from conversations.' },
        { status: 500 }
      );
    }

    const { error: deleteError } = await ctx.supabase
      .from('conversations')
      .delete()
      .eq('account_id', ctx.accountId);

    if (deleteError) {
      console.error('[inbox/clear] conversation delete failed:', deleteError);
      return NextResponse.json(
        { error: 'Failed to clear conversations.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      conversationsDeleted: count ?? 0,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
