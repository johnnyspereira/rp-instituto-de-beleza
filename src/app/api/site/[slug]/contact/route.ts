import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
const ip = (request: Request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') ||
  'unknown';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = checkRateLimit(`public-site-lead:${ip(request)}`, {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);
  const { slug } = await params;
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
    subject?: string;
    message?: string;
  } | null;
  const name = body?.name?.trim() || '',
    phone = body?.phone?.trim() || '',
    email = body?.email?.trim().toLowerCase() || '',
    message = body?.message?.trim() || '',
    subject = body?.subject?.trim() || '';
  if (
    name.length < 2 ||
    name.length > 120 ||
    phone.length < 6 ||
    phone.length > 40 ||
    message.length < 3 ||
    message.length > 3000 ||
    email.length > 254
  )
    return Response.json(
      { error: 'Revise os campos obrigatórios.' },
      { status: 400 }
    );
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return Response.json(
      { error: 'Informe um email válido.' },
      { status: 400 }
    );
  const admin = supabaseAdmin(),
    { data: site } = await admin
      .from('public_site_settings')
      .select('account_id,slug')
      .ilike('slug', slug)
      .eq('enabled', true)
      .maybeSingle();
  if (!site)
    return Response.json({ error: 'Site indisponível.' }, { status: 404 });
  const { error } = await admin.from('public_site_leads').insert({
    account_id: site.account_id,
    name,
    email: email || null,
    phone,
    subject: subject || null,
    message,
    source_slug: site.slug,
  });
  if (error) {
    console.error('[public-site-lead]', error);
    return Response.json(
      { error: 'Não foi possível enviar agora.' },
      { status: 500 }
    );
  }
  return Response.json({ ok: true }, { status: 201 });
}
