import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from './proxy';

function request(path: string, authenticated = false) {
  const headers = authenticated
    ? { cookie: 'wacrm_session=test-session-token' }
    : undefined;
  return new NextRequest(`https://app.test${path}`, { headers });
}

describe('local auth proxy', () => {
  it('redirects an unauthenticated dashboard request to login', () => {
    const response = proxy(request('/dashboard'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.test/login');
  });

  it('allows an authenticated dashboard request', () => {
    const response = proxy(request('/dashboard', true));
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects an authenticated login request to dashboard', () => {
    const response = proxy(request('/login', true));
    expect(response.headers.get('location')).toBe('https://app.test/dashboard');
  });

  it('preserves an invitation target for an authenticated user', () => {
    const response = proxy(request('/login?invite=abc123', true));
    expect(response.headers.get('location')).toBe(
      'https://app.test/join/abc123'
    );
  });

  it('rejects protected WhatsApp APIs without a session cookie', async () => {
    const response = proxy(request('/api/whatsapp/send'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('lets the signed worker callback reach its own authentication handler', () => {
    const response = proxy(request('/api/whatsapp/bridge-v2'));
    expect(response.status).not.toBe(401);
  });
});
