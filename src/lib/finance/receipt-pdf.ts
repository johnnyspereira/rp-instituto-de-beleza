import {
  drawBrandMark,
  drawPageFooter,
  imageUrlToPng,
  PDF_COLORS,
} from '@/lib/finance/pdf-design';

type ReceiptItem = {
  name: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
  taxRate?: number;
  taxAmount?: number;
  total: number;
};

type ReceiptPayment = {
  method: string;
  amount: number;
  paidAt: string;
  status?: string;
  reference?: string | null;
};

export type ReceiptDocument = {
  saleNumber: number;
  createdAt: string;
  completedAt?: string | null;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  business: {
    name: string;
    logoUrl?: string | null;
    publicUrl?: string | null;
  };
  client: {
    name?: string | null;
    email?: string | null;
    taxId?: string | null;
    reference?: string | null;
  };
  items: ReceiptItem[];
  payments: ReceiptPayment[];
};

const METHODS: Record<string, string> = {
  cash: 'Dinheiro',
  card: 'Cartão',
  mb_way: 'MB Way',
  multibanco: 'Multibanco',
  bank_transfer: 'Transferência bancária',
  voucher: 'Voucher',
  client_credit: 'Cartão-saldo',
  other: 'Outro',
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(Number(value || 0));
}

function date(value: string) {
  return new Date(value).toLocaleString('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export async function downloadReceiptPdf(receipt: ReceiptDocument) {
  const [{ jsPDF }, logo] = await Promise.all([
    import('jspdf'),
    imageUrlToPng(receipt.business.logoUrl),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 18;
  const right = pageWidth - 18;
  const contentWidth = right - left;
  const isPaid = receipt.balanceDue <= 0;
  const activePayments = receipt.payments.filter(
    (payment) => payment.status !== 'voided'
  );

  const drawHeader = (continuation = false) => {
    doc.setFillColor(PDF_COLORS.navy);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setFillColor(PDF_COLORS.accent);
    doc.rect(0, 0, 5, 40, 'F');
    doc.setFillColor('#202a42');
    doc.circle(pageWidth - 10, -2, 31, 'F');
    doc.setFillColor(PDF_COLORS.accentDark);
    doc.circle(pageWidth + 5, 13, 18, 'F');

    drawBrandMark(doc, {
      name: receipt.business.name,
      logo,
      x: left,
      y: 10,
      size: 20,
      dark: true,
    });
    doc.setTextColor(PDF_COLORS.paper);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(receipt.business.name || 'Recibo', left + 26, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('DOCUMENTO DE PAGAMENTO', left + 26, 24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(continuation ? 10 : 16);
    doc.text(
      continuation ? `RECIBO #${receipt.saleNumber} · CONTINUAÇÃO` : 'RECIBO',
      right,
      17,
      { align: 'right' }
    );
    if (!continuation) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`#${receipt.saleNumber}`, right, 24, { align: 'right' });
    }
  };

  const drawTableHeader = (y: number) => {
    doc.setFillColor(PDF_COLORS.navy);
    doc.roundedRect(left, y - 7, contentWidth, 10, 2, 2, 'F');
    doc.setTextColor(PDF_COLORS.paper);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('DESCRIÇÃO', left + 4, y);
    doc.text('QTD.', 116, y, { align: 'right' });
    doc.text('IVA', 139, y, { align: 'right' });
    doc.text('TOTAL', right - 4, y, { align: 'right' });
  };

  drawHeader();

  doc.setFillColor(PDF_COLORS.canvas);
  doc.roundedRect(left, 48, 108, 28, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.accent);
  doc.setFontSize(7);
  doc.text('EMITIDO PARA', left + 6, 56);
  doc.setTextColor(PDF_COLORS.ink);
  doc.setFontSize(11);
  doc.text(receipt.client.name || 'Consumidor final', left + 6, 64);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.muted);
  doc.setFontSize(7.5);
  const clientMeta = [
    receipt.client.taxId ? `NIF ${receipt.client.taxId}` : null,
    receipt.client.email,
    receipt.client.reference ? `Ref. ${receipt.client.reference}` : null,
  ]
    .filter(Boolean)
    .join('  •  ');
  doc.text(
    doc.splitTextToSize(clientMeta || 'Sem dados adicionais', 96),
    left + 6,
    70
  );

  const statusX = 132;
  const statusWidth = right - statusX;
  doc.setFillColor(isPaid ? PDF_COLORS.successSoft : PDF_COLORS.warningSoft);
  doc.roundedRect(statusX, 48, statusWidth, 28, 3, 3, 'F');
  doc.setTextColor(isPaid ? PDF_COLORS.success : PDF_COLORS.warning);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(isPaid ? 'PAGAMENTO CONCLUÍDO' : 'SALDO PENDENTE', statusX + 6, 56);
  doc.setFontSize(15);
  doc.text(
    money(isPaid ? receipt.paidAmount : receipt.balanceDue, receipt.currency),
    statusX + 6,
    66
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(date(receipt.completedAt || receipt.createdAt), statusX + 6, 72);

  let y = 89;
  drawTableHeader(y);
  y += 10;
  doc.setTextColor(PDF_COLORS.ink);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  for (const item of receipt.items) {
    const lines = doc.splitTextToSize(item.name, 78) as string[];
    const rowHeight = Math.max(10, lines.length * 4.1 + 4);
    if (y + rowHeight > 258) {
      doc.addPage();
      drawHeader(true);
      y = 55;
      drawTableHeader(y);
      y += 10;
      doc.setTextColor(PDF_COLORS.ink);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
    }

    doc.text(lines, left + 4, y);
    doc.text(String(item.quantity), 116, y, { align: 'right' });
    doc.text(`${Number(item.taxRate || 0).toLocaleString('pt-PT')}%`, 139, y, {
      align: 'right',
    });
    doc.setFont('helvetica', 'bold');
    doc.text(money(item.total, receipt.currency), right - 4, y, {
      align: 'right',
    });
    doc.setFont('helvetica', 'normal');
    y += rowHeight;
    doc.setDrawColor(PDF_COLORS.line);
    doc.line(left + 3, y - 4, right - 3, y - 4);
  }

  if (y > 205) {
    doc.addPage();
    drawHeader(true);
    y = 54;
  }

  y += 3;
  const totalsX = 126;
  doc.setFillColor(PDF_COLORS.canvas);
  doc.roundedRect(
    totalsX,
    y - 5,
    right - totalsX,
    receipt.balanceDue > 0 ? 48 : 41,
    3,
    3,
    'F'
  );
  y += 3;
  const totalRow = (
    label: string,
    value: number,
    emphasis: 'normal' | 'strong' | 'accent' = 'normal'
  ) => {
    doc.setFont('helvetica', emphasis === 'normal' ? 'normal' : 'bold');
    doc.setFontSize(emphasis === 'accent' ? 10 : 8);
    doc.setTextColor(
      emphasis === 'accent' ? PDF_COLORS.accentDark : PDF_COLORS.ink
    );
    doc.text(label, totalsX + 6, y);
    doc.text(money(value, receipt.currency), right - 6, y, { align: 'right' });
    y += emphasis === 'accent' ? 9 : 7;
  };
  totalRow('Subtotal', receipt.subtotal);
  if (receipt.discountAmount > 0)
    totalRow('Descontos', -receipt.discountAmount);
  totalRow('IVA incluído', receipt.taxAmount);
  totalRow('Total', receipt.totalAmount, 'accent');
  totalRow('Pago', receipt.paidAmount, 'strong');
  if (receipt.balanceDue > 0)
    totalRow('Pendente', receipt.balanceDue, 'strong');

  y += 6;
  if (activePayments.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(PDF_COLORS.navy);
    doc.text('HISTÓRICO DE PAGAMENTOS', left, y);
    y += 7;

    for (const payment of activePayments) {
      if (y > 258) {
        doc.addPage();
        drawHeader(true);
        y = 54;
      }
      doc.setFillColor(PDF_COLORS.canvas);
      doc.roundedRect(left, y - 5, contentWidth, 10, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(PDF_COLORS.ink);
      doc.text(METHODS[payment.method] || payment.method, left + 4, y + 1);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(PDF_COLORS.muted);
      doc.text(
        [date(payment.paidAt), payment.reference].filter(Boolean).join('  •  '),
        left + 45,
        y + 1
      );
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(PDF_COLORS.ink);
      doc.text(money(payment.amount, receipt.currency), right - 4, y + 1, {
        align: 'right',
      });
      y += 13;
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawPageFooter(doc, {
      left,
      right,
      page,
      totalPages,
      note: 'Comprovativo emitido pelo CRM. Não substitui uma fatura fiscal.',
      url: receipt.business.publicUrl,
    });
  }

  doc.setProperties({
    title: `Recibo #${receipt.saleNumber}`,
    subject: 'Comprovativo de pagamento',
    author: receipt.business.name,
    creator: receipt.business.name,
  });
  doc.save(`recibo-${receipt.saleNumber}.pdf`);
}
