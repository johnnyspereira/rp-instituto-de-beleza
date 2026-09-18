import { describe, expect, it } from 'vitest';

import { parseBodyPainAnswer, serializeBodyPainAnswer } from './body-pain-map';

describe('body pain map answer', () => {
  it('serializes selected regions as readable clinical text', () => {
    const value = serializeBodyPainAnswer(
      ['front-neck', 'back-lumbar'],
      'Dor 7/10 há três dias.'
    );

    expect(value).toContain('Pescoço');
    expect(value).toContain('Lombar');
    expect(value).toContain('Dor 7/10 há três dias.');
    expect(parseBodyPainAnswer(value)).toEqual({
      zones: ['front-neck', 'back-lumbar'],
      notes: 'Dor 7/10 há três dias.',
    });
  });

  it('keeps an old free-text answer as notes', () => {
    expect(parseBodyPainAnswer('Dor forte ao rodar o pescoço.')).toEqual({
      zones: [],
      notes: 'Dor forte ao rodar o pescoço.',
    });
  });

  it('recognizes a legacy answer containing only a known body region', () => {
    expect(parseBodyPainAnswer('Pescoço')).toEqual({
      zones: ['front-neck'],
      notes: '',
    });
  });
});
