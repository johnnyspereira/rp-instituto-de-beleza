import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

function defaultSender() {
  const configuredUrl =
    process.env.CANONICAL_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    '';
  try {
    const hostname = new URL(configuredUrl).hostname.replace(/^www\./, '');
    return hostname === 'rp-instituto.example'
      ? 'geral@rp-instituto.example'
      : `no-reply@${hostname}`;
  } catch {
    return 'geral@rp-instituto.example';
  }
}

export type EmailProfile = 'general' | 'agenda' | 'finance' | 'marketing' | 'privacy' | 'support';

function profileConfig(profile?: EmailProfile) {
  const prefix = profile ? `SMTP_${profile.toUpperCase()}_` : 'SMTP_';
  const fallback = (key: string) => process.env[`SMTP_${key}`]?.trim();
  return { host: process.env[`${prefix}HOST`]?.trim() || fallback('HOST'), user: process.env[`${prefix}USER`]?.trim() || fallback('USER'), password: process.env[`${prefix}PASSWORD`]?.trim() || fallback('PASSWORD'), from: process.env[`${prefix}FROM`]?.trim() || fallback('FROM'), port: process.env[`${prefix}PORT`]?.trim() || fallback('PORT'), secure: process.env[`${prefix}SECURE`]?.trim() || fallback('SECURE') };
}

function senderAddress(user?: string, configuredValue?: string) {
  const configured = configuredValue?.trim() || process.env.SMTP_FROM?.trim();
  if (configured?.includes('@')) return configured;
  const address = user || defaultSender();
  if (!configured) return address;
  const displayName = configured.replace(/["\r\n<>]/g, '').trim();
  return displayName ? `"${displayName}" <${address}>` : address;
}

function senderMailbox(user?: string, configured?: string) {
  const formatted = senderAddress(user, configured);
  const bracketed = formatted.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (bracketed?.[1]) return bracketed[1];
  return formatted.match(/[^\s<>]+@[^\s<>]+/)?.[0] || defaultSender();
}

export function emailDeliveryConfiguration() {
  const smtp = Boolean(process.env.SMTP_HOST?.trim());
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  return {
    transport: smtp ? ('smtp' as const) : ('sendmail' as const),
    sender: senderAddress(user),
    smtpHostConfigured: smtp,
    smtpAuthenticationConfigured: Boolean(user && password),
    ready: smtp ? Boolean(user && password) : process.platform !== 'win32',
  };
}

export async function sendLocalEmail(input: {
  to: string;
  profile?: EmailProfile;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
    contentDisposition?: 'attachment' | 'inline';
    encoding?: 'base64';
  }>;
}) {
  const config = profileConfig(input.profile);
  const host = config.host;
  const user = config.user;
  const pass = config.password;
  const from = senderAddress(user, config.from);
  const mailbox = senderMailbox(user, config.from);
  const transports: Array<{ name: string; client: Transporter }> = [];
  if (host) {
    transports.push({
      name: 'smtp',
      client: nodemailer.createTransport({
        host,
        port: Number(config.port || 465),
        secure: config.secure !== 'false',
        auth: user && pass ? { user, pass } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    });
  }
  // Shared cPanel installations normally expose a local sendmail binary.
  // Keep it as a delivery fallback when SMTP is configured but unavailable;
  // a stale SMTP password or certificate must not disable every transactional
  // email from the portal, agenda, packs and vouchers.
  if (!host || process.platform !== 'win32') {
    transports.push({
      name: 'sendmail',
      client: nodemailer.createTransport({
        sendmail: true,
        newline: 'unix',
        path: process.env.SENDMAIL_PATH || '/usr/sbin/sendmail',
      }),
    });
  }

  const errors: string[] = [];
  for (const transport of transports) {
    try {
      const result = await transport.client.sendMail({
        from,
        replyTo: mailbox,
        envelope: {
          from: mailbox,
          to: input.to,
        },
        ...input,
      });
      if (transport.name === 'smtp') {
        const accepted = Array.isArray(result.accepted) ? result.accepted : [];
        const rejected = Array.isArray(result.rejected) ? result.rejected : [];
        if (!accepted.length || rejected.length) {
          throw new Error(
            `SMTP did not accept every recipient (accepted: ${accepted.length}, rejected: ${rejected.length}).`
          );
        }
      }
      console.info(
        `[email] delivered using ${transport.name}:`,
        result.messageId
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${transport.name}: ${message}`);
      console.warn(`[email] ${transport.name} delivery failed:`, message);
    }
  }

  throw new Error(`Email delivery failed (${errors.join('; ')}).`);
}
