function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

type BrandedEmailInput = {
  businessName: string;
  logoUrl?: string | null;
  signOffName?: string | null;
  preheader: string;
  eyebrow: string;
  title: string;
  greeting: string;
  message: string;
  details?: Array<{ label: string; value: string }>;
  action?: { label: string; url: string } | null;
  highlight?: { label: string; value: string } | null;
  notice?: string;
};

function displayBusinessName(value: string) {
  const trimmed = value.trim();
  return !trimmed || /^cl[ií]nica$/i.test(trimmed) ? 'RP Instituto de Beleza' : trimmed;
}

export function brandedEmail(input: BrandedEmailInput) {
  const brand = displayBusinessName(input.businessName);
  const initials = brand
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const brandMark = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" width="58" height="58" alt="${escapeHtml(brand)}" style="display:block;width:58px;height:58px;object-fit:contain;border-radius:18px;background:#fff">`
    : `<div style="display:inline-block;box-sizing:border-box;width:58px;height:58px;padding-top:18px;border-radius:18px;background:#cf7658;color:#fff;font-size:16px;font-weight:800;letter-spacing:.06em;text-align:center">${escapeHtml(initials || 'JP')}</div>`;
  const details = input.details?.length
    ? `<div style="margin:30px 0;border:1px solid #e8dfd7;border-radius:18px;overflow:hidden;background:#fbfaf8">${input.details.map(({ label, value }) => `<div style="padding:16px 20px;border-bottom:1px solid #eee6df"><div style="margin-bottom:4px;color:#8c8279;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(label)}</div><div style="color:#2b2521;font-size:15px;font-weight:650;line-height:22px">${escapeHtml(value)}</div></div>`).join('')}</div>`
    : '';
  const highlight = input.highlight
    ? `<div style="margin:24px 0;padding:20px;border-radius:16px;background:#f3e5dc"><div style="color:#9d573f;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(input.highlight.label)}</div><div style="margin-top:7px;color:#392018;font-size:24px;font-weight:800;letter-spacing:.08em">${escapeHtml(input.highlight.value)}</div></div>`
    : '';
  const action = input.action
    ? `<div style="margin:30px 0 12px"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;border-radius:999px;background:#2c211b;padding:14px 22px;color:#fff;font-size:14px;font-weight:800;text-decoration:none">${escapeHtml(input.action.label)}</a></div><p style="margin:0;color:#91877f;font-size:11px;line-height:17px;word-break:break-word">Se o botão não abrir, use este endereço: <a href="${escapeHtml(input.action.url)}" style="color:#9d573f">${escapeHtml(input.action.url)}</a></p>`
    : '';
  const notice = input.notice
    ? `<div style="margin-top:24px;padding:14px 16px;border-left:3px solid #cf7658;background:#fff8f4;color:#695d55;font-size:12px;line-height:19px">${escapeHtml(input.notice)}</div>`
    : '';
  const signature = input.signOffName?.trim() || brand;
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.title)}</title></head><body style="margin:0;background:#f3efea;color:#2b2521;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3efea"><tr><td align="center" style="padding:34px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;overflow:hidden;border-radius:24px;background:#fff;box-shadow:0 18px 55px rgba(55,38,25,.12)"><tr><td style="padding:27px 30px;background:#2c211b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="72" valign="middle">${brandMark}</td><td valign="middle"><div style="color:#fff;font-size:20px;font-weight:800;line-height:25px">${escapeHtml(brand)}</div><div style="margin-top:3px;color:#d8cbc0;font-size:11px;line-height:16px">O seu espaço de bem-estar</div></td><td align="right" valign="middle" style="color:#d8cbc0;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</td></tr></table></td></tr><tr><td style="padding:40px 34px 34px"><p style="margin:0 0 14px;color:#7f746c;font-size:16px;line-height:24px">${escapeHtml(input.greeting)}</p><h1 style="margin:0 0 16px;color:#2c211b;font-family:Georgia,serif;font-size:31px;line-height:38px">${escapeHtml(input.title)}</h1><p style="margin:0;color:#5f554e;font-size:16px;line-height:26px">${escapeHtml(input.message)}</p>${details}${highlight}${action}${notice}<p style="margin:31px 0 0;color:#71665e;font-size:14px;line-height:22px">Até breve,<br><strong style="color:#2c211b">${escapeHtml(signature)}</strong></p></td></tr><tr><td style="padding:19px 34px;background:#fbfaf8;border-top:1px solid #eee6df;color:#90857c;font-size:11px;line-height:17px">Comunicação privada enviada por ${escapeHtml(brand)}. Não partilhe links, códigos ou palavras-passe.</td></tr></table></td></tr></table></body></html>`;
}

