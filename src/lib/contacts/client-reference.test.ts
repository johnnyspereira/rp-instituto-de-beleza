import { describe, expect, it } from 'vitest';

import { nextNumericClientReference } from './client-reference';

describe('nextNumericClientReference', () => {
  it('continues after the greatest historical numeric reference', () => {
    expect(nextNumericClientReference(['1', '639', '42'])).toBe('640');
  });

  it('ignores empty and non-numeric legacy references', () => {
    expect(nextNumericClientReference([null, '', 'JP-12', ' 9 '])).toBe('10');
  });
});
