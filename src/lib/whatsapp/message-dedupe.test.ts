import { describe, expect, it } from 'vitest';

import { messageDedupeKey } from './message-dedupe';

describe('messageDedupeKey', () => {
  it('is stable for a repeated provider event', () => {
    expect(messageDedupeKey('conversation-1', 'wamid.1')).toBe(
      messageDedupeKey('conversation-1', 'wamid.1')
    );
  });

  it('allows the same provider id in different conversations', () => {
    expect(messageDedupeKey('conversation-1', 'wamid.1')).not.toBe(
      messageDedupeKey('conversation-2', 'wamid.1')
    );
  });

  it('does not create a key without a provider id', () => {
    expect(messageDedupeKey('conversation-1', null)).toBeNull();
  });
});
