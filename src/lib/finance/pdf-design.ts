import type { jsPDF } from 'jspdf';

export const PDF_COLORS = {
  ink: '#111827',
  navy: '#172033',
  accent: '#f43f5e',
  accentDark: '#be123c',
  blush: '#fff1f2',
  paper: '#ffffff',
  canvas: '#f8fafc',
  line: '#e5e7eb',
  muted: '#64748b',
  success: '#059669',
  successSoft: '#ecfdf5',
  warning: '#b45309',
  warningSoft: '#fffbeb',
} as const;

export async function imageUrlToPng(url?: string | null) {
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = objectUrl;
      });
      const canvas = document.createElement('canvas');
      const size = 600;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) return null;

      context.clearRect(0, 0, size, size);
      const scale = Math.min(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(
        image,
        (size - width) / 2,
        (size - height) / 2,
        width,
        height
      );
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

export function brandInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'CRM'
  );
}

export function drawBrandMark(
  doc: jsPDF,
  options: {
    name: string;
    logo?: string | null;
    x: number;
    y: number;
    size: number;
    dark?: boolean;
  }
) {
  const { name, logo, x, y, size, dark = false } = options;

  if (logo) {
    doc.setFillColor(PDF_COLORS.paper);
    doc.roundedRect(x, y, size, size, size * 0.22, size * 0.22, 'F');
    doc.addImage(
      logo,
      'PNG',
      x + size * 0.12,
      y + size * 0.12,
      size * 0.76,
      size * 0.76
    );
    return;
  }

  doc.setFillColor(dark ? PDF_COLORS.accent : PDF_COLORS.navy);
  doc.roundedRect(x, y, size, size, size * 0.22, size * 0.22, 'F');
  doc.setTextColor(PDF_COLORS.paper);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size * 0.62);
  doc.text(brandInitials(name), x + size / 2, y + size * 0.64, {
    align: 'center',
  });
}

export function drawPageFooter(
  doc: jsPDF,
  options: {
    left: number;
    right: number;
    page: number;
    totalPages: number;
    note: string;
    url?: string | null;
  }
) {
  const { left, right, page, totalPages, note, url } = options;
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setDrawColor(PDF_COLORS.line);
  doc.line(left, pageHeight - 18, right, pageHeight - 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(PDF_COLORS.muted);
  doc.text(note, left, pageHeight - 11);
  doc.text(
    [url, `Página ${page} de ${totalPages}`].filter(Boolean).join('  •  '),
    right,
    pageHeight - 11,
    { align: 'right' }
  );
}
