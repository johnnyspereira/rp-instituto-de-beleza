import { randomBytes } from 'node:crypto';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { sendLocalEmail } from '@/lib/email/smtp';
import { portalAccessEmail } from '@/lib/email/templates';
import { portalAuthEmail } from '@/lib/portal/identity';
import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';
import { getPublicUrl } from '@/lib/public-url';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  const token = Array.from(
    bytes,
    (byte) => alphabet[byte % alphabet.length]
  ).join('');
  return `WA-${token.slice(0, 5)}-${token.slice(5)}`;
}

function smtpErrorForUser(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes('eauth') ||
    normalized.includes('invalid login') ||
    normalized.includes('authentication') ||
    normalized.includes('535')
  )
    return 'O servidor recusou o utilizador ou a senha SMTP. Confirme SMTP_USER e SMTP_PASSWORD.';
  if (
    normalized.includes('certificate') ||
    normalized.includes('self signed') ||
    normalized.includes('tls')
  )
    return 'A ligação SMTP falhou na validação do certificado TLS.';
  if (
    normalized.includes('econnrefused') ||
    normalized.includes('etimedout') ||
    normalized.includes('timeout') ||
    normalized.includes('enotfound')
  )
    return 'Não foi possível ligar ao servidor SMTP. Confirme o host e a porta.';
  if (
    normalized.includes('sender') ||
    normalized.includes('from') ||
    normalized.includes('eenvelope') ||
    normalized.includes('553')
  )
    return 'O servidor recusou o remetente. Use no SMTP_FROM a mesma conta do SMTP_USER.';
  if (normalized.includes('quota') || normalized.includes('mailbox is full'))
    return 'A caixa de email atingiu o limite de armazenamento.';
  return `Falha SMTP: ${message.slice(0, 280)}`;
}

