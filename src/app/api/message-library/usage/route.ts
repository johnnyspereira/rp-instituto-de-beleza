import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const body = await request.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: item, error: readError } = await supabase
      .from('message_library_items')
      .select('id, usage_count')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('message_library_items')
      .update({
        usage_count: Number(item.usage_count ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
