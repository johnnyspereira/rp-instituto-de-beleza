'use client';

import { useMemo, useState } from 'react';
import { Check, Download, Gift, Loader2, Phone, X } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { BenefitLogList } from '@/components/finance/finance-benefit-log-list';
import { Empty, Field } from '@/components/finance/finance-ui';
import { money } from '@/components/finance/finance-utils';
import { downloadVoucherPdf } from '@/lib/finance/voucher-pdf';
import { createClient } from '@/lib/supabase/client';
import type {
  Contact,
  FinanceBenefitLog,
  FinanceVoucher,
  FinanceVoucherTransferRequest,
} from '@/types';

export function VouchersView({
  vouchers,
  transferRequests,
  contacts,
  logs,
  currency,
  accountId,
  userId,
  canManage,
  brand,
  onRefresh,
  onSell,
}: {
  vouchers: FinanceVoucher[];
  transferRequests: FinanceVoucherTransferRequest[];
  contacts: Contact[];
  logs: FinanceBenefitLog[];
  currency: string;
  accountId?: string | null;
  userId: string;
  canManage: boolean;
  brand: { name: string; logoUrl?: string | null; publicUrl?: string | null };
  onRefresh: () => Promise<void>;
  onSell: () => void;
}) {
  const db = useMemo(() => createClient(), []);
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    request: FinanceVoucherTransferRequest;
    action: 'contacted' | 'approved' | 'rejected';
  } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const activeRequests = transferRequests.filter((request) =>
    ['pending', 'contacted'].includes(request.status)
  );

  async function generatePdf(voucher: FinanceVoucher) {
    setGeneratingCode(voucher.code);
    try {
      await downloadVoucherPdf(voucher, brand);
      toast.success('PDF do voucher criado.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar o PDF do voucher.'
      );
    } finally {
      setGeneratingCode(null);
    }
  }

  async function findOrCreateRecipientContact(
    request: FinanceVoucherTransferRequest
  ) {
    if (!accountId || !userId) throw new Error('Sessão inválida.');
    const normalizedPhone = request.recipient_phone.replace(/\D/g, '');
    const existing =
      contacts.find(
        (contact) =>
          contact.phone_normalized === normalizedPhone ||
          contact.phone?.replace(/\D/g, '') === normalizedPhone
      ) ?? null;
    if (existing) return existing.id;

    const { data: fetched } = await db
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .eq('phone_normalized', normalizedPhone)
      .maybeSingle();
    if (fetched?.id) return fetched.id as string;

    const { data: created, error } = await db
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: userId,
        name: request.recipient_name,
        phone: request.recipient_phone,
      })
      .select('id')
      .single();

    if (error || !created) {
      const { data: raced } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone_normalized', normalizedPhone)
        .maybeSingle();
      if (raced?.id) return raced.id as string;
      throw new Error(error?.message || 'Não foi possível criar o cliente.');
    }

    return created.id as string;
  }

  async function finishTransferDecision() {
    if (!decision || !canManage) return;
    setSavingDecision(true);
    const now = new Date().toISOString();
    try {
      if (decision.action === 'approved') {
        const contactId = await findOrCreateRecipientContact(decision.request);
        const { error: voucherError } = await db
          .from('finance_vouchers')
          .update({
            owner_contact_id: contactId,
            recipient_name: decision.request.recipient_name,
            updated_at: now,
          })
          .eq('id', decision.request.voucher_id);
        if (voucherError) throw new Error(voucherError.message);

        await db.from('finance_benefit_logs').insert({
          account_id: decision.request.account_id,
          voucher_id: decision.request.voucher_id,
          action: 'adjusted',
          performed_by_user_id: userId,
          approved_by_user_id: userId,
          notes:
            decisionNotes.trim() ||
            `Voucher transferido para ${decision.request.recipient_name}`,
          metadata: {
            transfer_request_id: decision.request.id,
            recipient_name: decision.request.recipient_name,
            recipient_phone: decision.request.recipient_phone,
            new_owner_contact_id: contactId,
          },
        });
      }

      const { error } = await db
        .from('finance_voucher_transfer_requests')
        .update({
          status: decision.action,
          reviewed_by_user_id:
            decision.action === 'contacted' ? null : userId || null,
          reviewed_at: decision.action === 'contacted' ? null : now,
          notes: decisionNotes.trim() || null,
          updated_at: now,
        })
        .eq('id', decision.request.id);
      if (error) throw new Error(error.message);

      toast.success(
        decision.action === 'approved'
          ? 'Voucher transferido para o novo cliente.'
          : decision.action === 'contacted'
            ? 'Pedido marcado como contactado.'
            : 'Pedido de transferência rejeitado.'
      );
      setDecision(null);
      setDecisionNotes('');
      await onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível tratar o pedido.'
      );
    } finally {
      setSavingDecision(false);
    }
  }

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border flex items-center justify-between border-b p-4">
        <div>
          <h2 className="font-semibold">Vouchers emitidos</h2>
          <p className="text-muted-foreground text-xs">
            Saldo, validade e titular de cada vale.
          </p>
        </div>
        <Button onClick={onSell}>
          <Gift /> Vender voucher
        </Button>
      </div>
      <div className="border-border border-b p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              Pedidos de transferência
            </h3>
            <p className="text-muted-foreground text-xs">
              Pedidos enviados pela página pública do voucher via QR Code.
            </p>
          </div>
          <Badge variant={activeRequests.length ? 'destructive' : 'secondary'}>
            {activeRequests.length} em aberto
          </Badge>
        </div>
        {activeRequests.length ? (
          <div className="space-y-2">
            {activeRequests.map((request) => (
              <article
                key={request.id}
                className="border-border bg-background rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                    <Phone className="size-4" />
                  </span>
                  <div className="min-w-56 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{request.recipient_name}</p>
                      <Badge
                        variant={
                          request.status === 'pending'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {voucherTransferStatus(request.status)}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {request.recipient_phone} pediu o voucher{' '}
                      <span className="font-mono">
                        {request.voucher?.code ?? '—'}
                      </span>{' '}
                      em {new Date(request.created_at).toLocaleString('pt-PT')}
                    </p>
                    {request.voucher?.owner ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Titular atual:{' '}
                        {request.voucher.owner.name ||
                          request.voucher.owner.phone}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {request.status === 'pending' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canManage}
                        onClick={() => {
                          setDecision({ request, action: 'contacted' });
                          setDecisionNotes(request.notes ?? '');
                        }}
                      >
                        <Phone /> Contactado
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      disabled={!canManage}
                      onClick={() => {
                        setDecision({ request, action: 'approved' });
                        setDecisionNotes(request.notes ?? '');
                      }}
                    >
                      <Check /> Aprovar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!canManage}
                      onClick={() => {
                        setDecision({ request, action: 'rejected' });
                        setDecisionNotes(request.notes ?? '');
                      }}
                    >
                      <X /> Rejeitar
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            Nenhum pedido pendente neste momento.
          </p>
        )}
      </div>
      <div className="divide-border divide-y">
        {vouchers.length ? (
          vouchers.map((voucher) => (
            <div key={voucher.id} className="p-4">
              <div className="grid items-center gap-3 md:grid-cols-[150px_1fr_140px_110px_auto]">
                <div>
                  <span className="bg-muted block rounded-md px-2 py-1 font-mono text-xs">
                    {voucher.code}
                  </span>
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    PIN {voucher.pin_code ?? 'não definido'}
                  </p>
                </div>
                <div>
                  <p className="font-medium">
                    {voucher.voucher_type === 'service'
                      ? voucher.service?.name || 'Voucher de serviço'
                      : 'Cartão-presente'}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {voucher.recipient_name ||
                      voucher.owner?.name ||
                      'Sem destinatário'}{' '}
                    ·{' '}
                    {voucher.expires_at
                      ? `até ${new Date(voucher.expires_at).toLocaleDateString('pt-PT')}`
                      : 'sem limite'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    {voucher.voucher_type === 'service'
                      ? 'Utilizações'
                      : 'Saldo'}
                  </p>
                  <strong>
                    {voucher.voucher_type === 'service'
                      ? `${voucher.remaining_uses ?? 0}/1 disponível`
                      : money(
                          Number(voucher.current_balance),
                          voucher.currency || currency
                        )}
                  </strong>
                  <p className="text-muted-foreground text-[10px]">
                    Utilizado:{' '}
                    {voucher.voucher_type === 'service'
                      ? `${1 - Number(voucher.remaining_uses ?? 0)} sessão`
                      : money(
                          Number(voucher.initial_balance) -
                            Number(voucher.current_balance),
                          voucher.currency || currency
                        )}
                  </p>
                </div>
                <Badge
                  variant={
                    voucher.status === 'active' ? 'default' : 'secondary'
                  }
                >
                  {voucher.status}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={generatingCode === voucher.code}
                  onClick={() => void generatePdf(voucher)}
                  title="Baixar vale-presente em PDF"
                >
                  {generatingCode === voucher.code ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  Baixar PDF
                </Button>
              </div>
              <BenefitLogList
                logs={logs.filter((log) => log.voucher_id === voucher.id)}
                sourceHref={
                  voucher.issued_sale_id
                    ? `/finance?tab=sales#sale-${voucher.issued_sale_id}`
                    : undefined
                }
              />
            </div>
          ))
        ) : (
          <Empty icon={Gift} text="Nenhum voucher emitido." />
        )}
      </div>
      <Dialog
        open={Boolean(decision)}
        onOpenChange={(open) => {
          if (!open) {
            setDecision(null);
            setDecisionNotes('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {decision?.action === 'approved'
                ? 'Aprovar transferência'
                : decision?.action === 'contacted'
                  ? 'Marcar como contactado'
                  : 'Rejeitar transferência'}
            </DialogTitle>
            <DialogDescription>
              {decision
                ? `${decision.request.recipient_name} (${decision.request.recipient_phone}) · voucher ${decision.request.voucher?.code ?? '—'}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {decision?.action === 'approved' ? (
              <div className="bg-muted/50 rounded-md p-3 text-sm">
                O CRM vai encontrar ou criar este cliente pelo telefone e mudar
                o titular do voucher para ele.
              </div>
            ) : null}
            <Field label="Notas internas">
              <Textarea
                value={decisionNotes}
                onChange={(event) => setDecisionNotes(event.target.value)}
                rows={4}
                placeholder="Ex.: contacto confirmado por WhatsApp..."
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDecision(null);
                setDecisionNotes('');
              }}
            >
              Voltar
            </Button>
            <Button
              variant={
                decision?.action === 'rejected' ? 'destructive' : 'default'
              }
              onClick={() => void finishTransferDecision()}
              disabled={savingDecision || !canManage}
            >
              {savingDecision ? <Loader2 className="animate-spin" /> : <Check />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function voucherTransferStatus(
  status: FinanceVoucherTransferRequest['status']
) {
  return {
    pending: 'Pendente',
    contacted: 'Contactado',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    cancelled: 'Cancelado',
  }[status];
}
