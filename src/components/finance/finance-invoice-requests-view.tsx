'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CircleDollarSign, ExternalLink, FileCheck2, FileClock, Loader2, ReceiptText, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Empty, Field, NativeSelect } from '@/components/finance/finance-ui';
import { invoiceRequestStatus, money } from '@/components/finance/finance-utils';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import type { FinanceInvoiceRequest } from '@/types';

export function InvoiceRequestsView({
  requests,
  canManage,
  onRefresh,
}: {
  requests: FinanceInvoiceRequest[];
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const db = useMemo(() => createClient(), []);
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [selected, setSelected] = useState<FinanceInvoiceRequest | null>(null);
  const [mode, setMode] = useState<'issue' | 'reject'>('issue');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [issuingFiscalId, setIssuingFiscalId] = useState<string | null>(null);
  const filtered = requests.filter((item) => {
    const term = query.trim().toLowerCase();
    const matchesStatus =
      status === 'all' ||
      (status === 'active'
        ? ['pending', 'processing'].includes(item.status)
        : item.status === status);
    const sale = item.sale;
    const haystack =
      `${item.fiscal_name} ${item.tax_id} ${item.email} ${sale?.sale_number ?? ''}`.toLowerCase();
    return matchesStatus && (!term || haystack.includes(term));
  });

  async function updateStatus(
    item: FinanceInvoiceRequest,
    next: 'processing' | 'cancelled'
  ) {
    if (!canManage) return;
    const now = new Date().toISOString();
    const { error } = await db
      .from('finance_invoice_requests')
      .update({
        status: next,
        handled_by_user_id: user?.id || null,
        processing_at: next === 'processing' ? now : item.processing_at,
        completed_at: next === 'cancelled' ? now : null,
      })
      .eq('id', item.id);
    if (error)
      return toast.error(`Não foi possível atualizar: ${error.message}`);
    toast.success(
      next === 'processing'
        ? 'Pedido assumido para tratamento.'
        : 'Pedido cancelado.'
    );
    await onRefresh();
  }
  function openDecision(
    item: FinanceInvoiceRequest,
    nextMode: 'issue' | 'reject'
  ) {
    setSelected(item);
    setMode(nextMode);
    setInvoiceNumber(item.invoice_number || '');
    setInvoiceFile(null);
    setNotes(item.admin_notes || '');
  }
  async function finish() {
    if (!selected || !canManage) return;
    if (mode === 'issue' && !invoiceNumber.trim())
      return toast.error('Informe o número da fatura emitida.');
    if (mode === 'issue' && !invoiceFile)
      return toast.error('Anexe a fatura em PDF antes de concluir.');
    if (mode === 'reject' && !notes.trim())
      return toast.error('Informe o motivo da rejeição.');
    setSaving(true);
    if (mode === 'issue') {
      const form = new FormData();
      if (invoiceFile) form.append('file', invoiceFile);
      form.append('invoiceNumber', invoiceNumber.trim());
      form.append('notes', notes.trim());
      const response = await fetch(
        `/api/finance/invoice-requests/${selected.id}/document`,
        { method: 'POST', body: form }
      );
      const payload = await response.json().catch(() => ({}));
      setSaving(false);
      if (!response.ok)
        return toast.error(
          payload.error || 'Não foi possível guardar a fatura.'
        );
      toast.success('Fatura emitida e disponibilizada no Portal 360.');
      setSelected(null);
      await onRefresh();
      return;
    }
    const now = new Date().toISOString();
    const { error } = await db
      .from('finance_invoice_requests')
      .update({
        status: 'rejected',
        invoice_number: null,
        admin_notes: notes.trim() || null,
        handled_by_user_id: user?.id || null,
        processing_at: selected.processing_at || now,
        completed_at: now,
      })
      .eq('id', selected.id);
    setSaving(false);
    if (error)
      return toast.error(`Não foi possível concluir: ${error.message}`);
    toast.success('Pedido rejeitado com motivo registado.');
    setSelected(null);
    await onRefresh();
  }

  async function issueFiscal(item: FinanceInvoiceRequest) {
    if (!canManage) return;
    setIssuingFiscalId(item.id);
    const response = await fetch(
      `/api/finance/invoice-requests/${item.id}/issue-fiscal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: item.fiscal_provider || undefined }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    setIssuingFiscalId(null);

    if (!response.ok) {
      return toast.error(payload.error || 'Não foi possível emitir a fatura fiscal.');
    }

    toast.success(
      payload.status === 'issued'
        ? `Fatura fiscal emitida (${payload.documentNumber}).`
        : 'Fatura enviada para emissão fiscal.'
    );
    await onRefresh();
  }

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">Pedidos de fatura</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Fila fiscal solicitada pelos clientes através do Portal 360.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="destructive">
            {requests.filter((item) => item.status === 'pending').length}{' '}
            pendentes
          </Badge>
          <Badge variant="secondary">
            {requests.filter((item) => item.status === 'processing').length} em
            processamento
          </Badge>
        </div>
      </div>
      <div className="border-border grid gap-3 border-b p-4 lg:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar cliente, NIF, email ou venda..."
            className="pl-9"
          />
        </div>
        <NativeSelect value={status} onChange={setStatus}>
          <option value="active">Aguardando ação</option>
          <option value="all">Todos os estados</option>
          <option value="pending">Pendentes</option>
          <option value="processing">Em processamento</option>
          <option value="issued">Emitidas</option>
          <option value="rejected">Rejeitadas</option>
          <option value="cancelled">Canceladas</option>
        </NativeSelect>
      </div>
      <div className="divide-border divide-y">
        {filtered.length ? (
          filtered.map((item) => (
            <article
              id={`invoice-request-${item.id}`}
              key={item.id}
              className="target:bg-primary/5 target:ring-primary/30 scroll-mt-24 p-4 target:ring-2"
            >
              <div className="flex flex-wrap items-start gap-4">
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md">
                  <ReceiptText className="size-5" />
                </span>
                <div className="min-w-56 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{item.fiscal_name}</h3>
                    <Badge
                      variant={
                        item.status === 'pending'
                          ? 'destructive'
                          : item.status === 'issued'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {invoiceRequestStatus(item.status)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    NIF {item.tax_id} · {item.email}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Solicitado em{' '}
                    {new Date(item.requested_at).toLocaleString('pt-PT')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">Venda</p>
                  <strong>#{item.sale?.sale_number ?? '—'}</strong>
                  <p className="text-sm">
                    {money(
                      Number(item.sale?.total_amount ?? 0),
                      item.sale?.currency || 'EUR'
                    )}
                  </p>
                </div>
              </div>
              <div className="bg-muted/30 mt-4 grid gap-3 rounded-md p-3 text-xs md:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">Morada fiscal</span>
                  <p className="mt-1">
                    {[
                      item.address_line,
                      item.postal_code,
                      item.city,
                      item.country,
                    ]
                      .filter(Boolean)
                      .join(', ') || 'Não informada'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Observação do cliente
                  </span>
                  <p className="mt-1">
                    {item.client_notes || 'Sem observação'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Processamento</span>
                  <p className="mt-1">
                    {item.invoice_number
                      ? `Fatura ${item.invoice_number}`
                      : item.admin_notes || 'Aguardando equipa'}
                  </p>
                  {item.fiscal_provider || item.fiscal_status ? (
                    <p className="text-muted-foreground mt-1">
                      Fiscal: {item.fiscal_provider || 'sem fornecedor'} ·{' '}
                      {item.fiscal_status || 'not_sent'}
                    </p>
                  ) : null}
                  {item.fiscal_error ? (
                    <p className="mt-1 text-red-500">{item.fiscal_error}</p>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {item.contact_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/contacts/${item.contact_id}`} />}
                  >
                    <CircleDollarSign /> Cliente 360
                  </Button>
                )}
                {item.sale_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link href={`/finance?tab=sales#sale-${item.sale_id}`} />
                    }
                  >
                    <ReceiptText /> Ver venda
                  </Button>
                )}
                {item.invoice_document_path && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `/api/finance/invoice-requests/${item.id}/document`,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    <ExternalLink /> Documento
                  </Button>
                )}
                {item.status === 'pending' && (
                  <Button
                    size="sm"
                    disabled={!canManage}
                    onClick={() => void updateStatus(item, 'processing')}
                  >
                    <FileClock /> Iniciar
                  </Button>
                )}
                {['pending', 'processing'].includes(item.status) && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canManage || issuingFiscalId === item.id}
                      onClick={() => void issueFiscal(item)}
                    >
                      {issuingFiscalId === item.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <FileCheck2 />
                      )}
                      Emitir fiscal
                    </Button>
                    <Button
                      size="sm"
                      disabled={!canManage}
                      onClick={() => openDecision(item, 'issue')}
                    >
                      <FileCheck2 /> Emitir
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!canManage}
                      onClick={() => openDecision(item, 'reject')}
                    >
                      <X /> Rejeitar
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))
        ) : (
          <Empty
            icon={FileClock}
            text="Nenhum pedido de fatura neste filtro."
          />
        )}
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === 'issue'
                ? 'Concluir emissão da fatura'
                : 'Rejeitar pedido de fatura'}
            </DialogTitle>
            <DialogDescription>
              Venda #{selected?.sale?.sale_number}. A resposta ficará
              imediatamente visível no portal do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {mode === 'issue' && (
              <>
                <Field label="Número da fatura">
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Ex.: FT 2026/123"
                  />
                </Field>
                <Field label="Fatura em PDF">
                  <Input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) =>
                      setInvoiceFile(e.target.files?.[0] || null)
                    }
                  />
                  <span className="text-muted-foreground text-xs">
                    PDF até 10 MB. O documento ficará privado e disponível
                    apenas para este cliente.
                  </span>
                </Field>
              </>
            )}
            <Field
              label={
                mode === 'issue'
                  ? 'Nota para o cliente (opcional)'
                  : 'Motivo da rejeição'
              }
            >
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Voltar
            </Button>
            <Button
              variant={mode === 'reject' ? 'destructive' : 'default'}
              onClick={() => void finish()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : mode === 'issue' ? (
                <FileCheck2 />
              ) : (
                <X />
              )}
              {mode === 'issue' ? ' Confirmar emissão' : ' Rejeitar pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
