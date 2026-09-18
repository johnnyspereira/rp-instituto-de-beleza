'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Gift,
  HeartHandshake,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  UserPlus,
  UsersRound,
  UserX,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import {
  REFERRAL_STATUS_LABELS,
  referralConversionRate,
  type ReferralStatus,
} from '@/lib/referrals/presentation';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Reward = {
  id: string;
  beneficiary_type: 'referrer' | 'friend';
  reward_type: 'fixed_credit' | 'percentage' | 'service';
  reward_value: number;
  reward_code: string;
  status: 'pending' | 'issued' | 'redeemed' | 'cancelled';
  expires_at: string | null;
  issued_wallet_id?: string | null;
  issued_voucher_id?: string | null;
  credited_amount?: number;
  available_amount?: number;
  reversed_amount?: number;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  metadata?: Record<string, unknown>;
  service?: { name?: string | null } | null;
  voucher?: {
    id: string;
    code: string;
    current_balance: number;
    currency: string;
  } | null;
  wallet?: {
    id: string;
    balance: number;
    currency: string;
  } | null;
};

type ReferralEvent = {
  id: string;
  action: string;
  reason?: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
};

type Referral = {
  id: string;
  status: ReferralStatus;
  friend_name: string;
  friend_phone: string;
  friend_email: string | null;
  source: string;
  created_at: string;
  qualified_at: string | null;
  contacted_at?: string | null;
  scheduled_at?: string | null;
  rejected_at?: string | null;
  rejection_code?: string | null;
  rejection_reason?: string | null;
  metadata?: Record<string, unknown>;
  referrer?: { id: string; name: string | null; phone: string } | null;
  friend?: { id: string; name: string | null; phone: string } | null;
  code?: { code: string } | null;
  rewards?: Reward[];
  events?: ReferralEvent[];
};

const STATUS = REFERRAL_STATUS_LABELS;

const DISQUALIFICATION_REASONS = {
  gave_up: 'Cliente desistiu',
  no_response: 'Sem resposta',
  existing_client: 'Já era cliente',
  duplicate: 'Indicação duplicada',
  invalid_data: 'Dados inválidos',
  rules_not_met: 'Não cumpriu as regras',
  other: 'Outro motivo',
} as const;

