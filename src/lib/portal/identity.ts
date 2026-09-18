import { createHash } from 'node:crypto';

export function portalAuthEmail(accountId: string, contactId: string) {
  const identity = createHash('sha256')
    .update(`${accountId}:${contactId}`)
    .digest('hex')
    .slice(0, 40);
  // This address is an internal Auth identifier only. It is confirmed by the
  // server and never used as the recipient or sender of client email.
  return `portal-${identity}@rp-instituto.example`;
}