// Kept as a compatibility renderer for operators who may have imported it.
export function legacyBrandedEmail(input: {
  businessName: string;
  logoUrl?: string | null;
  signOffName?: string | null;
  preheader: string;
  eyebrow: string;
  title: string;
  greeting: string;
  message: string;
  details?: Array<{ label: string; value: string }>;
  action?: { label: string; url: string } | null;
  highlight?: { label: string; value: string } | null;
  notice?: string;
}) {
  const brand = input.businessName.trim() || 'RP Instituto de Beleza';
  const initials =
    brand
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'JP';
  const brandMark = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" width="48" height="48" alt="${escapeHtml(brand)}" style="display:block;width:48px;height:48px;object-fit:contain;border-radius:12px;background:#fff">`
    : `<div style="display:inline-block;padding:9px 11px;border-radius:10px;background:#12a594;color:#fff;font-size:14px;font-weight:800">${escapeHtml(initials)}</div>`;
  const signature = input.signOffName?.trim() || brand;
  const details = input.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0;background:#f5f8f6;border:1px solid #e1e9e4;border-radius:14px">${input.details.map(({ label, value }, index) => `<tr><td style="padding:${index ? '0 20px 15px' : '18px 20px 15px'}"><div style="font-size:11px;line-height:16px;letter-spacing:.08em;text-transform:uppercase;color:#738078">${escapeHtml(label)}</div><div style="margin-top:3px;font-size:15px;line-height:22px;font-weight:600;color:#183025">${escapeHtml(value)}</div></td></tr>`).join('')}</table>`
    : '';
  const action = input.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 22px"><tr><td style="border-radius:10px;background:#0f9f8f"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:14px 24px;color:#fff;text-decoration:none;font-size:15px;font-weight:700">${escapeHtml(input.action.label)}</a></td></tr></table><p style="margin:0 0 24px;font-size:12px;line-height:18px;color:#738078;word-break:break-all">Se o botão não funcionar, copie este endereço:<br><a href="${escapeHtml(input.action.url)}" style="color:#0b7f74">${escapeHtml(input.action.url)}</a></p>`
    : '';
  const highlight = input.highlight
    ? `<div style="margin:24px 0;padding:18px 20px;border-radius:12px;background:#ecfdf8;border:1px solid #b9eee2"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#33776d">${escapeHtml(input.highlight.label)}</div><div style="margin-top:7px;font-size:23px;font-weight:800;letter-spacing:.06em;color:#0d584f">${escapeHtml(input.highlight.value)}</div></div>`
    : '';
  const notice = input.notice
    ? `<div style="margin-top:24px;padding:14px 16px;border-left:3px solid #d9a441;background:#fffaf0;color:#655430;font-size:13px;line-height:20px">${escapeHtml(input.notice)}</div>`
    : '';
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.title)}</title></head><body style="margin:0;background:#edf2ef;font-family:Inter,Arial,Helvetica,sans-serif;color:#183025"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf2ef;padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #d8e4dd;border-radius:22px;overflow:hidden;box-shadow:0 16px 44px rgba(18,55,38,.09)"><tr><td style="padding:24px 32px;background:#102f21;color:#fff"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="58" valign="middle">${brandMark}</td><td valign="middle"><div style="font-size:18px;font-weight:800;line-height:23px">${escapeHtml(brand)}</div><div style="font-size:11px;line-height:17px;color:#b9d4c5">Cuidado, bem-estar e acompanhamento</div></td><td align="right" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#b6d2c2">${escapeHtml(input.eyebrow)}</td></tr></table></td></tr><tr><td style="padding:38px 34px"><p style="margin:0 0 10px;font-size:16px;line-height:24px;color:#4f6258">${escapeHtml(input.greeting)}</p><h1 style="margin:0 0 16px;font-size:29px;line-height:36px;color:#102f21">${escapeHtml(input.title)}</h1><p style="margin:0;font-size:16px;line-height:26px;color:#4f6258">${escapeHtml(input.message)}</p>${details}${highlight}${action}${notice}<p style="margin:30px 0 0;font-size:14px;line-height:22px;color:#617269">Com os melhores cumprimentos,<br><strong style="color:#183025">${escapeHtml(signature)}</strong></p></td></tr><tr><td style="padding:18px 34px;background:#f7faf8;border-top:1px solid #e7ede9;font-size:11px;line-height:17px;color:#7a887f">Mensagem automática e confidencial enviada por ${escapeHtml(brand)}. Por favor, não partilhe links pessoais, códigos ou palavras-passe.</td></tr></table></td></tr></table></body></html>`;
}

