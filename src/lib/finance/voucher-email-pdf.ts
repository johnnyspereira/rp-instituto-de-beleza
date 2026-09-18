import 'server-only';

import { drawBrandMark, imageUrlToPng } from '@/lib/finance/pdf-design';

export async function createVoucherEmailPdf(input: {
  businessName: string;
  logoUrl?: string | null;
  voucherUrl: string;
  code: string;
  pin: string;
  benefit: string;
  recipientName: string;
  expiresAt?: string | null;
  message?: string | null;
}) {
  const [{ jsPDF }, QRCode, logo] = await Promise.all([
    import('jspdf'),
    import('qrcode'),
    imageUrlToPng(input.logoUrl),
  ]);
  const document = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a5',
  });
  const width = document.internal.pageSize.getWidth();
  const height = document.internal.pageSize.getHeight();
  const qr = await QRCode.toDataURL(input.voucherUrl, {
    width: 500,
    margin: 1,
    errorCorrectionLevel: 'H',
  });
  const validity = input.expiresAt
    ? new Date(input.expiresAt).toLocaleDateString('pt-PT')
    : 'Sem data limite';

  document.setFillColor('#f4f8f5');
  document.rect(0, 0, width, height, 'F');
  document.setFillColor('#ffffff');
  document.roundedRect(8, 8, width - 16, height - 16, 6, 6, 'F');
  document.setFillColor('#102f21');
  document.roundedRect(8, 8, width - 16, 28, 6, 6, 'F');
  document.rect(8, 27, width - 16, 9, 'F');
  drawBrandMark(document, {
    name: input.businessName,
    logo,
    x: 18,
    y: 14,
    size: 16,
    dark: true,
  });
  document.setTextColor('#ffffff');
  document.setFont('helvetica', 'bold');
  document.setFontSize(14);
  document.text(input.businessName, 39, 23);
  document.setFontSize(7);
  document.text('VOUCHER DIGITAL', width - 20, 23, { align: 'right' });

  document.setTextColor('#102f21');
  document.setFontSize(8);
  document.text('PREPARADO PARA', 20, 50);
  document.setFontSize(18);
  document.text(input.recipientName || 'Cliente', 20, 61);
  document.setFontSize(8);
  document.setTextColor('#607268');
  document.text('BENEFÍCIO', 20, 73);
  document.setFont('helvetica', 'bold');
  document.setFontSize(16);
  document.setTextColor('#0b7468');
  document.text(
    (document.splitTextToSize(input.benefit, 100) as string[]).slice(0, 2),
    20,
    83
  );

  if (input.message) {
    document.setFont('helvetica', 'italic');
    document.setFontSize(8);
    document.setTextColor('#607268');
    document.text(
      (document.splitTextToSize(`“${input.message}”`, 105) as string[]).slice(
        0,
        2
      ),
      20,
      101
    );
  }

  document.setFillColor('#eef8f5');
  document.roundedRect(width - 65, 43, 47, 65, 4, 4, 'F');
  document.addImage(qr, 'PNG', width - 57.5, 49, 32, 32);
  document.setFont('helvetica', 'bold');
  document.setFontSize(7);
  document.setTextColor('#102f21');
  document.text(`CÓDIGO  ${input.code}`, width - 41.5, 89, { align: 'center' });
  document.text(`PIN  ${input.pin || '—'}`, width - 41.5, 96, {
    align: 'center',
  });
  document.setFont('helvetica', 'normal');
  document.setTextColor('#607268');
  document.text(`Validade: ${validity}`, width - 41.5, 103, {
    align: 'center',
  });

  document.setDrawColor('#d8e4dd');
  document.line(20, height - 20, width - 20, height - 20);
  document.setFontSize(7);
  document.text(
    'Apresente este PDF ou o QR Code no momento da utilização.',
    20,
    height - 12
  );
  document.text(`Ref. ${input.code}`, width - 20, height - 12, {
    align: 'right',
  });
  document.setProperties({
    title: `Voucher ${input.code}`,
    subject: input.benefit,
    author: input.businessName,
    creator: input.businessName,
  });
  return Buffer.from(document.output('arraybuffer'));
}
