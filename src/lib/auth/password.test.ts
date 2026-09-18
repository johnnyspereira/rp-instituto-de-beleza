import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password';

describe('local password hashing', () => {
  it('accepts the original password and rejects a different password', async () => {
    const hash = await hashPassword('a-secure-password');

    await expect(verifyPassword('a-secure-password', hash)).resolves.toBe(true);
    await expect(verifyPassword('a-different-password', hash)).resolves.toBe(
      false
    );
  });

  it('rejects malformed hashes', async () => {
    await expect(verifyPassword('a-secure-password', 'invalid')).resolves.toBe(
      false
    );
  });

  it('rejects passwords shorter than eight characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow(
      'Password must contain at least 8 characters.'
    );
  });
});

