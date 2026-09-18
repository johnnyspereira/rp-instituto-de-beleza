import { describe, expect, it } from 'vitest';

import { portalAuthEmail } from './identity';

describe('portalAuthEmail', () => {
  it('creates a stable, valid and non-identifying internal mailbox', () => {
    const email = portalAuthEmail('account-1', 'contact-1');

    expect(email).toMatch(/^portal-[a-f0-9]{40}@rp-instituto\.pt$/);
    expect(portalAuthEmail('account-1', 'contact-1')).toBe(email);
    expect(email).not.toContain('account-1');
    expect(email).not.toContain('contact-1');
  });

  it('keeps different contacts isolated', () => {
    expect(portalAuthEmail('account-1', 'contact-1')).not.toBe(
      portalAuthEmail('account-1', 'contact-2')
    );
  });
});