export function ReferralsPage() {
  const {
    accountId,
    account,
    defaultCurrency,
    canSendMessages,
    canEditSettings,
  } = useAuth();
  const db = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [rewardFilter, setRewardFilter] = useState('all');
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [lostReferral, setLostReferral] = useState<Referral | null>(null);
  const [lostReasonCode, setLostReasonCode] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [reverseReward, setReverseReward] = useState<Reward | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data, error } = await db
      .from('referrals')
      .select(
        '*, referrer:contacts!referrals_referrer_contact_id_fkey(id, name, phone), friend:contacts!referrals_friend_contact_id_fkey(id, name, phone), code:referral_codes(code), rewards:referral_rewards(*, service:clinic_services(name), voucher:finance_vouchers!referral_rewards_issued_voucher_id_fkey(id, code, current_balance, currency), wallet:finance_client_wallets!referral_rewards_issued_wallet_id_fkey(id, balance, currency)), events:referral_events(id, action, reason, metadata, created_at)'
      )
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    if (error) {
      setSchemaMissing(
        ['42P01', '42703', 'PGRST200'].includes(error.code ?? '') ||
          error.message.includes('schema cache')
      );
      setRows([]);
      setLoadError(error.message);
    } else {
      setRows((data as Referral[] | null) ?? []);
      setSchemaMissing(false);
      setLoadError(null);
      setLastUpdatedAt(new Date());
    }
    setLoading(false);
  }, [accountId, db]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!accountId) return;
    const channel = db
      .channel(`referrals:${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referrals',
          filter: `account_id=eq.${accountId}`,
        },
        () => void load()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referral_rewards',
          filter: `account_id=eq.${accountId}`,
        },
        () => void load()
      )
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [accountId, db, load]);

  const filtered = rows.filter((row) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      [
        row.friend_name,
        row.friend_phone,
        row.friend_email,
        row.referrer?.name,
        row.referrer?.phone,
        row.code?.code,
      ].some((value) => value?.toLowerCase().includes(needle));
    const rewards = row.rewards ?? [];
    const matchesReward =
      rewardFilter === 'all' ||
      (rewardFilter === 'pending' &&
        rewards.some((reward) => reward.status === 'pending')) ||
      (rewardFilter === 'credited' &&
        rewards.some(
          (reward) =>
            reward.reward_type === 'fixed_credit' &&
            Number(reward.available_amount ?? 0) > 0
        )) ||
      (rewardFilter === 'used' &&
        rewards.some((reward) => reward.status === 'redeemed')) ||
      (rewardFilter === 'reconcile' &&
        rewards.some(
          (reward) =>
            reward.status === 'issued' &&
            reward.reward_type === 'fixed_credit' &&
            !reward.issued_wallet_id
        ));
    return (
      matchesSearch &&
      matchesReward &&
      (status === 'all' || row.status === status)
    );
  });

  const metrics = {
    total: rows.length,
    registered: rows.filter((row) =>
      ['registered', 'contacted', 'scheduled'].includes(row.status)
    ).length,
    qualified: rows.filter((row) =>
      ['qualified', 'rewarded'].includes(row.status)
    ).length,
    rewards: rows
      .flatMap((row) => row.rewards ?? [])
      .filter((reward) => ['issued', 'redeemed'].includes(reward.status))
      .length,
    credited: rows
      .flatMap((row) => row.rewards ?? [])
      .filter(
        (reward) =>
          ['issued', 'redeemed'].includes(reward.status) &&
          reward.reward_type === 'fixed_credit'
      )
      .reduce(
        (sum, reward) =>
          sum + Number(reward.credited_amount ?? reward.reward_value),
        0
      ),
    available: rows
      .flatMap((row) => row.rewards ?? [])
      .filter((reward) => reward.reward_type === 'fixed_credit')
      .reduce((sum, reward) => sum + Number(reward.available_amount ?? 0), 0),
    conversion: referralConversionRate(rows),
  };

  async function manageReferral(id: string) {
    if (!canSendMessages) return;
    setWorkingId(id);
    const { error } = await db.rpc('manage_referral_status', {
      p_referral_id: id,
      p_status: 'qualified',
    });
    setWorkingId(null);
    if (error) {
      toast.error(referralErrorMessage(error.message));
      return;
    }
    toast.success('Indicação qualificada.');
    void load();
  }

  async function issueReward(reward: Reward) {
    if (!canSendMessages) return;
    setWorkingId(reward.id);
    const { error } = await db.rpc('issue_referral_reward', {
      p_reward_id: reward.id,
    });
    setWorkingId(null);
    if (error) {
      toast.error(referralErrorMessage(error.message));
      return;
    }
    toast.success(
      reward.reward_type === 'fixed_credit'
        ? 'Crédito lançado no cartão-saldo do cliente.'
        : 'Voucher de procedimento emitido para o cliente.'
    );
    void load();
  }

  async function reconcileRewards(referralId: string) {
    if (!canSendMessages) return;
    setWorkingId(referralId);
    const { error } = await db.rpc('reconcile_referral_rewards', {
      p_referral_id: referralId,
    });
    setWorkingId(null);
    if (error) {
      toast.error(referralErrorMessage(error.message));
      return;
    }
    toast.success('Recompensas reconstruídas com as regras atuais.');
    void load();
  }

  async function markContacted(referralId: string) {
    if (!canSendMessages) return;
    setWorkingId(referralId);
    const { error } = await db.rpc('mark_referral_contacted', {
      p_referral_id: referralId,
    });
    setWorkingId(null);
    if (error) {
      toast.error(referralErrorMessage(error.message));
      return;
    }
    toast.success('Contacto registado.');
    void load();
  }

  async function markLost() {
    if (!lostReferral || !canSendMessages) return;
    setWorkingId(lostReferral.id);
    const { error } = await db.rpc('mark_referral_not_qualified', {
      p_referral_id: lostReferral.id,
      p_reason_code: lostReasonCode,
      p_reason: lostReason.trim() || null,
    });
    setWorkingId(null);
    if (error) {
      toast.error(referralErrorMessage(error.message));
      return;
    }
    toast.success('Indicação encerrada como não qualificada.');
    setLostReferral(null);
    setLostReasonCode('');
    setLostReason('');
    void load();
  }

  async function reverseIssuedReward() {
    if (!reverseReward || !canEditSettings || !reverseReason.trim()) return;
    setWorkingId(reverseReward.id);
    const { error } = await db.rpc('reverse_referral_reward', {
      p_reward_id: reverseReward.id,
      p_reason: reverseReason.trim(),
    });
    setWorkingId(null);
    if (error) {
      toast.error(referralErrorMessage(error.message));
      return;
    }
    toast.success('Recompensa anulada e saldo revertido com auditoria.');
    setReverseReward(null);
    setReverseReason('');
    void load();
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <HeartHandshake className="text-primary size-6" />
            <h1 className="text-2xl font-bold">Indicações</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Acompanhe amigos convidados, conversões e recompensas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastUpdatedAt ? (
            <span className="text-muted-foreground text-xs">
              Atualizado às{' '}
              {lastUpdatedAt.toLocaleTimeString('pt-PT', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          ) : null}
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn(loading && 'animate-spin')} /> Atualizar
          </Button>
          {canEditSettings ? (
            <Link
              href="/settings?tab=referrals"
              className={buttonVariants({ variant: 'outline' })}
            >
              <Settings2 /> Configurar programa
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Metric icon={UsersRound} label="Total" value={metrics.total} />
        <Metric
          icon={UserPlus}
          label="Cadastrados"
          value={metrics.registered}
        />
        <Metric
          icon={CheckCircle2}
          label="Qualificados"
          value={metrics.qualified}
        />
        <Metric icon={Award} label="Prémios emitidos" value={metrics.rewards} />
        <Metric
          icon={WalletCards}
          label="Cashback creditado"
          value={formatCurrency(metrics.credited, defaultCurrency)}
        />
        <Metric
          icon={WalletCards}
          label="Saldo disponível"
          value={formatCurrency(metrics.available, defaultCurrency)}
        />
        <Metric
          icon={Award}
          label="Conversão"
          value={`${metrics.conversion}%`}
        />
      </div>

      <Card className="border-violet-500/25 bg-violet-500/5">
        <CardContent className="grid gap-3 py-4 text-sm md:grid-cols-4">
          <div>
            <b>1. Indicação</b>
            <p className="text-muted-foreground text-xs">
              O amigo recebe o convite e fica ligado ao código de quem indicou.
            </p>
          </div>
          <div>
            <b>2. Primeira marcação</b>
            <p className="text-muted-foreground text-xs">
              O benefício do amigo é aplicado automaticamente antes da cobrança.
            </p>
          </div>
          <div>
            <b>3. Sessão paga</b>
            <p className="text-muted-foreground text-xs">
              A indicação qualifica quando cumpre a regra configurada.
            </p>
          </div>
          <div>
            <b>4. Recompensa</b>
            <p className="text-muted-foreground text-xs">
              O prémio de quem indicou é emitido e fica registado no extrato.
            </p>
          </div>
        </CardContent>
      </Card>

      {loadError && !schemaMissing ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm">
          <span>Não foi possível carregar as indicações: {loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <div className="border-border grid gap-3 rounded-md border p-3 lg:grid-cols-[minmax(260px,1fr)_200px_220px]">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar amigo, cliente, telefone ou código..."
            className="pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="all">Todos os estados</option>
          {Object.entries(STATUS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={rewardFilter}
          onChange={(event) => setRewardFilter(event.target.value)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="all">Todas as recompensas</option>
          <option value="pending">Aguardando emissão</option>
          <option value="credited">Crédito disponível</option>
          <option value="used">Crédito utilizado</option>
          <option value="reconcile">Exige conciliação</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      ) : schemaMissing ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-6 text-sm">
            Aplique as migrations <code>055</code> a <code>066</code> no
            Supabase para ativar o módulo completo de indicações.
          </CardContent>
        </Card>
      ) : filtered.length ? (
        <div className="space-y-3">
          {filtered.map((row) => {
            const publicUrl = `${account?.public_url?.replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '')}/refer/${row.code?.code}`;
            const appointmentId = [...(row.events ?? [])]
              .reverse()
              .find((event) => event.action === 'scheduled')?.metadata
              ?.appointment_id as string | undefined;
            return (
              <Card key={row.id} className="gap-0 py-0">
                <CardContent className="p-0">
                  <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto_1fr_auto] lg:items-center">
                    <Person
                      eyebrow="Quem indicou"
                      name={row.referrer?.name || row.referrer?.phone || '--'}
                      detail={row.referrer?.phone || ''}
                      href={
                        row.referrer?.id ? `/contacts/${row.referrer.id}` : null
                      }
                    />
                    <div className="text-muted-foreground hidden items-center gap-2 text-xs lg:flex">
                      <HeartHandshake className="size-4" /> indicou
                    </div>
                    <Person
                      eyebrow="Amigo"
                      name={row.friend?.name || row.friend_name}
                      detail={row.friend?.phone || row.friend_phone}
                      href={
                        row.friend?.id ? `/contacts/${row.friend.id}` : null
                      }
                    />
                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      <StatusBadge status={row.status} />
                      <span className="text-muted-foreground text-xs">
                        {new Date(row.created_at).toLocaleDateString('pt-PT')}
                      </span>
                    </div>
                  </div>

                  <div className="border-border bg-muted/20 grid gap-3 border-t p-4 lg:grid-cols-[minmax(180px,0.6fr)_minmax(460px,2fr)_auto] lg:items-start">
                    <div className="flex min-w-0 items-center gap-2">
                      <code className="bg-background truncate rounded border px-2 py-1 text-xs">
                        {row.code?.code || '--'}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Copiar link"
                        onClick={() => {
                          void navigator.clipboard.writeText(publicUrl);
                          toast.success('Link copiado.');
                        }}
                      >
                        <Copy />
                      </Button>
                      <a
                        className={buttonVariants({
                          size: 'icon',
                          variant: 'ghost',
                        })}
                        title="Abrir link"
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink />
                      </a>
                    </div>
                    <div className="grid gap-2 xl:grid-cols-2">
                      {(row.rewards ?? []).length ? (
                        row.rewards?.map((reward) => (
                          <RewardCard
                            key={reward.id}
                            reward={reward}
                            currency={defaultCurrency}
                            contactId={
                              reward.beneficiary_type === 'referrer'
                                ? row.referrer?.id
                                : row.friend?.id
                            }
                            canIssue={canSendMessages}
                            canReverse={canEditSettings}
                            working={workingId === reward.id}
                            onIssue={() => void issueReward(reward)}
                            onReverse={() => {
                              setReverseReward(reward);
                              setReverseReason('');
                            }}
                          />
                        ))
                      ) : (
                        <div className="space-y-2">
                          <p className="text-muted-foreground text-xs">
                            {row.metadata?.reward_limit_reached
                              ? 'Limite de recompensas deste cliente atingido.'
                              : ['qualified', 'rewarded'].includes(row.status)
                                ? 'Esta indicação foi qualificada sem gerar as recompensas. Reconstrua-a com as regras atuais.'
                                : 'Aguardando qualificação para gerar recompensas.'}
                          </p>
                          {['qualified', 'rewarded'].includes(row.status) &&
                          !row.metadata?.reward_limit_reached &&
                          canSendMessages ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={workingId === row.id}
                              onClick={() => void reconcileRewards(row.id)}
                            >
                              {workingId === row.id ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <RefreshCw />
                              )}
                              Corrigir recompensas
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </div>
                    {!['rejected', 'rewarded'].includes(row.status) &&
                    canSendMessages ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        {row.status === 'registered' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void markContacted(row.id)}
                            disabled={workingId === row.id}
                          >
                            <CheckCircle2 /> Contactado
                          </Button>
                        ) : null}
                        {row.friend?.id ? (
                          <Link
                            href={
                              appointmentId
                                ? `/agenda?appointment=${appointmentId}`
                                : `/agenda?contact=${row.friend.id}&referral=${row.id}`
                            }
                            className={buttonVariants({
                              size: 'sm',
                              variant: 'outline',
                            })}
                          >
                            <CalendarPlus />
                            {appointmentId ? 'Ver marcação' : 'Agendar'}
                          </Link>
                        ) : null}
                        {['registered', 'contacted', 'scheduled'].includes(
                          row.status
                        ) ? (
                          <Button
                            size="sm"
                            onClick={() => void manageReferral(row.id)}
                            disabled={workingId === row.id}
                          >
                            <CheckCircle2 /> Qualificar
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setLostReferral(row);
                            setLostReasonCode('');
                            setLostReason('');
                          }}
                          disabled={workingId === row.id}
                        >
                          <UserX /> Não qualificar
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {row.status === 'rejected' ? (
                    <div className="border-border bg-destructive/5 text-destructive border-t px-4 py-3 text-xs">
                      <span className="font-semibold">Não qualificada:</span>{' '}
                      {row.rejection_code
                        ? DISQUALIFICATION_REASONS[
                            row.rejection_code as keyof typeof DISQUALIFICATION_REASONS
                          ] || row.rejection_code
                        : 'motivo não informado'}
                      {row.rejection_reason ? ` · ${row.rejection_reason}` : ''}
                    </div>
                  ) : null}
                  {(row.events ?? []).length ? (
                    <details className="border-border border-t px-4 py-3 text-xs">
                      <summary className="cursor-pointer font-medium">
                        Histórico da indicação ({row.events?.length})
                      </summary>
                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {[...(row.events ?? [])]
                          .sort(
                            (a, b) =>
                              new Date(b.created_at).getTime() -
                              new Date(a.created_at).getTime()
                          )
                          .map((event) => (
                            <div
                              key={event.id}
                              className="bg-muted/40 rounded-md px-3 py-2"
                            >
                              <div className="flex justify-between gap-2">
                                <span className="font-semibold">
                                  {eventLabel(event.action)}
                                </span>
                                <span className="text-muted-foreground">
                                  {new Date(event.created_at).toLocaleString(
                                    'pt-PT',
                                    {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )}
                                </span>
                              </div>
                              {event.reason ? (
                                <p className="text-muted-foreground mt-1">
                                  {event.reason}
                                </p>
                              ) : null}
                              {typeof event.metadata?.appointment_id ===
                              'string' ? (
                                <Link
                                  href={`/agenda?appointment=${event.metadata.appointment_id}`}
                                  className="text-primary mt-1 inline-flex font-medium"
                                >
                                  Abrir marcação
                                </Link>
                              ) : null}
                            </div>
                          ))}
                      </div>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="border-border flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed text-center">
          <HeartHandshake className="text-muted-foreground size-8" />
          <p className="mt-3 font-semibold">Nenhuma indicação encontrada</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Os clientes ganharão links individuais no Cliente 360.
          </p>
        </div>
      )}

      <Dialog
        open={Boolean(lostReferral)}
        onOpenChange={(open) => {
          if (!open) {
            setLostReferral(null);
            setLostReasonCode('');
            setLostReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Marcar como não qualificada</DialogTitle>
            <DialogDescription>
              A indicação de {lostReferral?.friend_name} será encerrada e
              recompensas pendentes serão canceladas. Saldos já emitidos não são
              removidos automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="lost-reason-code">
                Motivo da não qualificação
              </label>
              <select
                id="lost-reason-code"
                value={lostReasonCode}
                onChange={(event) => setLostReasonCode(event.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">Selecione um motivo</option>
                {Object.entries(DISQUALIFICATION_REASONS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="lost-reason">
                Observação{' '}
                {lostReasonCode === 'other' ? '(obrigatória)' : '(opcional)'}
              </label>
              <Textarea
                id="lost-reason"
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
                placeholder="Registe detalhes úteis para o histórico..."
                className="min-h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostReferral(null)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void markLost()}
              disabled={
                !lostReasonCode ||
                (lostReasonCode === 'other' && !lostReason.trim()) ||
                workingId === lostReferral?.id
              }
            >
              <UserX /> Confirmar não qualificação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reverseReward)}
        onOpenChange={(open) => {
          if (!open) {
            setReverseReward(null);
            setReverseReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Anular recompensa emitida</DialogTitle>
            <DialogDescription>
              O sistema reverte o cartão-saldo ou cancela o voucher apenas se o
              benefício ainda não tiver sido utilizado. A operação fica no
              histórico da indicação e da carteira.
            </DialogDescription>
          </DialogHeader>
          {reverseReward?.reward_type === 'fixed_credit' ? (
            <div className="bg-muted grid grid-cols-2 gap-3 rounded-md p-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Crédito lançado</p>
                <p className="font-semibold">
                  {formatCurrency(
                    Number(reverseReward.credited_amount ?? 0),
                    reverseReward.wallet?.currency || defaultCurrency
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">
                  Ainda disponível
                </p>
                <p className="font-semibold">
                  {formatCurrency(
                    Number(reverseReward.available_amount ?? 0),
                    reverseReward.wallet?.currency || defaultCurrency
                  )}
                </p>
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="reverse-reason">
              Motivo da anulação
            </label>
            <Textarea
              id="reverse-reason"
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              placeholder="Ex.: indicação duplicada confirmada pela equipa"
              className="min-h-24"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseReward(null)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void reverseIssuedReward()}
              disabled={
                !reverseReason.trim() || workingId === reverseReward?.id
              }
            >
              <RotateCcw /> Anular e auditar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          {label} <Icon className="size-4" />
        </div>
        <p className="mt-2 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Person({
  eyebrow,
  name,
  detail,
  href,
}: {
  eyebrow: string;
  name: string;
  detail: string;
  href: string | null;
}) {
  const content = (
    <>
      <span className="text-muted-foreground block text-[10px] font-semibold uppercase">
        {eyebrow}
      </span>
      <span className="mt-0.5 block truncate text-sm font-semibold">
        {name}
      </span>
      <span className="text-muted-foreground block text-xs">{detail}</span>
    </>
  );
  return href ? (
    <Link href={href} className="hover:text-primary min-w-0">
      {content}
    </Link>
  ) : (
    <div className="min-w-0">{content}</div>
  );
}

function StatusBadge({ status }: { status: Referral['status'] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === 'qualified' && 'border-emerald-500/40 text-emerald-700',
        status === 'contacted' && 'border-sky-500/40 text-sky-700',
        status === 'scheduled' && 'border-amber-500/40 text-amber-700',
        status === 'rewarded' && 'border-violet-500/40 text-violet-700',
        status === 'rejected' && 'border-red-500/40 text-red-700'
      )}
    >
      {STATUS[status]}
    </Badge>
  );
}

function eventLabel(action: string) {
  return (
    {
      created: 'Indicação criada',
      contacted: 'Cliente contactado',
      scheduled: 'Agendamento criado',
      qualified: 'Indicação qualificada',
      reward_issued: 'Recompensa emitida',
      reward_redeemed: 'Recompensa utilizada',
      reward_reversed: 'Recompensa anulada',
      lost: 'Cliente desistiu',
      not_qualified: 'Indicação não qualificada',
      note: 'Observação',
    }[action] ?? action
  );
}

function RewardCard({
  reward,
  currency,
  contactId,
  canIssue,
  canReverse,
  working,
  onIssue,
  onReverse,
}: {
  reward: Reward;
  currency: string;
  contactId?: string;
  canIssue: boolean;
  canReverse: boolean;
  working: boolean;
  onIssue: () => void;
  onReverse: () => void;
}) {
  const credited = Number(reward.credited_amount ?? 0);
  const available = Number(reward.available_amount ?? 0);
  const isCredit = reward.reward_type === 'fixed_credit';
  const isWalletCredit =
    isCredit &&
    (reward.beneficiary_type === 'referrer' ||
      Boolean(reward.issued_wallet_id) ||
      reward.metadata?.wallet_credit === true);
  const isUnreconciled =
    isWalletCredit && reward.status === 'issued' && !reward.issued_wallet_id;
  const wasUsed = isWalletCredit && credited > 0 && available < credited;
  const canReverseReward =
    reward.status === 'issued' &&
    (!isCredit || (!isUnreconciled && credited > 0 && !wasUsed));

  return (
    <div className="border-border bg-background min-w-0 rounded-md border p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
            {isWalletCredit ? (
              <WalletCards className="size-3.5" />
            ) : (
              <Gift className="size-3.5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">
              {reward.beneficiary_type === 'referrer'
                ? 'Recompensa de quem indicou'
                : 'Benefício do novo cliente'}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate">
              {rewardLabel(reward, currency)}
            </p>
          </div>
        </div>
        <Badge
          variant={
            isUnreconciled
              ? 'destructive'
              : reward.status === 'issued'
                ? 'default'
                : 'outline'
          }
        >
          {isUnreconciled ? 'Não conciliado' : rewardStatusLabel(reward.status)}
        </Badge>
      </div>

      {isWalletCredit && reward.status !== 'pending' ? (
        <div className="bg-muted/50 mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-md text-center">
          <RewardAmount
            label="Creditado"
            value={formatCurrency(
              credited,
              reward.wallet?.currency || currency
            )}
          />
          <RewardAmount
            label="Disponível"
            value={formatCurrency(
              available,
              reward.wallet?.currency || currency
            )}
          />
          <RewardAmount
            label="Utilizado"
            value={formatCurrency(
              Math.max(credited - available, 0),
              reward.wallet?.currency || currency
            )}
          />
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {reward.status === 'pending' &&
        reward.beneficiary_type === 'referrer' &&
        canIssue ? (
          <Button
            size="sm"
            variant="outline"
            disabled={working}
            onClick={onIssue}
          >
            {working ? <Loader2 className="animate-spin" /> : <WalletCards />}
            {isWalletCredit ? 'Creditar cartão-saldo' : 'Emitir voucher'}
          </Button>
        ) : null}
        {reward.status === 'pending' && reward.beneficiary_type === 'friend' ? (
          <span className="text-muted-foreground">
            Aplicado automaticamente na marcação
          </span>
        ) : null}
        {reward.wallet && contactId ? (
          <Link
            href={`/contacts/${contactId}?tab=finance`}
            className="text-primary inline-flex items-center gap-1 font-medium"
          >
            Ver cartão-saldo total:{' '}
            {formatCurrency(
              Number(reward.wallet.balance),
              reward.wallet.currency
            )}
          </Link>
        ) : null}
        {reward.voucher && contactId ? (
          <Link
            href={`/contacts/${contactId}?tab=finance`}
            className="text-primary inline-flex items-center gap-1 font-medium"
          >
            Voucher {reward.voucher.code}
          </Link>
        ) : null}
        {reward.status === 'issued' && canReverse ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={!canReverseReward}
            title={
              isUnreconciled
                ? 'Aplique a migration 066 para conciliar este crédito.'
                : wasUsed
                  ? 'Créditos já utilizados não podem ser anulados.'
                  : 'Anular recompensa'
            }
            onClick={onReverse}
          >
            <RotateCcw /> Anular
          </Button>
        ) : null}
      </div>
      {wasUsed ? (
        <p className="text-muted-foreground mt-2">
          Esta recompensa já foi utilizada total ou parcialmente no POS.
        </p>
      ) : null}
    </div>
  );
}

function RewardAmount({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 px-2 py-2">
      <p className="text-muted-foreground text-[10px] uppercase">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

function referralErrorMessage(message: string) {
  if (message.includes('schema cache') || message.includes('Could not find')) {
    return 'A migration 066 ainda não foi aplicada ou o schema do Supabase não foi recarregado.';
  }
  if (
    message.includes('already been used') ||
    message.includes('already been used in full')
  ) {
    return 'Este crédito já foi utilizado total ou parcialmente e não pode ser anulado.';
  }
  if (message.includes('wallet balance is insufficient')) {
    return 'O cartão-saldo atual não possui valor suficiente para reverter esta recompensa.';
  }
  if (message.includes('run wallet reconciliation')) {
    return 'Este crédito antigo ainda não foi conciliado. Aplique a migration 066.';
  }
  if (
    message.includes('Reward has already') ||
    message.includes('can no longer')
  ) {
    return 'Esta recompensa já foi processada e não aceita essa operação.';
  }
  return message;
}

function rewardLabel(reward: Reward, currency: string) {
  if (reward.reward_type === 'fixed_credit')
    return formatCurrency(Number(reward.reward_value), currency);
  if (reward.reward_type === 'percentage') return `${reward.reward_value}%`;
  return reward.service?.name || 'Procedimento';
}

function rewardStatusLabel(status: Reward['status']) {
  return {
    pending: 'Pendente',
    issued: 'Emitida',
    redeemed: 'Utilizada',
    cancelled: 'Cancelada',
  }[status];
}
