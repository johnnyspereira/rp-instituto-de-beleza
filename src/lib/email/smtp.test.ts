import { afterEach, describe, expect, it } from 'vitest';

import { emailDeliveryConfiguration } from './smtp';

const original = {
  appUrl: process.env.APP_URL,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  smtpFrom: process.env.SMTP_FROM,
  smtpHost: process.env.SMTP_HOST,
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    APP_URL: original.appUrl,
    NEXT_PUBLIC_SITE_URL: original.siteUrl,
    SMTP_FROM: original.smtpFrom,
    SMTP_HOST: original.smtpHost,
    SMTP_USER: original.smtpUser,
    SMTP_PASSWORD: original.smtpPassword,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('email delivery configuration', () => {
  it('uses the RP Instituto de Beleza mailbox with NEXT_PUBLIC_SITE_URL', () => {
    delete process.env.APP_URL;
    delete process.env.SMTP_FROM;
    delete process.env.SMTP_HOST;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://rp-instituto.example';

    expect(emailDeliveryConfiguration()).toMatchObject({
      transport: 'sendmail',
      sender: 'geral@rp-instituto.example',
    });
  });

  it('reports incomplete authenticated SMTP credentials', () => {
    process.env.SMTP_HOST = 'mail.rp-instituto.example';
    process.env.SMTP_USER = 'geral@rp-instituto.example';
    delete process.env.SMTP_PASSWORD;

    expect(emailDeliveryConfiguration()).toMatchObject({
      transport: 'smtp',
      smtpAuthenticationConfigured: false,
      ready: false,
    });
  });
});
