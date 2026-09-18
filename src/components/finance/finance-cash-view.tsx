import {
  ArrowRightLeft,
  Banknote,
  Building2,
  CircleDollarSign,
  CreditCard,
  HandCoins,
  Pencil,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, Summary } from '@/components/finance/finance-ui';
import {
  money,
  paymentMethodLabel,
  REGISTER_METHODS,
} from '@/components/finance/finance-utils';
import {
  calculateRegisterBalance,
  cashMovementSign,
} from '@/lib/finance/register-balance';
import { cn } from '@/lib/utils';
import type {
  FinanceCashMovement,
  FinanceCashSession,
  FinanceCashSnapshot,
  FinanceFundAccount,
  FinanceSale,
} from '@/types';
export function CashView({
  cashSession,
  sales,
  snapshot,
  movements,
  sessions,
  fundAccounts,
  currency,
  canOperate,
  canDelete,
  onOpen,
  onTransfer,
  onClose,
  onMovement,
  onEditMovement,
  onDeleteMovement,
}: {
  cashSession: FinanceCashSession | null;
  sales: FinanceSale[];
  snapshot: FinanceCashSnapshot | null;
  movements: FinanceCashMovement[];
  sessions: FinanceCashSession[];
  fundAccounts: FinanceFundAccount[];
  currency: string;
  canOperate: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onTransfer: () => void;
  onClose: () => void;
  onMovement: () => void;
  onEditMovement: (movement: FinanceCashMovement) => void;
  onDeleteMovement: (movement: FinanceCashMovement) => void;
}) {
  const payments = sales
    .flatMap((sale) => sale.payments ?? [])
    .filter(
      (payment) =>
        payment.cash_session_id === cashSession?.id &&
        ['confirmed', 'refunded'].includes(payment.status)
    );
  const sessionMovements = movements.filter(
    (movement) => movement.cash_session_id === cashSession?.id
  );
  const movementLabels: Record<string, string> = {
    deposit: 'Reforço',
    withdrawal: 'Sangria',
    expense: 'Despesa',
    adjustment: 'Ajuste',
    refund: 'Reembolso',
    tip: 'Gorjeta',
  };
  const registerBalance = calculateRegisterBalance(snapshot, sessionMovements);
  const {
    byMethod: methodTotals,
    salesReceived,
    tipsReceived: tipTotals,
    manualEntries,
    outflows,
    netTurnBalance,
  } = registerBalance;
  const cashReceived = Number(snapshot?.cash_received ?? 0);
  const expected = Number(snapshot?.expected_amount ?? 0);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
                Turno atual
              </p>
              <p className="mt-2 text-3xl font-black">
                {money(netTurnBalance, currency)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Saldo líquido: entradas menos despesas e saídas
              </p>
            </div>
            <span className="rounded-2xl bg-white/10 p-3 text-violet-200">
              <CircleDollarSign className="size-7" />
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
              <p className="text-xs text-slate-400">Vendas recebidas</p>
              <p className="mt-1 font-bold">{money(salesReceived, currency)}</p>
            </div>
            <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.08] p-3">
              <p className="text-xs text-amber-200/70">Gorjetas</p>
              <p className="mt-1 font-bold text-amber-200">
                {money(tipTotals, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.08] p-3">
              <p className="text-xs text-emerald-200/70">Outras entradas</p>
              <p className="mt-1 font-bold text-emerald-200">
                +{money(manualEntries, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-red-300/15 bg-red-300/[0.08] p-3">
              <p className="text-xs text-red-200/70">Despesas e saídas</p>
              <p className="mt-1 font-bold text-red-200">
                -{money(outflows, currency)}
              </p>
            </div>
          </div>
        </div>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote /> Estado do caixa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cashSession ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Summary
                  label="Fundo inicial"
                  value={money(Number(cashSession.opening_amount), currency)}
                />
                <Summary
                  label="Recebido em dinheiro"
                  value={money(cashReceived, currency)}
                />
                <Summary
                  label="Entradas manuais"
                  value={money(Number(snapshot?.deposits ?? 0), currency)}
                />
                <Summary
                  label="Saídas e reembolsos"
                  value={money(Number(snapshot?.outflows ?? 0), currency)}
                />
                <Summary
                  label="Esperado no caixa"
                  value={money(expected, currency)}
                />
                <Summary
                  label="Aberto desde"
                  value={new Date(cashSession.opened_at).toLocaleTimeString(
                    'pt-PT',
                    { hour: '2-digit', minute: '2-digit' }
                  )}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={onMovement}
                  disabled={!canOperate}
                >
                  <HandCoins /> Movimento / gorjeta
                </Button>
                <Button
                  variant="destructive"
                  onClick={onClose}
                  disabled={!canOperate}
                >
                  Fechar e conferir
                </Button>
              </div>
            </div>
          ) : (
            <Empty
              icon={Banknote}
              text="O caixa está fechado. Abra-o antes de receber pagamentos em dinheiro."
              action="Abrir caixa"
              onClick={onOpen}
            />
          )}
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard /> Saldo líquido por canal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REGISTER_METHODS.map((method) => (
              <div
                key={method.value}
                className="bg-muted/60 rounded-xl border p-3"
              >
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  {method.value === 'cash' ? (
                    <Banknote className="size-3.5" />
                  ) : (
                    <CreditCard className="size-3.5" />
                  )}
                  {method.label}
                </div>
                <p className="mt-1.5 text-base font-bold">
                  {money(methodTotals[method.value], currency)}
                </p>
              </div>
            ))}
          </div>
          <div className="border-border mb-2 flex items-center justify-between border-t pt-4">
            <p className="text-sm font-semibold">Linha do tempo do turno</p>
            <Badge variant="outline">
              {payments.length + sessionMovements.length}
            </Badge>
          </div>
          <div className="max-h-[330px] space-y-1 overflow-y-auto pr-1">
            {payments.length || sessionMovements.length ? (
              [
                ...payments.map((payment) => ({
                  id: payment.id,
                  date: payment.paid_at,
                  label: `Venda · ${paymentMethodLabel(payment.method)}`,
                  amount: Number(payment.amount),
                  incoming: payment.status !== 'refunded',
                  method: payment.method,
                  source: 'payment' as const,
                  movement: null,
                })),
                ...sessionMovements.map((movement) => ({
                  id: movement.id,
                  date: movement.created_at,
                  label: `${movementLabels[movement.movement_type] ?? movement.movement_type} · ${movement.description}`,
                  amount: Number(movement.amount),
                  incoming: cashMovementSign(movement.movement_type) > 0,
                  method: movement.payment_method || 'cash',
                  source: 'manual' as const,
                  movement,
                })),
              ]
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                )
                .map((movement) => (
                  <div
                    key={movement.id}
                    className="border-border flex items-center justify-between border-b py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{movement.label}</p>
                      <span className="text-muted-foreground text-xs">
                        {paymentMethodLabel(movement.method)} ·{' '}
                        {new Date(movement.date).toLocaleString('pt-PT')}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <strong
                        className={
                          movement.incoming
                            ? 'text-emerald-600'
                            : 'text-red-600'
                        }
                      >
                        {movement.incoming ? '+' : '-'}
                        {money(movement.amount, currency)}
                      </strong>
                      {movement.source === 'manual' && movement.movement ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Editar lançamento"
                            disabled={!canOperate}
                            onClick={() => onEditMovement(movement.movement)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Excluir lançamento"
                            disabled={!canDelete}
                            onClick={() => onDeleteMovement(movement.movement)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-muted-foreground text-sm">
                Sem movimentos nesta sessão.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Onde está o dinheiro</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Numerário e saldos por conta financeira
              </p>
            </div>
            <Button
              variant="outline"
              onClick={onTransfer}
              disabled={!canOperate || fundAccounts.length < 2}
            >
              <ArrowRightLeft /> Transferir entre contas
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fundAccounts.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fundAccounts.map((account) => (
                <div
                  key={account.id}
                  className="bg-muted/40 rounded-xl border p-4"
                >
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    {account.account_type === 'cash' ? (
                      <Banknote className="size-4" />
                    ) : (
                      <Building2 className="size-4" />
                    )}
                    {account.account_type === 'cash'
                      ? 'Dinheiro físico'
                      : account.institution || 'Conta bancária'}
                  </div>
                  <p className="mt-2 font-semibold">{account.name}</p>
                  <p className="mt-1 text-xl font-black">
                    {money(account.balance, account.currency)}
                  </p>
                </div>
              ))}
              <div className="bg-muted/20 rounded-xl border border-dashed p-4">
                <p className="text-muted-foreground text-xs">
                  Saldo financeiro total
                </p>
                <p className="mt-3 text-xl font-black">
                  {money(
                    fundAccounts.reduce(
                      (total, account) => total + Number(account.balance),
                      0
                    ),
                    currency
                  )}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Transferências internas não alteram este total.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              As contas serão criadas ao abrir o próximo turno.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Fechos recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-muted-foreground border-b text-xs">
                <tr>
                  <th className="py-2 font-medium">Sessão</th>
                  <th className="py-2 font-medium">Abertura</th>
                  <th className="py-2 font-medium">Esperado</th>
                  <th className="py-2 font-medium">Contado</th>
                  <th className="py-2 text-right font-medium">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions
                  .filter((session) => session.status === 'closed')
                  .slice(0, 10)
                  .map((session) => (
                    <tr key={session.id}>
                      <td className="py-2">
                        {new Date(session.opened_at).toLocaleString('pt-PT')}
                      </td>
                      <td className="py-2">
                        {money(Number(session.opening_amount), currency)}
                      </td>
                      <td className="py-2">
                        {money(Number(session.expected_amount ?? 0), currency)}
                      </td>
                      <td className="py-2">
                        {money(
                          Number(session.closing_counted_amount ?? 0),
                          currency
                        )}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right font-medium',
                          Math.abs(Number(session.difference_amount ?? 0)) >
                            0.009 && 'text-destructive'
                        )}
                      >
                        {money(
                          Number(session.difference_amount ?? 0),
                          currency
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

