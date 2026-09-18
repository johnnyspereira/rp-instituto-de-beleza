import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import { engineSendText } from '@/lib/automations/meta-send';
import {
  ContactError,
  findOrCreateContact,
  resolveAuditUserId,
} from '@/lib/api/v1/contacts';
import { findExistingContact } from '@/lib/contacts/dedupe';
import { sendLocalEmail } from '@/lib/email/smtp';
import { referralInvitationEmail } from '@/lib/email/templates';
import { notifyAccountEvent } from '@/lib/notifications/account-events';
import { getPublicUrl } from '@/lib/public-url';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { referralRewardDescription } from '@/lib/referrals/presentation';
import { isValidE164, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';

function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

async function loadProgram(code: string) {
  if (!code || code.length > 64) return null;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('referral_codes')
    .select(
      'id, account_id, contact_id, code, is_active, referrer:contacts(name, phone), account:accounts(name, logo_url, public_url, default_currency)'
    )
    .ilike('code', code)
    .maybeSingle();
  if (error || !data || !data.is_active) return null;
  const { data: settings, error: settingsError } = await db
    .from('referral_program_settings')
    .select('*')
    .eq('account_id', data.account_id)
    .maybeSingle();
  if (settingsError || !settings?.enabled) return null;
  const now = Date.now();
  if (
    (settings.campaign_starts_at &&
      new Date(settings.campaign_starts_at).getTime() > now) ||
    (settings.campaign_ends_at &&
      new Date(settings.campaign_ends_at).getTime() <= now)
  ) {
    return null;
  }

  const serviceIds = [
    settings.friend_service_id,
    settings.referrer_service_id,
  ].filter(Boolean) as string[];
  const { data: services } = serviceIds.length
    ? await db
        .from('clinic_services')
        .select('id, name')
        .eq('account_id', data.account_id)
        .in('id', serviceIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const serviceNames = new Map(
    (services ?? []).map((service) => [service.id, service.name])
  );
  return { ...data, settings, serviceNames };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const limit = checkRateLimit(`referral-view:${clientIp(request)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);

  const { code } = await params;
  const program = await loadProgram(code.trim().toUpperCase());
  if (!program) {
    return NextResponse.json(
      { ok: false, error: 'Programa de indicação indisponível.' },
      { status: 404 }
    );
  }
  const referrer = Array.isArray(program.referrer)
    ? program.referrer[0]
    : program.referrer;
  const account = Array.isArray(program.account)
    ? program.account[0]
    : program.account;
  return NextResponse.json({
    ok: true,
    code: program.code,
    business: {
      name: account?.name ?? 'CRM',
      logo_url: account?.logo_url ?? null,
      currency: account?.default_currency ?? 'EUR',
    },
    referrer_name: referrer?.name?.split(' ')[0] ?? 'Um cliente',
    settings: {
      headline: program.settings.headline,
      description: program.settings.description,
      terms: program.settings.terms,
      require_consent: program.settings.require_consent,
      friend_reward_type: program.settings.friend_reward_type,
      friend_reward_value: program.settings.friend_reward_value,
      referrer_reward_type: program.settings.referrer_reward_type,
      referrer_reward_value: program.settings.referrer_reward_value,
      qualification_event: program.settings.qualification_event,
      minimum_qualifying_amount:
        program.settings.minimum_qualifying_amount ?? 0,
      friend_service_name:
        program.serviceNames.get(program.settings.friend_service_id) ?? null,
      referrer_service_name:
        program.serviceNames.get(program.settings.referrer_service_id) ?? null,
      new_clients_only: program.settings.new_clients_only !== false,
      campaign_ends_at: program.settings.campaign_ends_at,
      privacy_text: program.settings.public_privacy_text,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const ip = clientIp(request);
  const limit = checkRateLimit(`referral-submit:${ip}`, {
    limit: 8,
    windowMs: 60 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    phone?: string;
    email?: string;
    consent?: boolean;
    website?: string;
  } | null;
  if (!body || body.website) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
  const name = body.name?.trim() ?? '';
  const phone = sanitizePhoneForMeta(body.phone?.trim() ?? '');
  const email = body.email?.trim().toLowerCase() || null;
  if (
    name.length < 2 ||
    name.length > 120 ||
    !isValidE164(phone) ||
    (email !== null &&
      (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
  ) {
    return NextResponse.json(
      { error: 'Informe nome e telefone válidos.' },
      { status: 400 }
    );
  }

  const { code } = await params;
  const program = await loadProgram(code.trim().toUpperCase());
  if (!program) {
    return NextResponse.json(
      { error: 'Programa de indicação indisponível.' },
      { status: 404 }
    );
  }
  if (program.settings.require_consent && !body.consent) {
    return NextResponse.json(
      { error: 'Confirme o consentimento para continuar.' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  try {
    const phoneNormalized = normalizePhone(phone);
    const { data: duplicate } = await db
      .from('referrals')
      .select('id, status')
      .eq('account_id', program.account_id)
      .eq('friend_phone_normalized', phoneNormalized)
      .maybeSingle();
    if (duplicate) {
      return NextResponse.json(
        {
          error:
            duplicate.status === 'rejected'
              ? 'Este contacto já participou nesta campanha. Fale com a equipa para rever a indicação.'
              : 'Este telefone já possui uma indicação registada.',
        },
        { status: 409 }
      );
    }

    const existingContact = await findExistingContact(
      db,
      program.account_id,
      phone
    );
    if (existingContact?.id === program.contact_id) {
      return NextResponse.json(
        { error: 'Não é possível utilizar o seu próprio código.' },
        { status: 409 }
      );
    }
    if (program.settings.new_clients_only !== false && existingContact) {
      return NextResponse.json(
        { error: 'Esta campanha é exclusiva para novos clientes.' },
        { status: 409 }
      );
    }

    const auditUserId = await resolveAuditUserId(db, program.account_id);
    const contact = await findOrCreateContact(
      db,
      program.account_id,
      auditUserId,
      { name, phone, email: email ?? undefined }
    );
    const { data: referral, error } = await db
      .from('referrals')
      .insert({
        account_id: program.account_id,
        referral_code_id: program.id,
        referrer_contact_id: program.contact_id,
        friend_contact_id: contact.id,
        friend_name: name,
        friend_phone: phone,
        friend_phone_normalized: phoneNormalized,
        friend_email: email,
        status: 'registered',
        source: 'public_page',
        consent_at: body.consent ? new Date().toISOString() : null,
        registered_at: new Date().toISOString(),
        metadata: {
          ip_recorded: Boolean(ip),
          contact_created: contact.created,
          user_agent: request.headers.get('user-agent')?.slice(0, 240) ?? null,
        },
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Este telefone já participa do programa.' },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    if (program.settings.qualification_event === 'registration') {
      await db.rpc('qualify_referral_contact', {
        p_contact_id: contact.id,
        p_event: 'registration',
      });
    }

    const account = Array.isArray(program.account)
      ? program.account[0]
      : program.account;
    const referrer = Array.isArray(program.referrer)
      ? program.referrer[0]
      : program.referrer;
    const businessName = account?.name || 'RP Instituto de Beleza';
    const benefit = referralRewardDescription({
      type: program.settings.friend_reward_type,
      value: Number(program.settings.friend_reward_value),
      currency: account?.default_currency || 'EUR',
      serviceName:
        program.serviceNames.get(program.settings.friend_service_id) ?? null,
    });
    const bookingUrl = getPublicUrl('/portal', new URL(request.url).origin);
    const delivery = { email: 'skipped', whatsapp: 'skipped' };

    if (email) {
      try {
        await sendLocalEmail({
          to: email,
          ...referralInvitationEmail({
            businessName,
            logoUrl: account?.logo_url,
            friendName: name,
            referrerName: referrer?.name,
            bookingUrl,
            benefit,
          }),
        });
        delivery.email = 'sent';
      } catch (emailError) {
        delivery.email =
          emailError instanceof Error ? emailError.message : 'failed';
      }
    }

    try {
      const { data: conversations } = await db
        .from('conversations')
        .select('id')
        .eq('account_id', program.account_id)
        .eq('contact_id', contact.id)
        .limit(1);
      let conversationId = conversations?.[0]?.id as string | undefined;
      if (!conversationId) {
        const { data: created, error: conversationError } = await db
          .from('conversations')
          .insert({
            id: randomUUID(),
            account_id: program.account_id,
            user_id: auditUserId,
            contact_id: contact.id,
            status: 'open',
          })
          .select('id')
          .single();
        if (conversationError) throw new Error(conversationError.message);
        conversationId = created.id;
      }
      await engineSendText({
        accountId: program.account_id,
        userId: auditUserId,
        conversationId: conversationId!,
        contactId: contact.id,
        text: `🎁 *${businessName}*\n\nOlá, ${name.split(/\s+/)[0]}. ${referrer?.name?.split(/\s+/)[0] || 'Um amigo'} indicou-lhe a nossa experiência de bem-estar.\n\n*O seu benefício:* ${benefit}\n\nMarque a sua sessão: ${bookingUrl}`,
      });
      delivery.whatsapp = 'sent';
    } catch (whatsappError) {
      delivery.whatsapp =
        whatsappError instanceof Error ? whatsappError.message : 'failed';
    }

    try {
      await notifyAccountEvent({
        accountId: program.account_id,
        type: 'referral_registered',
        category: 'clients',
        priority: 'high',
        title: `Nova indicação: ${name}`,
        body: `Indicado por ${referrer?.name || 'cliente'}. Email ${delivery.email === 'sent' ? 'enviado' : 'não enviado'}; WhatsApp ${delivery.whatsapp === 'sent' ? 'enviado' : 'não enviado'}.`,
        actionUrl: '/referrals',
        contactId: contact.id,
        dedupeKey: `referral-registered:${referral.id}`,
        metadata: { referralId: referral.id, delivery, phone, email },
        whatsappText: `🎉 *Nova indicação recebida*\nNome: ${name}\nTelefone: ${phone}\nEmail: ${email || 'não informado'}\nIndicado por: ${referrer?.name || 'cliente'}\nConvite: email ${delivery.email === 'sent' ? '✅' : '⚠️'} · WhatsApp ${delivery.whatsapp === 'sent' ? '✅' : '⚠️'}`,
      });
    } catch (notificationError) {
      console.error(
        '[referrals] admin notification failed:',
        notificationError
      );
    }

    return NextResponse.json({
      ok: true,
      referral_id: referral.id,
      delivery,
      message: 'Indicação registada com sucesso.',
    });
  } catch (error) {
    const message =
      error instanceof ContactError
        ? error.message
        : 'Não foi possível registar a indicação. Tente novamente ou contacte a equipa.';
    console.error('[referrals] submit failed:', error);
    return NextResponse.json(
      { error: message },
      { status: error instanceof ContactError ? error.status : 500 }
    );
  }
}
