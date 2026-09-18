import { drawBrandMark, imageUrlToPng } from '@/lib/finance/pdf-design';
import type { FinanceVoucher } from '@/types';

type VoucherBrand = {
  name: string;
  logoUrl?: string | null;
  publicUrl?: string | null;
};

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function formatAmount(value: number, currency: string) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(value);
}

function validationUrl(voucher: FinanceVoucher) {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : undefined;
  return `${origin || ''}/voucher/${encodeURIComponent(voucher.id)}?pin=${encodeURIComponent(voucher.pin_code || '')}`;
}

export async function downloadVoucherPdf(
  voucher: FinanceVoucher,
  brand: VoucherBrand
) {
  const [{ jsPDF }, QRCode, logo] = await Promise.all([
    import('jspdf'),
    import('qrcode'),
    imageUrlToPng(brand.logoUrl),
  ]);
  const document = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a5',
  });

  const width = document.internal.pageSize.getWidth();
  const height = document.internal.pageSize.getHeight();
  const ink = '#292524';
  const rose = '#e11d48';
  const blush = '#fff1f2';
  const cream = '#faf7f2';
  const gold = '#c49a4a';
  const muted = '#78716c';
  const recipient =
    voucher.recipient_name || voucher.owner?.name || 'Alguém especial';
  const validity = voucher.expires_at
    ? new Date(voucher.expires_at).toLocaleDateString('pt-PT')
    : 'Sem data limite';
  const isService = voucher.voucher_type === 'service';
  const headline = isService
    ? voucher.service?.name || 'Uma experiência especial'
    : formatAmount(Number(voucher.initial_balance), voucher.currency);
  const qrCode = await QRCode.toDataURL(validationUrl(voucher), {
    width: 600,
    margin: 2,
    color: { dark: ink, light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  // Warm paper and restrained ornamental frame: the original light voucher,
  // refined rather than replaced by a dark "luxury card".
  document.setFillColor(cream);
  document.rect(0, 0, width, height, 'F');
  document.setFillColor('#ffffff');
  document.roundedRect(8, 8, width - 16, height - 16, 5, 5, 'F');
  document.setDrawColor('#eadfd5');
  document.setLineWidth(0.35);
  document.roundedRect(8, 8, width - 16, height - 16, 5, 5, 'S');
  document.setDrawColor(gold);
  document.setLineWidth(0.55);
  document.line(15, 13, width - 15, 13);
  document.setFillColor(rose);
  document.roundedRect(8, 8, 5, height - 16, 2.5, 2.5, 'F');

  document.setFillColor(blush);
  document.circle(width - 5, 3, 44, 'F');
  document.setDrawColor('#f8d6dc');
  for (let radius = 21; radius <= 43; radius += 7) {
    document.circle(width - 5, 3, radius, 'S');
  }

  drawBrandMark(document, {
    name: brand.name,
    logo,
    x: 22,
    y: 20,
    size: 17,
    dark: false,
  });
  document.setTextColor(ink);
  document.setFont('helvetica', 'bold');
  document.setFontSize(12);
  document.text(brand.name || 'Vale-presente', 45, 26);
  document.setFont('helvetica', 'normal');
  document.setTextColor(muted);
  document.setFontSize(7);
  document.text('UMA EXPERIÊNCIA PARA OFERECER', 45, 32);

  document.setFillColor('#ffffff');
  document.setDrawColor('#eadfd5');
  document.roundedRect(width - 65, 20, 45, 51, 4, 4, 'FD');
  document.addImage(qrCode, 'PNG', width - 57.5, 25, 30, 30);
  document.setFont('helvetica', 'bold');
  document.setFontSize(6.2);
  document.setTextColor(ink);
  document.text('CONSULTAR O VOUCHER', width - 42.5, 63, {
    align: 'center',
  });

  document.setFillColor(blush);
  document.roundedRect(22, 46, isService ? 41 : 37, 8, 4, 4, 'F');
  document.setFont('helvetica', 'bold');
  document.setFontSize(6.5);
  document.setTextColor(rose);
  document.text(isService ? 'VOUCHER DE SERVIÇO' : 'CARTÃO-PRESENTE', 27, 51.3);

  document.setTextColor(ink);
  document.setFontSize(isService ? 20 : 29);
  const headlineLines = document.splitTextToSize(headline, 104) as string[];
  document.text(headlineLines.slice(0, 2), 22, 67);

  const recipientY = isService && headlineLines.length > 1 ? 86 : 80;
  document.setFont('helvetica', 'normal');
  document.setFontSize(7);
  document.setTextColor(muted);
  document.text('PREPARADO ESPECIALMENTE PARA', 22, recipientY);
  document.setFont('helvetica', 'bold');
  document.setFontSize(15);
  document.setTextColor(ink);
  document.text(
    (document.splitTextToSize(recipient, 102) as string[]).slice(0, 1),
    22,
    recipientY + 8
  );

  if (voucher.message) {
    document.setDrawColor(gold);
    document.setLineWidth(0.5);
    document.line(22, recipientY + 14, 22, recipientY + 27);
    document.setFont('helvetica', 'italic');
    document.setFontSize(8);
    document.setTextColor(muted);
    const lines = document.splitTextToSize(
      `“${voucher.message}”`,
      98
    ) as string[];
    document.text(lines.slice(0, 2), 27, recipientY + 19);
  }

  const detailY = height - 31;
  document.setFillColor('#f7f3ee');
  document.roundedRect(19, detailY, width - 38, 18, 3, 3, 'F');
  const details = [
    { label: 'CÓDIGO', value: voucher.code, x: 25 },
    { label: 'PIN', value: voucher.pin_code || '—', x: 69 },
    { label: 'VALIDADE', value: validity, x: 94 },
    { label: 'COMO UTILIZAR', value: 'Apresente o voucher', x: 137 },
  ];
  for (const detail of details) {
    document.setFont('helvetica', 'bold');
    document.setFontSize(5.8);
    document.setTextColor(rose);
    document.text(detail.label, detail.x, detailY + 6);
    document.setFontSize(8.3);
    document.setTextColor(ink);
    document.text(detail.value, detail.x, detailY + 13);
  }

  document.setFont('helvetica', 'normal');
  document.setFontSize(6);
  document.setTextColor('#a8a29e');
  document.text(
    [brand.publicUrl, 'Autenticável por QR Code', `Ref. ${voucher.code}`]
      .filter(Boolean)
      .join('   •   '),
    width / 2,
    height - 4.5,
    { align: 'center' }
  );

  document.setProperties({
    title: `Voucher ${voucher.code}`,
    subject: isService ? 'Voucher de serviço' : 'Cartão-presente',
    author: brand.name,
    creator: brand.name,
  });
  document.save(
    `${safeFilePart(`voucher-${recipient}-${voucher.code}`) || 'voucher'}.pdf`
  );
}
