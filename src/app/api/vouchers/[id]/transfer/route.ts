import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isValidE164, normalizePhone } from '@/lib/whatsapp/phone-utils';

function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limit = checkRateLimit(`voucher-transfer:${clientIp(request)}`, {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    pin?: string;
    name?: string;
    phone?: string;
  } | null;
  const name = body?.name?.trim().replace(/\s+/g, ' ') ?? '';
  const phone = normalizePhone(body?.phone ?? '');
  const pin = body?.pin?.trim() ?? '';

  if (
    name.length < 2 ||
    name.length > 160 ||
    !isValidE164(phone) ||
    !/^\d{4,8}$/.test(pin)
  ) {
    return Response.json(
      {
        error: 'Preencha o nome e um telemóvel válido com indicativo do país.',
      },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const { data: voucher } = await db
    .from('finance_vouchers')
    .select('id,account_id,code,status,expires_at')
    .eq('id', id)
    .eq('pin_code', pin)
    .maybeSingle();

  if (
    !voucher ||
    voucher.status !== 'active' ||
    (voucher.expires_at && new Date(voucher.expires_at).getTime() <= Date.now())
  ) {
    return Response.json(
      { error: 'Este voucher não está disponível para transferência.' },
      { status: 409 }
    );
  }

  const { data: transfer, error } = await db
    .from('finance_voucher_transfer_requests')
    .insert({
      account_id: voucher.account_id,
      voucher_id: voucher.id,
      recipient_name: name,
      recipient_phone: `+${phone}`,
    })
    .select('id')
    .single();

  if (error?.code === '23505') {
    return Response.json(
      { error: 'Já existe um pedido de transferência em análise.' },
      { status: 409 }
    );
  }
  if (error) {
    return Response.json(
      { error: 'Não foi possível enviar o pedido. Tente novamente.' },
      { status: 500 }
    );
  }

  const { data: managers } = await db
    .from('profiles')
    .select('user_id')
    .eq('account_id', voucher.account_id)
    .in('account_role', ['owner', 'admin'])
    .not('user_id', 'is', null);

  if (managers?.length) {
    await db.from('notifications').insert(
      managers.map((profile) => ({
        account_id: voucher.account_id,
        user_id: profile.user_id,
        type: 'system_alert',
        category: 'finance',
        priority: 'normal',
        title: 'Pedido de transferência de voucher',
        body: `${name} (${`+${phone}`}) pediu para receber o voucher ${voucher.code}.`,
        action_url: '/finance?tab=vouchers',
        metadata: {
          voucher_id: voucher.id,
          transfer_request_id: transfer.id,
          recipient_phone: `+${phone}`,
        },
      }))
    );
  }

  return Response.json(
    {
      ok: true,
      message:
        'Pedido enviado. A nossa equipa entrará em contacto para confirmar a transferência.',
    },
    { status: 201 }
  );
}