export function portalAccessEmail(input: {
  businessName: string;
  logoUrl?: string | null;
  clientName?: string | null;
  portalUrl: string;
  password: string;
}) {
  const firstName = input.clientName?.trim().split(/\s+/)[0] || 'cliente';
  const business = input.businessName || 'RP Instituto de Beleza';
  return {
    subject: `${business} · O seu acesso ao Portal 360`,
    text: `Olá, ${firstName}. O seu acesso ao Portal 360 da ${business} está pronto. Entre em ${input.portalUrl} e utilize a palavra-passe temporária ${input.password}. No primeiro acesso, defina uma nova palavra-passe.`,
    html: brandedEmail({
      businessName: business,
      logoUrl: input.logoUrl,
      signOffName: business,
      preheader: 'O seu acesso privado ao Portal 360 está pronto.',
      eyebrow: 'Portal 360',
      title: 'O seu acesso está pronto',
      greeting: `Olá, ${firstName}.`,
      message:
        'Consulte as suas marcações, benefícios, documentos e pedidos num espaço privado e seguro.',
      action: { label: 'Entrar no Portal 360', url: input.portalUrl },
      highlight: { label: 'Palavra-passe temporária', value: input.password },
      notice:
        'No primeiro acesso será solicitado que escolha uma nova palavra-passe. Este link é pessoal e de utilização única.',
    }),
  };
}

export function passwordResetEmail(input: {
  businessName?: string;
  resetUrl: string;
}) {
  const business = input.businessName || 'RP Instituto de Beleza';
  return {
    subject: `${business} · Recuperar acesso`,
    text: `Recebemos um pedido para alterar a sua palavra-passe. Use este link durante os próximos 30 minutos: ${input.resetUrl}. Se não fez este pedido, ignore esta mensagem.`,
    html: brandedEmail({
      businessName: business,
      preheader: 'Defina uma nova palavra-passe com segurança.',
      eyebrow: 'Segurança',
      title: 'Recuperar acesso',
      greeting: 'Olá.',
      message:
        'Recebemos um pedido para alterar a palavra-passe da sua conta. O botão abaixo é válido durante 30 minutos.',
      action: { label: 'Definir nova palavra-passe', url: input.resetUrl },
      notice:
        'Se não pediu esta alteração, pode ignorar este email. A sua palavra-passe atual continuará válida.',
    }),
  };
}