function portalIdentityErrorCode(message = '') {
  const normalized = message.toLowerCase();
  if (normalized.includes('duplicate') || normalized.includes('unique'))
    return 'PORTAL_IDENTITY_DUPLICATE';
  if (normalized.includes('user_metadata') || normalized.includes('unknown column'))
    return 'PORTAL_IDENTITY_SCHEMA';
  if (normalized.includes('scrypt') || normalized.includes('memory'))
    return 'PORTAL_IDENTITY_PASSWORD';
  if (normalized.includes('connect') || normalized.includes('timeout'))
    return 'PORTAL_IDENTITY_DATABASE';
  return 'PORTAL_IDENTITY_CREATE_FAILED';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = checkRateLimit(`portal-password:${clientIp(request)}`, {
    limit: 4,
    windowMs: 60 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    delivery?: 'email' | 'whatsapp';
  } | null;
  const email = body?.email?.trim().toLowerCase() || '';
  const delivery = body?.delivery === 'whatsapp' ? 'whatsapp' : 'email';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json(
      { error: 'Informe um email válido.' },
      { status: 400 }
    );
  }

  const { slug } = await params;
  const admin = supabaseAdmin();
  const { data: settings } = await admin
    .from('client_portal_settings')
    .select('account_id,enabled')
    .ilike('slug', slug.trim())
    .eq('enabled', true)
    .maybeSingle();
  if (!settings)
    return Response.json({ error: 'Portal indisponível.' }, { status: 404 });

  const generic = Response.json({
    ok: true,
    message:
      delivery === 'email'
        ? 'Se o email estiver associado a um cliente, enviaremos as instruções de acesso para esse endereço.'
        : 'Se o email estiver associado a um cliente, enviaremos as instruções para o WhatsApp registado.',
  });
  const { data: contacts } = await admin
    .from('contacts')
    .select('id,name,phone,email')
    .eq('account_id', settings.account_id)
    .ilike('email', email)
    .limit(2);
  if (!contacts?.length) return generic;
  if (contacts.length > 1) {
    return Response.json(
      {
        error:
          'Este email está associado a mais de uma ficha de cliente. Contacte a clínica para unificar os registos antes de criar o acesso.',
        code: 'PORTAL_DUPLICATE_EMAIL',
      },
      { status: 409 }
    );
  }
  const contact = contacts[0];
  if (delivery === 'whatsapp' && !contact.phone) return generic;
  if (delivery === 'whatsapp' && !remoteWhatsAppWorker.enabled()) {
    return Response.json(
      { error: 'O WhatsApp remoto não está configurado. Use remote_worker para enviar o acesso.' },
      { status: 503 }
    );
  }

  const { data: qrConfig } = await admin
    .from('whatsapp_config')
    .select('user_id')
    .eq('account_id', settings.account_id)
    .maybeSingle();
  const auditUserId =
    qrConfig?.user_id || (await resolveAuditUserId(admin, settings.account_id));
  if (delivery === 'whatsapp') {
    let status = remoteWhatsAppWorker.enabled()
      ? await remoteWhatsAppWorker.status({
          accountId: settings.account_id,
          userId: auditUserId,
          autoStart: true,
        })
      : await getLocalQrStatus();
    if (!status.connected && !remoteWhatsAppWorker.enabled()) {
      status = await startLocalQrSession(settings.account_id, auditUserId);
    }
    if (!status.connected) {
      return Response.json(
        {
          error:
            'O WhatsApp da clínica está temporariamente indisponível. Tente novamente mais tarde.',
        },
        { status: 503 }
      );
    }
  }

  let { data: access } = await admin
    .from('client_portal_access')
    .select('id,auth_user_id,portal_auth_email')
    .eq('account_id', settings.account_id)
    .eq('contact_id', contact.id)
    .maybeSingle();
  const internalEmail = portalAuthEmail(settings.account_id, contact.id);
  const previousAccess = access ? { ...access } : null;
  let createdUserId: string | null = null;
  let createdAccess = false;
  const password = temporaryPassword();

  let hasIsolatedIdentity = access?.portal_auth_email === internalEmail;
  if (hasIsolatedIdentity && access) {
    const { data: existingAuth } = await admin.auth.admin.getUserById(
      access.auth_user_id
    );
    hasIsolatedIdentity =
      existingAuth.user?.email?.toLowerCase() === internalEmail;
  }

  if (!hasIsolatedIdentity) {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        user_metadata: {
          portal_password_temporary: true,
          portal_account_id: settings.account_id,
          portal_contact_id: contact.id,
          portal_identity: true,
        },
      });
    if (createError || !created.user) {
      const identityErrorCode = portalIdentityErrorCode(createError?.message);
      console.warn(
        '[portal-password] auth user could not be created:',
        createError?.message
      );
      return Response.json(
        {
          error:
            'Não foi possível preparar a identidade segura do Portal 360. Contacte a clínica.',
          code: identityErrorCode,
        },
        { status: 502 }
      );
    }
    createdUserId = created.user.id;
    const accessMutation = access
      ? admin
          .from('client_portal_access')
          .update({
            auth_user_id: created.user.id,
            portal_auth_email: internalEmail,
            email,
            requires_password_change: true,
            password_issued_at: new Date().toISOString(),
          })
          .eq('id', access.id)
      : admin.from('client_portal_access').insert({
          account_id: settings.account_id,
          contact_id: contact.id,
          auth_user_id: created.user.id,
          portal_auth_email: internalEmail,
          email,
          requires_password_change: true,
          password_issued_at: new Date().toISOString(),
        });
    const { data: inserted, error: accessError } = await accessMutation
      .select('id,auth_user_id,portal_auth_email')
      .single();
    if (accessError) {
      await admin.auth.admin.deleteUser(created.user.id);
      console.error('[portal-password] access record failed:', accessError);
      return Response.json(
        {
          error:
            'Não foi possível associar a ficha ao Portal 360. Contacte a clínica.',
          code: 'PORTAL_ACCESS_LINK_FAILED',
        },
        { status: 502 }
      );
    }
    access = inserted;
    createdAccess = !previousAccess;
  }

  let { data: conversation } = await admin
    .from('conversations')
    .select('id')
    .eq('account_id', settings.account_id)
    .eq('contact_id', contact.id)
    .maybeSingle();
  if (!conversation) {
    const { data: inserted, error } = await admin
      .from('conversations')
      .insert({
        account_id: settings.account_id,
        user_id: auditUserId,
        contact_id: contact.id,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    conversation = inserted;
  }

  try {
    if (!createdUserId && access) {
      const { error } = await admin.auth.admin.updateUserById(
        access.auth_user_id,
        {
          password,
          user_metadata: {
            portal_password_temporary: true,
            portal_account_id: settings.account_id,
            portal_contact_id: contact.id,
            portal_identity: true,
          },
        }
      );
      if (error) throw error;
      await admin
        .from('client_portal_access')
        .update({
          requires_password_change: true,
          password_issued_at: new Date().toISOString(),
        })
        .eq('id', access.id);
    }
    const { data: magicLink, error: magicLinkError } =
      await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: internalEmail,
      });
    if (magicLinkError || !magicLink.properties?.hashed_token) {
      throw (
        magicLinkError || new Error('Não foi possível criar o link de acesso.')
      );
    }
    const portalUrl = new URL(
      getPublicUrl('/portal', new URL(request.url).origin)
    );
    portalUrl.searchParams.set(
      'portal_token',
      magicLink.properties.hashed_token
    );

    const recipientName = contact.name ? `, ${contact.name.split(' ')[0]}` : '';
    const accessText = `Olá${recipientName}. O seu acesso seguro ao Portal 360 está pronto. Entre diretamente em ${portalUrl.toString()} ou use o seu email e a palavra-passe temporária ${password}. O link é pessoal, de utilização única e expira por segurança. No primeiro acesso, defina uma nova palavra-passe.`;
    if (delivery === 'email') {
      const { data: account } = await admin
        .from('accounts')
        .select('name,logo_url')
        .eq('id', settings.account_id)
        .maybeSingle();
      const template = portalAccessEmail({
        businessName: account?.name || 'RP Instituto de Beleza',
        logoUrl: account?.logo_url,
        clientName: contact.name,
        portalUrl: portalUrl.toString(),
        password,
      });
      await sendLocalEmail({
        to: email,
        profile: 'general',
        ...template,
      });
    } else if (remoteWhatsAppWorker.enabled()) {
      await remoteWhatsAppWorker.send({
        accountId: settings.account_id,
        userId: auditUserId,
        conversationId: conversation.id,
        message: {
          text: accessText,
          contentType: 'text',
          senderType: 'bot',
        },
      });
    } else {
      await sendTextViaLocalQr(
        settings.account_id,
        conversation.id,
        accessText,
        { senderType: 'bot' }
      );
    }
    return Response.json({
      ok: true,
      delivered: true,
      channel: delivery,
      message:
        delivery === 'email'
          ? `Email de acesso enviado para ${email}. Verifique também o spam.`
          : 'Acesso enviado para o WhatsApp registado.',
    });
  } catch (error) {
    if (createdUserId) {
      if (createdAccess) {
        await admin
          .from('client_portal_access')
          .delete()
          .eq('auth_user_id', createdUserId);
      } else if (previousAccess) {
        await admin
          .from('client_portal_access')
          .update({
            auth_user_id: previousAccess.auth_user_id,
            portal_auth_email: previousAccess.portal_auth_email,
          })
          .eq('id', previousAccess.id);
      }
      await admin.auth.admin.deleteUser(createdUserId);
    }
    console.error(`[portal-password] ${delivery} delivery failed:`, error);
    return Response.json(
      {
        error:
          delivery === 'email'
            ? smtpErrorForUser(error)
            : 'Não foi possível enviar o link e a senha pelo WhatsApp neste momento.',
      },
      { status: 502 }
    );
  }
}

