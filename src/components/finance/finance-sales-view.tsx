'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BadgeCheck, ChevronRight, CircleDollarSign, Download, Mail, ReceiptText, RotateCcw, Search, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Empty, NativeSelect } from '@/components/finance/finance-ui';
import { downloadReceiptPdf } from '@/lib/finance/receipt-pdf';
import { money, PAYMENT_METHODS, SALE_STATUS } from '@/components/finance/finance-utils';
import type { FinanceSale } from '@/types';

export function SalesView({
  sales,
  currency,
  onPayment,
  onApprove,
  onResendVoucher,
  onRepairVoucherQuantity,
  onReverse,
  canOperate,
  canRefund,
  brand,
}: {
  sales: FinanceSale[];
  currency: string;
  onPayment: (sale: FinanceSale) => void;
  onApprove: (sale: FinanceSale) => void;
  onResendVoucher: (sale: FinanceSale) => void;
  onRepairVoucherQuantity: (sale: FinanceSale) => Promise<void>;
  onReverse: (sale: FinanceSale) => void;
  canOperate: boolean;
  canRefund: boolean;
  brand: { name: string; logoUrl?: string | null; publicUrl?: string | null };
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [saleToRepair, setSaleToRepair] = useState<FinanceSale | null>(null);
  const [repairing, setRepairing] = useState(false);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return sales.filter((sale) => {
      const matchesStatus =
        status === 'all' ||
        (status === 'historical'
          ? Boolean(sale.is_historical)
          : false) ||
        (status === 'active'
          ? !sale.is_historical && !['voided', 'refunded'].includes(sale.status)
          : sale.status === status);
      const haystack =
        `${sale.sale_number} ${sale.contact?.name ?? ''} ${sale.contact?.phone ?? ''} ${(sale.items ?? []).map((item) => item.name_snapshot).join(' ')}`.toLocaleLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [query, sales, status]);

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border grid gap-3 border-b p-4 lg:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar venda, cliente, telefone ou item..."
            className="pl-9"
          />
        </div>
        <NativeSelect value={status} onChange={setStatus}>
          <option value="active">Vendas operacionais</option>
          <option value="historical">Já faturadas / retroativas</option>
          <option value="all">Todos os estados</option>
          <option value="open">Pendentes</option>
          <option value="partially_paid">Parciais</option>
          <option value="paid">Pagas</option>
          <option value="voided">Anuladas</option>
          <option value="refunded">Reembolsadas</option>
        </NativeSelect>
      </div>
      <div className="border-border bg-muted/30 flex items-center justify-between border-b px-4 py-2 text-xs">
        <span className="text-muted-foreground">
          {filtered.length} registos encontrados
        </span>
        <p className="text-muted-foreground">
          Pagamentos e alterações permanecem ligados à venda original.
        </p>
      </div>
      <div className="divide-border divide-y">
        {filtered.length === 0 ? (
          <Empty icon={ReceiptText} text="Ainda não existem vendas." />
        ) : (
          filtered.map((sale) => (
            <details
              key={sale.id}
              id={`sale-${sale.id}`}
              className="group target:bg-primary/5 target:ring-primary/30 scroll-mt-24 target:ring-2"
            >
              <summary className="grid cursor-pointer list-none items-center gap-3 p-4 md:grid-cols-[90px_1fr_130px_130px_auto]">
                <div>
                  <p className="font-mono text-xs">#{sale.sale_number}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {new Date(sale.created_at).toLocaleDateString('pt-PT')}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {sale.contact?.name ||
                      sale.contact?.phone ||
                      'Consumidor final'}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {sale.items?.map((item) => item.name_snapshot).join(', ') ||
                      'Venda'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total</p>
                  <p className="font-medium">
                    {money(
                      Number(sale.total_amount),
                      sale.currency || currency
                    )}
                  </p>
                </div>
                <div>
                  <Badge
                    variant={sale.status === 'paid' ? 'default' : 'secondary'}
                  >
                    {SALE_STATUS[sale.status] ?? sale.status}
                  </Badge>
                  {sale.is_historical ? (
                    <Badge variant="outline" className="mt-1 border-amber-400 text-amber-700">
                      Já faturada
                    </Badge>
                  ) : null}
                  {Number(sale.balance_due) > 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Falta{' '}
                      {money(
                        Number(sale.balance_due),
                        sale.currency || currency
                      )}
                    </p>
                  )}
                </div>
                <ChevronRight className="text-muted-foreground size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-border bg-muted/20 border-t px-4 py-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase">
                      Itens
                    </p>
                    <div className="space-y-1.5">
                      {(sale.items ?? []).map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between gap-3 text-sm"
                        >
                          <span>
                            {item.quantity}× {item.name_snapshot}
                          </span>
                          <span className="shrink-0 font-medium">
                            {money(Number(item.line_total), sale.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase">
                      Pagamentos
                    </p>
                    <div className="space-y-1.5">
                      {(sale.payments ?? []).length ? (
                        sale.payments?.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span>
                              {PAYMENT_METHODS.find(
                                (method) => method.value === payment.method
                              )?.label ?? payment.method}{' '}
                              <span className="text-muted-foreground text-xs">
                                · {payment.status}
                              </span>
                            </span>
                            <strong>
                              {money(Number(payment.amount), sale.currency)}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          Nenhum pagamento confirmado.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex min-w-40 flex-col gap-2">
                    {(sale.payments ?? []).length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void downloadSaleReceipt(sale, brand)}
                      >
                        <Download /> Recibo PDF
                      </Button>
                    ) : null}
                    {Number(sale.balance_due) > 0 &&
                    !['voided', 'refunded'].includes(sale.status) ? (
                      <Button
                        size="sm"
                        disabled={!canOperate}
                        onClick={() => onPayment(sale)}
                      >
                        <CircleDollarSign /> Receber saldo
                      </Button>
                    ) : null}
                    {sale.status === 'paid' &&
                    sale.items?.some((item) => item.item_type === 'voucher') ? (
                      <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canOperate || !sale.contact?.email}
                        title={
                          sale.contact?.email
                            ? 'Reenvia o voucher e o PDF para o email do cliente'
                            : 'O cliente não possui email na ficha'
                        }
                        onClick={() => onResendVoucher(sale)}
                      >
                        <Mail /> Reenviar voucher
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canOperate}
                        title="Cria apenas os vouchers em falta nesta venda"
                        onClick={() => setSaleToRepair(sale)}
                      >
                        <Wrench /> Corrigir quantidade
                      </Button>
                      </div>
                    ) : null}
                    {sale.status !== 'paid' &&
                    Number(sale.total_amount) === 0 &&
                    Number(sale.balance_due) === 0 ? (
                      <Button
                        size="sm"
                        disabled={!canOperate}
                        onClick={() => onApprove(sale)}
                      >
                        <BadgeCheck /> Aprovar e emitir
                      </Button>
                    ) : null}
                    {!['voided', 'refunded'].includes(sale.status) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          !canOperate ||
                          (Number(sale.paid_amount) > 0 && !canRefund)
                        }
                        onClick={() => onReverse(sale)}
                      >
                        <RotateCcw />
                        {Number(sale.paid_amount) > 0 ? 'Reembolsar' : 'Anular'}
                      </Button>
                    ) : null}
                    {sale.contact?.id ? (
                      <Link
                        href={`/contacts/${sale.contact.id}`}
                        className="hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium"
                      >
                        Abrir Cliente 360 <ChevronRight className="size-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
                {sale.notes || sale.void_reason || sale.refund_reason ? (
                  <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
                    {sale.refund_reason || sale.void_reason || sale.notes}
                  </p>
                ) : null}
              </div>
            </details>
          ))
        )}
      </div>
      <Dialog
        open={Boolean(saleToRepair)}
        onOpenChange={(open) => {
          if (!open && !repairing) setSaleToRepair(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corrigir quantidade de vouchers</DialogTitle>
            <DialogDescription>
              {saleToRepair
                ? `Venda #${saleToRepair.sale_number} · ${saleToRepair.contact?.name || saleToRepair.contact?.phone || 'Consumidor final'}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-md p-3 text-sm">
            O CRM compara os vouchers emitidos com as quantidades da venda e
            cria somente os que faltarem. A venda, o pagamento e os vouchers
            existentes permanecem intactos.
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={repairing}
              onClick={() => setSaleToRepair(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={!saleToRepair || repairing}
              onClick={async () => {
                if (!saleToRepair) return;
                setRepairing(true);
                try {
                  await onRepairVoucherQuantity(saleToRepair);
                  setSaleToRepair(null);
                } finally {
                  setRepairing(false);
                }
              }}
            >
              <Wrench /> {repairing ? 'A corrigir...' : 'Corrigir agora'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

async function downloadSaleReceipt(
  sale: FinanceSale,
  brand: { name: string; logoUrl?: string | null; publicUrl?: string | null }
) {
  await downloadReceiptPdf({
    saleNumber: sale.sale_number,
    createdAt: sale.created_at,
    completedAt: sale.completed_at,
    currency: sale.currency,
    subtotal: Number(sale.subtotal),
    discountAmount: Number(sale.discount_amount),
    taxAmount: Number(sale.tax_amount),
    totalAmount: Number(sale.total_amount),
    paidAmount: Number(sale.paid_amount),
    balanceDue: Number(sale.balance_due),
    business: brand,
    client: {
      name: sale.contact?.name,
      email: sale.contact?.email,
      taxId: sale.contact?.tax_id,
      reference: sale.contact?.client_reference,
    },
    items: (sale.items ?? []).map((item) => ({
      name: item.name_snapshot,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      discount: Number(item.discount_amount),
      taxRate: Number(item.tax_rate),
      taxAmount: Number(item.tax_amount),
      total: Number(item.line_total),
    })),
    payments: (sale.payments ?? []).map((payment) => ({
      method: payment.method,
      amount: Number(payment.amount),
      paidAt: payment.paid_at,
      status: payment.status,
      reference: payment.reference_code,
    })),
  });
}
