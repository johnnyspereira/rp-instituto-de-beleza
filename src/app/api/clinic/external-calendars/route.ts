import { randomUUID } from 'node:crypto';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { parseICalendar } from '@/lib/clinic/ical';
import { isDeliverableUrl } from '@/lib/webhooks/ssrf';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';

export const dynamic = 'force-dynamic';

type CalendarFeed = {
  id: string;
  account_id: string;
  professional_profile_id: string | null;
  name: string;
  url_encrypted: string;
  enabled: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { data, error } = await supabase
      .from('external_calendar_feeds')
      .select(
        'id,name,professional_profile_id,enabled,last_synced_at,last_sync_error,created_at'
      )
      .eq('account_id', accountId)
      .order('created_at');
    if (error) throw error;
    return Response.json({ feeds: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      url?: string;
      professionalProfileId?: string | null;
    } | null;
    const name = body?.name?.trim() || 'Calendário externo';
    const url = body?.url?.trim() || '';
    const professionalProfileId = body?.professionalProfileId || null;
    const validation = await validateInput(ctx, url, professionalProfileId);
    if (validation) return validation;

    const feedId = randomUUID();
    const { error } = await ctx.supabase
      .from('external_calendar_feeds')
      .insert({
        id: feedId,
        account_id: ctx.accountId,
        user_id: ctx.userId,
        professional_profile_id: professionalProfileId,
        name: name.slice(0, 120),
        url_encrypted: encrypt(url),
        enabled: true,
      });
    if (error) throw error;

    const result = await syncFeed(ctx, {
      id: feedId,
      account_id: ctx.accountId,
      professional_profile_id: professionalProfileId,
      name,
      url_encrypted: encrypt(url),
      enabled: true,
      last_synced_at: null,
      last_sync_error: null,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = (await request.json().catch(() => null)) as {
      id?: string;
    } | null;
    let query = ctx.supabase
      .from('external_calendar_feeds')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('enabled', true);
    if (body?.id) query = query.eq('id', body.id);
    const { data, error } = await query;
    if (error) throw error;
    const results = [];
    for (const feed of (data ?? []) as CalendarFeed[]) {
      results.push(await syncFeed(ctx, feed));
    }
    return Response.json({ ok: true, results });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const id = new URL(request.url).searchParams.get('id');
    if (!id)
      return Response.json(
        { error: 'Calendário não informado.' },
        { status: 400 }
      );
    const { error } = await supabase
      .from('external_calendar_feeds')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function validateInput(
  ctx: Awaited<ReturnType<typeof requireRole>>,
  url: string,
  professionalProfileId: string | null
) {
  if (!url.startsWith('https://') || !(await isDeliverableUrl(url))) {
    return Response.json(
      { error: 'Informe um endereço HTTPS público e válido.' },
      { status: 400 }
    );
  }
  if (professionalProfileId) {
    const { data } = await ctx.supabase
      .from('profiles')
      .select('id')
      .eq('id', professionalProfileId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!data)
      return Response.json(
        { error: 'O profissional selecionado não é válido.' },
        { status: 400 }
      );
  }
  return null;
}

async function syncFeed(
  ctx: Awaited<ReturnType<typeof requireRole>>,
  feed: CalendarFeed
) {
  try {
    const feedUrl = decrypt(feed.url_encrypted);
    if (!(await isDeliverableUrl(feedUrl)))
      throw new Error('Endereço externo bloqueado por segurança.');
    const response = await fetch(feedUrl, {
      headers: { Accept: 'text/calendar, text/plain;q=0.9' },
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (!response.ok)
      throw new Error(`O calendário respondeu com HTTP ${response.status}.`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 2_000_000)
      throw new Error('O calendário excede o limite de 2 MB.');
    const content = await response.text();
    if (content.length > 2_000_000)
      throw new Error('O calendário excede o limite de 2 MB.');
    const events = parseICalendar(content);

    const { error: deleteError } = await ctx.supabase
      .from('clinic_time_blocks')
      .delete()
      .eq('account_id', ctx.accountId)
      .eq('external_calendar_feed_id', feed.id);
    if (deleteError) throw deleteError;
    if (events.length) {
      const { error: insertError } = await ctx.supabase
        .from('clinic_time_blocks')
        .insert(
          events.map((event) => ({
            id: randomUUID(),
            account_id: ctx.accountId,
            user_id: ctx.userId,
            professional_profile_id: feed.professional_profile_id,
            starts_at: event.startsAt.toISOString(),
            ends_at: event.endsAt.toISOString(),
            reason: `${feed.name}: ${event.summary}`,
            is_online_block: true,
            external_calendar_feed_id: feed.id,
            external_uid: event.uid,
          }))
        );
      if (insertError) throw insertError;
    }
    const syncedAt = new Date().toISOString();
    await ctx.supabase
      .from('external_calendar_feeds')
      .update({ last_synced_at: syncedAt, last_sync_error: null })
      .eq('id', feed.id)
      .eq('account_id', ctx.accountId);
    return { id: feed.id, imported: events.length, lastSyncedAt: syncedAt };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha desconhecida.';
    await ctx.supabase
      .from('external_calendar_feeds')
      .update({ last_sync_error: message })
      .eq('id', feed.id)
      .eq('account_id', ctx.accountId);
    throw error;
  }
}