async function getLocalQrStatus() {
  const { getBaileysSessionStatus } = await import('@/lib/whatsapp/baileys');
  return getBaileysSessionStatus();
}

async function startLocalQrSession(accountId: string, userId: string) {
  const { startBaileysSession } = await import('@/lib/whatsapp/baileys');
  return startBaileysSession({
    accountId,
    userId,
    autoStart: true,
    restoreOnly: true,
  });
}

async function sendTextViaLocalQr(
  accountId: string,
  conversationId: string,
  text: string,
  options: { senderType?: 'agent' | 'bot'; replyToMessageId?: string | null }
) {
  const { sendTextViaBaileys } = await import('@/lib/whatsapp/baileys');
  return sendTextViaBaileys(accountId, conversationId, text, options);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access, user } = await requirePortalAccess(slug);
    const body = (await request.json()) as { password?: string };
    const password = body.password || '';
    if (
      password.length < 10 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      return Response.json(
        { error: 'Use pelo menos 10 caracteres, incluindo letras e números.' },
        { status: 400 }
      );
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: {
        ...user.user_metadata,
        portal_password_temporary: false,
      },
    });
    if (error) throw error;
    await admin
      .from('client_portal_access')
      .update({
        requires_password_change: false,
        password_changed_at: new Date().toISOString(),
      })
      .eq('id', access.id);
    return Response.json({ ok: true });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
