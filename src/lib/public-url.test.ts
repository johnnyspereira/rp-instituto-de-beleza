import { afterEach, describe, expect, it } from 'vitest';

import { getPublicUrl } from './public-url';

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalCanonicalUrl = process.env.CANONICAL_APP_URL;
const originalAppUrl = process.env.APP_URL;
const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
  for (const [key, value] of [
    ['CANONICAL_APP_URL', originalCanonicalUrl],
    ['APP_URL', originalAppUrl],
    ['NEXT_PUBLIC_APP_URL', originalPublicAppUrl],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('getPublicUrl', () => {
  it('prefers the configured public site URL over the bind address', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://crm.example.com/';

    expect(getPublicUrl('/reset-password', 'http://0.0.0.0:3000')).toBe(
      'https://crm.example.com/reset-password'
    );
  });

  it('uses the browser origin when no public site URL is configured', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.CANONICAL_APP_URL;

    expect(getPublicUrl('/reset-password', 'http://localhost:3000')).toBe(
      'http://localhost:3000/reset-password'
    );
  });

  it('lets the canonical URL override stale public build variables', () => {
    process.env.CANONICAL_APP_URL = 'https://rp-instituto.example';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://suporte.exemplo.pt';

    expect(getPublicUrl('/portal', 'http://localhost:3000')).toBe(
      'https://rp-instituto.example/portal'
    );
  });

  it('never exposes the internal cPanel origin in anamnesis links', () => {
    process.env.CANONICAL_APP_URL = 'https://rp-instituto.example';

    expect(
      getPublicUrl(
        '/anamnese/d104d446-e08c-4920-9aab-2d6c8fe0c8e5',
        'https://cpanel173.dnscpanel.com:3000'
      )
    ).toBe(
      'https://rp-instituto.example/anamnese/d104d446-e08c-4920-9aab-2d6c8fe0c8e5'
    );
  });

  it('normalizes a configured domain without a protocol', () => {
    process.env.CANONICAL_APP_URL = 'rp-instituto.example/';

    expect(getPublicUrl('/portal', 'http://localhost:3000')).toBe(
      'https://rp-instituto.example/portal'
    );
  });

  it('falls back to the request origin when configuration is malformed', () => {
    process.env.CANONICAL_APP_URL = 'https://';

    expect(getPublicUrl('/portal', 'https://rp-instituto.example')).toBe(
      'https://rp-instituto.example/portal'
    );
  });
});
