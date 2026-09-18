import { createHash } from 'node:crypto';

/** Stable database key for a provider message inside one conversation. */
export function messageDedupeKey(
  conversationId: string,
  providerMessageId: string | null | undefined
): string | null {
  const externalId = providerMessageId?.trim();
  if (!conversationId || !externalId) return null;
  return createHash('sha256')
    .update(`${conversationId}:${externalId}`)
    .digest('hex');
}