export function voucherDeliveryEmail(input: {
  businessName: string;
  logoUrl?: string | null;
  clientName?: string | null;
  recipientName?: string | null;
  voucherUrl: string;
  code: string;
  pin: string;
  benefit: string;
  expiresAt?: string | null;
  message?: string | null;
}) {
  const business = input.businessName || 'RP Instituto de Beleza';
  const name = input.clientName?.trim().split(/\s+/)[0] || 'cliente';
  const expiry = input.expiresAt
    ? new Date(input.expiresAt).toLocaleDateString('pt-PT')
    : 'Sem data limite';
  return {
    subject: `${business} · O seu voucher ${input.code}`,
    text: [
      `Olá, ${name}.`,
      `O voucher para ${input.recipientName || input.clientName || 'o destinatário'} está pronto.`,
      `Benefício: ${input.benefit}`,
      `Código: ${input.code}`,
      `PIN: ${input.pin}`,
      `Validade: ${expiry}`,
      input.message ? `Mensagem: ${input.message}` : null,
      `Consultar voucher: ${input.voucherUrl}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    html: brandedEmail({
      businessName: business,
      logoUrl: input.logoUrl,
      signOffName: business,
      preheader: `O voucher ${input.code} está pronto para oferecer.`,
      eyebrow: 'Voucher',
      title: 'Um presente especial está pronto',
      greeting: `Olá, ${name}.`,
      message: `Preparámos o voucher para ${input.recipientName || input.clientName || 'o destinatário'}. Pode consultar, validar ou apresentar o voucher através do botão abaixo.`,
      details: [
        { label: 'Benefício', value: input.benefit },
        { label: 'Código', value: input.code },
        { label: 'Validade', value: expiry },
        ...(input.message ? [{ label: 'Mensagem', value: input.message }] : []),
      ],
      highlight: { label: 'PIN de utilização', value: input.pin },
      action: { label: 'Abrir o voucher', url: input.voucherUrl },
      notice:
        'Guarde o código e o PIN. O voucher pode ser validado online e apresentado no momento do atendimento.',
    }),
  };
}

export function referralInvitationEmail(input: {
  businessName: string;
  logoUrl?: string | null;
  friendName: string;
  referrerName?: string | null;
  bookingUrl: string;
  benefit: string;
}) {
  const business = input.businessName || 'RP Instituto de Beleza';
  const firstName = input.friendName.trim().split(/\s+/)[0] || 'cliente';
  const referrer = input.referrerName?.trim().split(/\s+/)[0] || 'um amigo';
  return {
    subject: `${referrer} ofereceu-lhe um benefício na ${business}`,
    text: `Olá, ${firstName}. ${referrer} indicou-lhe a ${business}. O seu benefício é ${input.benefit}. Conheça a campanha e marque a sua sessão: ${input.bookingUrl}`,
    html: brandedEmail({
      businessName: business,
      logoUrl: input.logoUrl,
      signOffName: business,
      preheader: `${referrer} preparou uma experiência especial para si.`,
      eyebrow: 'Convite especial',
      title: `${firstName}, recebeu um convite`,
      greeting: `Olá, ${firstName}.`,
      message: `${referrer} recomendou-lhe a nossa experiência de bem-estar. Ao realizar a sua primeira marcação elegível, poderá usufruir do benefício abaixo.`,
      highlight: { label: 'O seu benefício', value: input.benefit },
      action: { label: 'Conhecer e marcar sessão', url: input.bookingUrl },
      notice:
        'Este convite foi criado através do nosso programa de indicações. A equipa confirmará as condições antes da utilização do benefício.',
    }),
  };
}

export function packDeliveryEmail(input: {
  businessName: string;
  logoUrl?: string | null;
  clientName?: string | null;
  packName: string;
  code: string;
  pin: string;
  expiresAt?: string | null;
  sessions: Array<{ service: string; total: number }>;
  portalUrl: string;
}) {
  const business = input.businessName || 'RP Instituto de Beleza';
  const name = input.clientName?.trim().split(/\s+/)[0] || 'cliente';
  const expiry = input.expiresAt
    ? new Date(input.expiresAt).toLocaleDateString('pt-PT')
    : 'Sem data limite';
  const sessionSummary = input.sessions.length
    ? input.sessions.map((item) => `${item.total}× ${item.service}`).join(' · ')
    : 'Sessões disponíveis no Portal 360';
  return {
    subject: `${business} · O seu pack ${input.packName}`,
    text: `Olá, ${name}. O seu pack ${input.packName} está ativo. Sessões: ${sessionSummary}. Código: ${input.code}. PIN: ${input.pin}. Validade: ${expiry}. Consulte em ${input.portalUrl}`,
    html: brandedEmail({
      businessName: business,
      logoUrl: input.logoUrl,
      signOffName: business,
      preheader: `O seu pack ${input.packName} já está disponível.`,
      eyebrow: 'Pack de sessões',
      title: 'O seu pack está ativo',
      greeting: `Olá, ${name}.`,
      message:
        'A compra foi confirmada e as suas sessões já estão disponíveis para marcação no Portal 360.',
      details: [
        { label: 'Pack', value: input.packName },
        { label: 'Sessões incluídas', value: sessionSummary },
        { label: 'Código', value: input.code },
        { label: 'Validade', value: expiry },
      ],
      highlight: { label: 'PIN de utilização', value: input.pin },
      action: { label: 'Abrir o Portal 360', url: input.portalUrl },
      notice:
        'Guarde o código e o PIN. O saldo apresentado no portal considera apenas sessões ativas e ainda disponíveis.',
    }),
  };
}
