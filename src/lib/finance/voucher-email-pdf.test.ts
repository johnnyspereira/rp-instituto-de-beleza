import { describe, expect, it } from 'vitest';

import { createVoucherEmailPdf } from './voucher-email-pdf';

describe('createVoucherEmailPdf', () => {
  it('creates a non-empty PDF attachment', async () => {
    const pdf = await createVoucherEmailPdf({
      businessName: 'RP Instituto de Beleza',
      voucherUrl: 'https://rp-instituto.example/voucher/example?pin=1234',
      code: 'VCH-TESTE',
      pin: '1234',
      benefit: 'Massagem Relaxante',
      recipientName: 'Maria',
      expiresAt: '2027-09-01T00:00:00.000Z',
      message: 'Um presente especial para si.',
    });

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});
