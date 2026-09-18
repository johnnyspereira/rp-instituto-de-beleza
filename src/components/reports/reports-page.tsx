'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeEuro,
  Banknote,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  CircleAlert,
  Clock3,
  CreditCard,
  Download,
  Gift,
  Inbox,
  Loader2,
  Megaphone,
  MessageSquare,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  WalletCards,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import {
  average,
  csvCell,
  enumerateDayKeys,
  firstResponseMinutes,
  localDayKey,
  percentageChange,
  previousPeriod,
  safeRate,
  workSessionMinutes,
} from '@/lib/reports/analytics';
import { createClient } from '@/lib/supabase/client';
import type {
  FinanceBenefitLog,
  FinanceCashMovement,
  FinanceClientPack,
  FinancePayment,
  FinanceSale,
  FinanceVoucher,
} from '@/types';

type MaybeArray<T> = T | T[] | null | undefined;
type NamedRelation = {
  id?: string;
  name?: string | null;
  phone?: string | null;
};
type ProfileRelation = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
};

type SaleRow = FinanceSale & {
  contact?: MaybeArray<NamedRelation>;
};

type AppointmentRow = {
  id: string;
  contact_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  source: string;
  price: number;
  currency: string;
  paid_at: string | null;
  arrived_at: string | null;
  reschedule_count: number | null;
  referral_id: string | null;
  contact: MaybeArray<NamedRelation>;
  service: MaybeArray<NamedRelation>;
  professional: MaybeArray<ProfileRelation>;
  room: MaybeArray<NamedRelation>;
  benefits: Array<{ benefit_type: string; status: string }> | null;
};

type ContactRow = {
  id: string;
  name: string | null;
  phone: string;
  client_reference: string | null;
  created_at: string;
};

type ConversationRow = {
  id: string;
  contact_id: string;
  status: string;
  assigned_agent_id: string | null;
  unread_count: number | null;
  last_message_at: string | null;
  contact: MaybeArray<NamedRelation>;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_type: string;
  status: string;
  created_at: string;
};

type ReferralRow = {
  id: string;
  referrer_contact_id: string;
  friend_contact_id: string | null;
  friend_name: string;
  friend_phone: string;
  status: string;
  created_at: string;
  qualified_at: string | null;
  rewarded_at: string | null;
  referrer: MaybeArray<NamedRelation>;
};

type RewardRow = {
  id: string;
  referral_id: string;
  beneficiary_type: string;
  reward_type: string;
  reward_value: number;
  status: string;
  issued_at: string | null;
  redeemed_at: string | null;
  created_at: string;
};

type AutomationLogRow = {
  id: string;
  automation_id: string;
  status: string;
  trigger_event: string;
  created_at: string;
  automation: MaybeArray<{ name?: string | null }>;
};

type BroadcastRow = {
  id: string;
  name: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
  created_at: string;
};

type DealRow = {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  contact: MaybeArray<NamedRelation>;
  stage: MaybeArray<{ name?: string | null; color?: string | null }>;
  pipeline: MaybeArray<{ name?: string | null }>;
};

type WorkSessionRow = {
  id: string;
  user_id: string;
  work_date: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  last_active_at: string | null;
  breaks: Array<{
    id: string;
    reason: string;
    started_at: string;
    ended_at: string | null;
  }> | null;
};

type WalletRow = {
  id: string;
  contact_id: string;
  currency: string;
  balance: number;
  contact: MaybeArray<NamedRelation>;
};

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_professional: boolean | null;
};

type DeliveryState = {
  sent?: boolean;
  skipped?: boolean;
  error?: string | null;
};

type CommunicationEventRow = {
  id: string;
  entity_id: string;
  reason: string | null;
  created_at: string;
  metadata: {
    message_action?: string;
    status?: string | null;
    recipient?: { name?: string; phone?: string; email?: string };
    deliveries?: { whatsapp?: DeliveryState; email?: DeliveryState };
  } | null;
};

type ReportData = {
  sales: SaleRow[];
  payments: FinancePayment[];
  paymentLinks: Array<{ id: string; provider: string; status: string; amount: number; currency: string; paid_at: string | null; created_at: string }>;
  cashMovements: FinanceCashMovement[];
  appointments: AppointmentRow[];
  contacts: ContactRow[];
  conversations: ConversationRow[];
  messages: MessageRow[];
  referrals: ReferralRow[];
  rewards: RewardRow[];
  automationLogs: AutomationLogRow[];
  broadcasts: BroadcastRow[];
  deals: DealRow[];
  workSessions: WorkSessionRow[];
  profiles: ProfileRow[];
  vouchers: FinanceVoucher[];
  packs: FinanceClientPack[];
  benefitLogs: FinanceBenefitLog[];
  wallets: WalletRow[];
  communicationEvents: CommunicationEventRow[];
  warnings: string[];
};

type ReportTab =
  | 'overview'
  | 'finance'
  | 'agenda'
  | 'communications'
  | 'clients'
  | 'inbox'
  | 'growth'
  | 'team';

const EMPTY_DATA: ReportData = {
  sales: [],
  payments: [],
  paymentLinks: [],
  cashMovements: [],
  appointments: [],
  contacts: [],
  conversations: [],
  messages: [],
  referrals: [],
  rewards: [],
  automationLogs: [],
  broadcasts: [],
  deals: [],
  workSessions: [],
  profiles: [],
  vouchers: [],
  packs: [],
  benefitLogs: [],
  wallets: [],
  communicationEvents: [],
  warnings: [],
};

const CHART_COLORS = [
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
  '#8b5cf6',
  '#64748b',
];
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  card: 'Cartão',
  mb_way: 'MB Way',
  multibanco: 'Multibanco',
  bank_transfer: 'Transferência',
  voucher: 'Voucher',
  client_credit: 'Cartão-saldo',
  other: 'Outro',
};

function firstDayOfMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  return localDayKey(new Date());
}

function one<T>(value: MaybeArray<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function inPeriod(
  value: string | null | undefined,
  start: string,
  end: string
) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= new Date(start).getTime() && time <= new Date(end).getTime();
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    open: 'Aberto',
    partially_paid: 'Parcial',
    paid: 'Pago',
    voided: 'Anulado',
    refunded: 'Reembolsado',
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    completed: 'Concluído',
    cancelled: 'Cancelado',
    no_show: 'Faltou',
    pending: 'Pendente',
    sent: 'Enviada',
    delivered: 'Entregue',
    read: 'Lida',
    failed: 'Falhou',
    registered: 'Cadastrado',
    contacted: 'Contactado',
    qualified: 'Qualificado',
    rewarded: 'Premiado',
    rejected: 'Não qualificado',
    won: 'Ganho',
    lost: 'Perdido',
    success: 'Sucesso',
    partial: 'Parcial',
  };
  return labels[status] ?? status;
}

function communicationActionLabel(action?: string) {
  const labels: Record<string, string> = {
    reminder: 'Lembrança',
    confirmation: 'Confirmação',
    schedule_change_confirmation: 'Confirmação de mudança',
    appointment_completed: 'Marcação concluída',
    feedback_request: 'Pedido de feedback',
  };
  return labels[action ?? ''] ?? action ?? '—';
}

function DeliveryBadge({ delivery }: { delivery?: DeliveryState }) {
  if (!delivery) return '—';
  if (delivery.error) return `Erro: ${delivery.error}`;
  if (delivery.skipped) return 'Ignorada';
  if (delivery.sent) return 'Enviada';
  return '—';
}

function formatMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 min';
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function reportPreset(key: 'today' | '7d' | '30d' | 'month' | 'quarter'): {
  from: string;
  to: string;
} {
  const end = new Date();
  const start = new Date();
  if (key === 'today') return { from: today(), to: today() };
  if (key === 'month') return { from: firstDayOfMonth(), to: today() };
  if (key === 'quarter') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  } else {
    start.setDate(start.getDate() - (key === '7d' ? 6 : 29));
  }
  return { from: localDayKey(start), to: localDayKey(end) };
}

export function ReportsPage() {
  const { accountId, defaultCurrency, profileLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [from, setFrom] = useState(firstDayOfMonth);
  const [to, setTo] = useState(today);
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData>(EMPTY_DATA);

  const range = useMemo(() => previousPeriod(from, to), [from, to]);

  const loadReports = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);

    const queries = [
      supabase
        .from('finance_sales')
        .select(
          '*, contact:contacts(id,name,phone), items:finance_sale_items(*), payments:finance_payments(*)'
        )
        .eq('account_id', accountId)
        .gte('created_at', range.previousStart)
        .lte('created_at', range.currentEnd)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('finance_payments')
        .select('*')
        .eq('account_id', accountId)
        .gte('paid_at', range.previousStart)
        .lte('paid_at', range.currentEnd)
        .order('paid_at', { ascending: false })
        .limit(5000),
      supabase
        .from('finance_cash_movements')
        .select('*')
        .eq('account_id', accountId)
        .gte('created_at', range.currentStart)
        .lte('created_at', range.currentEnd)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('clinic_appointments')
        .select(
          'id, contact_id, scheduled_start, scheduled_end, status, source, price, currency, paid_at, arrived_at, reschedule_count, referral_id, contact:contacts(id,name,phone), service:clinic_services(id,name), professional:profiles!clinic_appointments_professional_profile_id_fkey(id,full_name,email), room:clinic_rooms(id,name), benefits:finance_appointment_benefits(benefit_type,status)'
        )
        .eq('account_id', accountId)
        .gte('scheduled_start', range.previousStart)
        .lte('scheduled_start', range.currentEnd)
        .order('scheduled_start', { ascending: false })
        .limit(5000),
      supabase
        .from('contacts')
        .select('id,name,phone,client_reference,created_at')
        .eq('account_id', accountId)
        .lte('created_at', range.currentEnd)
        .order('created_at', { ascending: false })
        .limit(10000),
      supabase
        .from('conversations')
        .select(
          'id,contact_id,status,assigned_agent_id,unread_count,last_message_at,contact:contacts(id,name,phone)'
        )
        .eq('account_id', accountId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(5000),
      supabase
        .from('messages')
        // The local MySQL client scopes messages through their conversation.
        // It cannot filter using PostgREST's nested `conversation.account_id`
        // syntax, which is not a real MySQL column.
        .select('id,conversation_id,sender_type,status,created_at')
        .gte('created_at', range.currentStart)
        .lte('created_at', range.currentEnd)
        .order('created_at')
        .limit(10000),
      supabase
        .from('referrals')
        .select(
          'id,referrer_contact_id,friend_contact_id,friend_name,friend_phone,status,created_at,qualified_at,rewarded_at,referrer:contacts!referrals_referrer_contact_id_fkey(id,name,phone)'
        )
        .eq('account_id', accountId)
        .gte('created_at', range.previousStart)
        .lte('created_at', range.currentEnd)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('referral_rewards')
        .select(
          'id,referral_id,beneficiary_type,reward_type,reward_value,status,issued_at,redeemed_at,created_at'
        )
        .eq('account_id', accountId)
        .gte('created_at', range.previousStart)
        .lte('created_at', range.currentEnd)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('automation_logs')
        .select(
          'id,automation_id,status,trigger_event,created_at,automation:automations(name)'
        )
        .eq('account_id', accountId)
        .gte('created_at', range.currentStart)
        .lte('created_at', range.currentEnd)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('broadcasts')
        .select(
          'id,name,status,total_recipients,sent_count,delivered_count,read_count,replied_count,failed_count,created_at'
        )
        .eq('account_id', accountId)
        .gte('created_at', range.currentStart)
        .lte('created_at', range.currentEnd)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('deals')
        .select(
          'id,title,value,currency,status,created_at,updated_at,contact:contacts(id,name,phone),stage:pipeline_stages(name,color),pipeline:pipelines(name)'
        )
        .eq('account_id', accountId)
        .lte('created_at', range.currentEnd)
        .order('updated_at', { ascending: false })
        .limit(5000),
      supabase
        .from('work_sessions')
        .select(
          'id,user_id,work_date,status,started_at,ended_at,last_active_at,breaks:work_breaks(id,reason,started_at,ended_at)'
        )
        .eq('account_id', accountId)
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date', { ascending: false })
        .limit(5000),
      supabase
        .from('profiles')
        .select('id,user_id,full_name,email,is_professional')
        .eq('account_id', accountId)
        .limit(500),
      supabase
        .from('finance_vouchers')
        .select(
          '*, owner:contacts(id,name,phone), service:clinic_services(id,name)'
        )
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('finance_client_packs')
        .select(
          '*, contact:contacts(id,name,phone), pack:finance_pack_catalog(*), balances:finance_client_pack_balances(*, service:clinic_services(*))'
        )
        .eq('account_id', accountId)
        .order('purchased_at', { ascending: false })
        .limit(5000),
      supabase
        .from('finance_benefit_logs')
        .select(
          '*, appointment:clinic_appointments(id,scheduled_start,service:clinic_services(name),contact:contacts(name,phone))'
        )
        .eq('account_id', accountId)
        .gte('created_at', range.currentStart)
        .lte('created_at', range.currentEnd)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('finance_client_wallets')
        .select(
          'id,contact_id,currency,balance,contact:contacts(id,name,phone)'
        )
        .eq('account_id', accountId)
        .order('balance', { ascending: false })
        .limit(5000),
      supabase
        .from('clinic_agenda_events')
        .select('id,entity_id,reason,metadata,created_at')
        .eq('account_id', accountId)
        .eq('entity_type', 'appointment')
        .eq('action', 'message_sent')
        .gte('created_at', range.currentStart)
        .lte('created_at', range.currentEnd)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('finance_payment_links')
        .select('id,provider,status,amount,currency,paid_at,created_at')
        .eq('account_id', accountId)
        .gte('created_at', range.previousStart)
        .lte('created_at', range.currentEnd)
        .order('created_at', { ascending: false })
        .limit(5000),
    ] as const;

    const results = await Promise.all(queries);
    const labels = [
      'vendas',
      'pagamentos',
      'caixa',
      'agenda',
      'clientes',
      'inbox',
      'mensagens',
      'indicações',
      'recompensas',
      'automações',
      'campanhas',
      'comercial',
      'jornada',
      'equipe',
      'vouchers',
      'packs',
      'benefícios',
      'cartão-saldo',
      'comunicações',
    ];
    const warnings = results.flatMap((result, index) =>
      result.error ? [`${labels[index]}: ${result.error.message}`] : []
    );

    setData({
      sales: (results[0].data ?? []) as unknown as SaleRow[],
      payments: (results[1].data ?? []) as FinancePayment[],
      cashMovements: (results[2].data ?? []) as FinanceCashMovement[],
      appointments: (results[3].data ?? []) as unknown as AppointmentRow[],
      contacts: (results[4].data ?? []) as ContactRow[],
      conversations: (results[5].data ?? []) as unknown as ConversationRow[],
      messages: (results[6].data ?? []) as unknown as MessageRow[],
      referrals: (results[7].data ?? []) as unknown as ReferralRow[],
      rewards: (results[8].data ?? []) as RewardRow[],
      automationLogs: (results[9].data ?? []) as unknown as AutomationLogRow[],
      broadcasts: (results[10].data ?? []) as BroadcastRow[],
      deals: (results[11].data ?? []) as unknown as DealRow[],
      workSessions: (results[12].data ?? []) as unknown as WorkSessionRow[],
      profiles: (results[13].data ?? []) as ProfileRow[],
      vouchers: (results[14].data ?? []) as unknown as FinanceVoucher[],
      packs: (results[15].data ?? []) as unknown as FinanceClientPack[],
      benefitLogs: (results[16].data ?? []) as unknown as FinanceBenefitLog[],
      wallets: (results[17].data ?? []) as unknown as WalletRow[],
      communicationEvents: (results[18].data ?? []) as CommunicationEventRow[],
      paymentLinks: (results[19].data ?? []) as ReportData['paymentLinks'],
      warnings,
    });
    if (warnings.length) {
      toast.warning(`${warnings.length} área(s) do relatório não responderam.`);
    }
    setLoading(false);
  }, [accountId, from, range, supabase, to]);

  useEffect(() => {
    if (profileLoading) return;
    const timer = window.setTimeout(() => void loadReports(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReports, profileLoading]);

  const analytics = useMemo(() => {
    const validCurrentSales = data.sales.filter(
      (sale) =>
        inPeriod(sale.created_at, range.currentStart, range.currentEnd) &&
        !['voided', 'refunded'].includes(sale.status)
    );
    const validPreviousSales = data.sales.filter(
      (sale) =>
        inPeriod(sale.created_at, range.previousStart, range.previousEnd) &&
        !['voided', 'refunded'].includes(sale.status)
    );
    // A retroactive sale is audit evidence, not turnover or cash generated by
    // this CRM period. Keep it in its own list below.
    const currentSales = validCurrentSales.filter((sale) => !sale.is_historical);
    const historicalSales = validCurrentSales.filter((sale) => sale.is_historical);
    const previousSales = validPreviousSales.filter((sale) => !sale.is_historical);
    const currentPayments = data.payments.filter(
      (payment) =>
        payment.status === 'confirmed' &&
        inPeriod(payment.paid_at, range.currentStart, range.currentEnd)
    );
    const previousPayments = data.payments.filter(
      (payment) =>
        payment.status === 'confirmed' &&
        inPeriod(payment.paid_at, range.previousStart, range.previousEnd)
    );
    const currentAppointments = data.appointments.filter((item) =>
      inPeriod(item.scheduled_start, range.currentStart, range.currentEnd)
    );
    const previousAppointments = data.appointments.filter((item) =>
      inPeriod(item.scheduled_start, range.previousStart, range.previousEnd)
    );
    const newContacts = data.contacts.filter((item) =>
      inPeriod(item.created_at, range.currentStart, range.currentEnd)
    );
    const previousContacts = data.contacts.filter((item) =>
      inPeriod(item.created_at, range.previousStart, range.previousEnd)
    );
    const currentReferrals = data.referrals.filter((item) =>
      inPeriod(item.created_at, range.currentStart, range.currentEnd)
    );
    const previousReferrals = data.referrals.filter((item) =>
      inPeriod(item.created_at, range.previousStart, range.previousEnd)
    );
    const received = currentPayments.reduce(
      (sum, item) => sum + numberValue(item.amount),
      0
    );
    const previousReceived = previousPayments.reduce(
      (sum, item) => sum + numberValue(item.amount),
      0
    );
    const billed = currentSales.reduce(
      (sum, item) => sum + numberValue(item.total_amount),
      0
    );
    const previousBilled = previousSales.reduce(
      (sum, item) => sum + numberValue(item.total_amount),
      0
    );
    const due = currentSales.reduce(
      (sum, item) => sum + numberValue(item.balance_due),
      0
    );
    const discounts = currentSales.reduce(
      (sum, item) => sum + numberValue(item.discount_amount),
      0
    );
    const taxes = currentSales.reduce(
      (sum, item) => sum + numberValue(item.tax_amount),
      0
    );
    const historicalTotal = historicalSales.reduce(
      (sum, item) => sum + numberValue(item.total_amount),
      0
    );
    const completed = currentAppointments.filter(
      (item) => item.status === 'completed'
    );
    const attended = currentAppointments.filter((item) =>
      ['completed', 'confirmed'].includes(item.status)
    );
    const cancelled = currentAppointments.filter(
      (item) => item.status === 'cancelled'
    );
    const noShows = currentAppointments.filter(
      (item) => item.status === 'no_show'
    );
    const previousCompleted = previousAppointments.filter(
      (item) => item.status === 'completed'
    );
    const responseSamples = firstResponseMinutes(data.messages);
    const activeClientIds = new Set(
      [
        ...currentSales.map((sale) => sale.contact_id),
        ...currentAppointments.map((item) => item.contact_id),
      ].filter((id): id is string => Boolean(id))
    );
    const activityCountByClient = new Map<string, number>();
    for (const id of [
      ...currentSales.map((sale) => sale.contact_id),
      ...currentAppointments.map((item) => item.contact_id),
    ]) {
      if (id)
        activityCountByClient.set(id, (activityCountByClient.get(id) ?? 0) + 1);
    }

    const paymentMethods = Object.entries(
      currentPayments.reduce<Record<string, number>>((totals, payment) => {
        totals[payment.method] =
          (totals[payment.method] ?? 0) + numberValue(payment.amount);
        return totals;
      }, {})
    )
      .map(([method, value]) => ({
        name: PAYMENT_LABELS[method] ?? method,
        value,
      }))
      .sort((left, right) => right.value - left.value);

    const sumUpLinkIds = new Set(
      data.paymentLinks
        .filter((link) => link.provider === 'sumup' && link.status === 'paid')
        .map((link) => link.id)
    );
    const sumUpPayments = currentPayments.filter((payment) =>
      sumUpLinkIds.has(payment.reference_code || '')
    );
    const sumUpReceived = sumUpPayments.reduce(
      (sum, payment) => sum + numberValue(payment.amount),
      0
    );

    const itemSales = new Map<
      string,
      { name: string; quantity: number; revenue: number; type: string }
    >();
    for (const sale of currentSales) {
      for (const item of sale.items ?? []) {
        const key = `${item.item_type}:${item.name_snapshot}`;
        const current = itemSales.get(key) ?? {
          name: item.name_snapshot,
          quantity: 0,
          revenue: 0,
          type: item.item_type,
        };
        current.quantity += numberValue(item.quantity);
        current.revenue += numberValue(item.line_total);
        itemSales.set(key, current);
      }
    }

    const serviceStats = new Map<
      string,
      {
        name: string;
        bookings: number;
        completed: number;
        noShow: number;
        revenue: number;
      }
    >();
    for (const appointment of currentAppointments) {
      const name = one(appointment.service)?.name || 'Sem serviço';
      const row = serviceStats.get(name) ?? {
        name,
        bookings: 0,
        completed: 0,
        noShow: 0,
        revenue: 0,
      };
      row.bookings += 1;
      if (appointment.status === 'completed') row.completed += 1;
      if (appointment.status === 'no_show') row.noShow += 1;
      if (!['cancelled', 'no_show'].includes(appointment.status)) {
        row.revenue += numberValue(appointment.price);
      }
      serviceStats.set(name, row);
    }

    const professionalStats = new Map<
      string,
      {
        name: string;
        bookings: number;
        completed: number;
        noShow: number;
        revenue: number;
      }
    >();
    for (const appointment of currentAppointments) {
      const professional = one(appointment.professional);
      const name =
        professional?.full_name || professional?.email || 'Sem profissional';
      const row = professionalStats.get(name) ?? {
        name,
        bookings: 0,
        completed: 0,
        noShow: 0,
        revenue: 0,
      };
      row.bookings += 1;
      if (appointment.status === 'completed') row.completed += 1;
      if (appointment.status === 'no_show') row.noShow += 1;
      if (!['cancelled', 'no_show'].includes(appointment.status)) {
        row.revenue += numberValue(appointment.price);
      }
      professionalStats.set(name, row);
    }

    const customerStats = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        sales: number;
        received: number;
        visits: number;
      }
    >();
    for (const sale of currentSales) {
      if (!sale.contact_id) continue;
      const contact = one(sale.contact);
      const row = customerStats.get(sale.contact_id) ?? {
        id: sale.contact_id,
        name: contact?.name || contact?.phone || 'Cliente',
        phone: contact?.phone || '',
        sales: 0,
        received: 0,
        visits: 0,
      };
      row.sales += numberValue(sale.total_amount);
      row.received += numberValue(sale.paid_amount);
      customerStats.set(sale.contact_id, row);
    }
    for (const appointment of completed) {
      if (!appointment.contact_id) continue;
      const contact = one(appointment.contact);
      const row = customerStats.get(appointment.contact_id) ?? {
        id: appointment.contact_id,
        name: contact?.name || contact?.phone || 'Cliente',
        phone: contact?.phone || '',
        sales: 0,
        received: 0,
        visits: 0,
      };
      row.visits += 1;
      customerStats.set(appointment.contact_id, row);
    }

    const dayMap = new Map(
      enumerateDayKeys(from, to).map((day) => [
        day,
        {
          day,
          label: new Date(`${day}T12:00:00`).toLocaleDateString('pt-PT', {
            day: '2-digit',
            month: 'short',
          }),
          revenue: 0,
          received: 0,
          appointments: 0,
          clients: 0,
          incoming: 0,
          outgoing: 0,
        },
      ])
    );
    for (const sale of currentSales) {
      const point = dayMap.get(localDayKey(sale.created_at));
      if (point) point.revenue += numberValue(sale.total_amount);
    }
    for (const payment of currentPayments) {
      const point = dayMap.get(localDayKey(payment.paid_at));
      if (point) point.received += numberValue(payment.amount);
    }
    for (const appointment of currentAppointments) {
      const point = dayMap.get(localDayKey(appointment.scheduled_start));
      if (point) point.appointments += 1;
    }
    for (const contact of newContacts) {
      const point = dayMap.get(localDayKey(contact.created_at));
      if (point) point.clients += 1;
    }
    for (const message of data.messages) {
      const point = dayMap.get(localDayKey(message.created_at));
      if (!point) continue;
      if (message.sender_type === 'customer') point.incoming += 1;
      else point.outgoing += 1;
    }

    const packTotals = data.packs
      .flatMap((pack) => pack.balances ?? [])
      .reduce(
        (total, balance) => ({
          purchased: total.purchased + numberValue(balance.total_sessions),
          used: total.used + numberValue(balance.used_sessions),
          remaining: total.remaining + numberValue(balance.remaining_sessions),
        }),
        { purchased: 0, used: 0, remaining: 0 }
      );
    const voucherBalance = data.vouchers
      .filter((voucher) => voucher.status === 'active')
      .reduce((sum, voucher) => sum + numberValue(voucher.current_balance), 0);
    const walletBalance = data.wallets.reduce(
      (sum, wallet) => sum + numberValue(wallet.balance),
      0
    );

    const profileByUser = new Map(
      data.profiles.map((profile) => [profile.user_id, profile])
    );
    const workByUser = new Map<
      string,
      {
        userId: string;
        name: string;
        sessions: number;
        minutes: number;
        breaks: number;
      }
    >();
    for (const session of data.workSessions) {
      const profile = profileByUser.get(session.user_id);
      const row = workByUser.get(session.user_id) ?? {
        userId: session.user_id,
        name: profile?.full_name || profile?.email || 'Membro',
        sessions: 0,
        minutes: 0,
        breaks: 0,
      };
      row.sessions += 1;
      row.minutes += workSessionMinutes(session);
      row.breaks += session.breaks?.length ?? 0;
      workByUser.set(session.user_id, row);
    }

    const confirmedBroadcastRecipients = data.broadcasts.reduce(
      (sum, item) => sum + numberValue(item.sent_count),
      0
    );
    const deliveredBroadcasts = data.broadcasts.reduce(
      (sum, item) => sum + numberValue(item.delivered_count),
      0
    );
    const readBroadcasts = data.broadcasts.reduce(
      (sum, item) => sum + numberValue(item.read_count),
      0
    );
    const repliedBroadcasts = data.broadcasts.reduce(
      (sum, item) => sum + numberValue(item.replied_count),
      0
    );

    return {
      currentSales,
      historicalSales,
      previousSales,
      currentPayments,
      currentAppointments,
      currentReferrals,
      received,
      billed,
      due,
      discounts,
      taxes,
      historicalTotal,
      averageTicket: currentSales.length ? billed / currentSales.length : 0,
      receivedChange: percentageChange(received, previousReceived),
      billedChange: percentageChange(billed, previousBilled),
      appointmentsChange: percentageChange(
        currentAppointments.length,
        previousAppointments.length
      ),
      completedChange: percentageChange(
        completed.length,
        previousCompleted.length
      ),
      contactsChange: percentageChange(
        newContacts.length,
        previousContacts.length
      ),
      referralsChange: percentageChange(
        currentReferrals.length,
        previousReferrals.length
      ),
      completed,
      attended,
      cancelled,
      noShows,
      newContacts,
      activeClientIds,
      recurringClients: Array.from(activityCountByClient.values()).filter(
        (count) => count > 1
      ).length,
      responseSamples,
      responseAverage: average(responseSamples),
      paymentMethods,
      sumUpPayments,
      sumUpReceived,
      itemSales: Array.from(itemSales.values()).sort(
        (a, b) => b.revenue - a.revenue
      ),
      serviceStats: Array.from(serviceStats.values()).sort(
        (a, b) => b.bookings - a.bookings
      ),
      professionalStats: Array.from(professionalStats.values()).sort(
        (a, b) => b.bookings - a.bookings
      ),
      customerStats: Array.from(customerStats.values()).sort(
        (a, b) => b.received - a.received
      ),
      daily: Array.from(dayMap.values()),
      packTotals,
      voucherBalance,
      walletBalance,
      workStats: Array.from(workByUser.values()).sort(
        (a, b) => b.minutes - a.minutes
      ),
      confirmedBroadcastRecipients,
      broadcastDeliveryRate: safeRate(
        deliveredBroadcasts,
        confirmedBroadcastRecipients
      ),
      broadcastReadRate: safeRate(readBroadcasts, deliveredBroadcasts),
      broadcastReplyRate: safeRate(repliedBroadcasts, deliveredBroadcasts),
      qualificationRate: safeRate(
        currentReferrals.filter((item) =>
          ['qualified', 'rewarded'].includes(item.status)
        ).length,
        currentReferrals.length
      ),
    };
  }, [data, from, range, to]);

  const communicationRows = useMemo(
    () =>
      data.communicationEvents.map((event) => ({
        ...event,
        whatsapp: event.metadata?.deliveries?.whatsapp,
        email: event.metadata?.deliveries?.email,
      })),
    [data.communicationEvents]
  );

  function applyPreset(key: 'today' | '7d' | '30d' | 'month' | 'quarter') {
    const preset = reportPreset(key);
    setFrom(preset.from);
    setTo(preset.to);
  }

  function exportCsv() {
    const rows = exportRows(activeTab, data, analytics, defaultCurrency);
    const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n');
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `relatorio-360-${activeTab}-${from}-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 p-3 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="text-primary size-5" />
            <h1 className="text-2xl font-semibold">Relatório 360</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Leitura executiva e operacional de todo o CRM, com origem
            rastreável.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void loadReports()}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Atualizar
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={loading}>
            <Download /> Exportar aba
          </Button>
        </div>
      </header>

      <section className="border-border bg-card flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="flex flex-wrap gap-1.5">
          <PresetButton label="Hoje" onClick={() => applyPreset('today')} />
          <PresetButton label="7 dias" onClick={() => applyPreset('7d')} />
          <PresetButton label="30 dias" onClick={() => applyPreset('30d')} />
          <PresetButton label="Este mês" onClick={() => applyPreset('month')} />
          <PresetButton
            label="Trimestre"
            onClick={() => applyPreset('quarter')}
          />
        </div>
        <ReportDate label="De" value={from} onChange={setFrom} />
        <ReportDate label="Até" value={to} onChange={setTo} />
        <div className="text-muted-foreground ml-auto pb-1 text-xs">
          Comparado ao período anterior de igual duração
        </div>
      </section>

      {data.warnings.length > 0 && (
        <details className="rounded-lg border border-amber-300/50 bg-amber-500/5 px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            <CircleAlert className="size-4" />
            {data.warnings.length} fonte(s) indisponível(is)
          </summary>
          <div className="text-muted-foreground mt-2 space-y-1 text-xs">
            {data.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </details>
      )}

      {loading ? (
        <div className="flex min-h-[55vh] items-center justify-center">
          <Loader2 className="text-primary size-7 animate-spin" />
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ReportTab)}
          className="gap-4"
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">
              <Activity /> Executivo
            </TabsTrigger>
            <TabsTrigger value="finance">
              <BadgeEuro /> Financeiro
            </TabsTrigger>
            <TabsTrigger value="agenda">
              <CalendarDays /> Agenda
            </TabsTrigger>
            <TabsTrigger value="communications">
              <MessageSquare /> Comunicações
            </TabsTrigger>
            <TabsTrigger value="clients">
              <Users /> Clientes
            </TabsTrigger>
            <TabsTrigger value="inbox">
              <Inbox /> Inbox
            </TabsTrigger>
            <TabsTrigger value="growth">
              <Zap /> Crescimento
            </TabsTrigger>
            <TabsTrigger value="team">
              <UserCheck /> Equipe e comercial
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={Banknote}
                label="Recebido"
                value={formatCurrency(analytics.received, defaultCurrency)}
                change={analytics.receivedChange}
                detail={`${analytics.currentPayments.length} pagamentos confirmados`}
                tone="emerald"
              />
              <MetricCard
                icon={ReceiptText}
                label="Faturado"
                value={formatCurrency(analytics.billed, defaultCurrency)}
                change={analytics.billedChange}
                detail={`Ticket médio ${formatCurrency(analytics.averageTicket, defaultCurrency)}`}
                tone="blue"
              />
              <MetricCard
                icon={CalendarCheck}
                label="Marcações"
                value={String(analytics.currentAppointments.length)}
                change={analytics.appointmentsChange}
                detail={`${safeRate(analytics.completed.length, analytics.currentAppointments.length).toFixed(0)}% concluídas`}
                tone="violet"
              />
              <MetricCard
                icon={Users}
                label="Novos clientes"
                value={String(analytics.newContacts.length)}
                change={analytics.contactsChange}
                detail={`${analytics.activeClientIds.size} clientes ativos no período`}
                tone="amber"
              />
              <MetricCard
                icon={CreditCard}
                label="Por receber"
                value={formatCurrency(analytics.due, defaultCurrency)}
                detail={`${analytics.currentSales.filter((sale) => sale.balance_due > 0).length} vendas com saldo`}
                tone="rose"
              />
              <MetricCard
                icon={MessageSquare}
                label="Tempo de resposta"
                value={formatMinutes(analytics.responseAverage)}
                detail={`${analytics.responseSamples.length} ciclos respondidos`}
                tone="slate"
              />
              <MetricCard
                icon={Gift}
                label="Benefícios disponíveis"
                value={formatCurrency(
                  analytics.voucherBalance + analytics.walletBalance,
                  defaultCurrency
                )}
                detail={`${analytics.packTotals.remaining} sessões de packs`}
                tone="violet"
              />
              <MetricCard
                icon={BriefcaseBusiness}
                label="Negócios abertos"
                value={String(
                  data.deals.filter((deal) => deal.status === 'open').length
                )}
                detail={formatCurrency(
                  data.deals
                    .filter((deal) => deal.status === 'open')
                    .reduce((sum, deal) => sum + numberValue(deal.value), 0),
                  defaultCurrency
                )}
                tone="blue"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
              <ChartPanel
                title="Receita e recebimentos"
                description="Evolução diária no período selecionado."
              >
                <ResponsiveContainer width="100%" height={290}>
                  <AreaChart
                    data={analytics.daily}
                    margin={{ left: 0, right: 12, top: 10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="revenueFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#0ea5e9"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#0ea5e9"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient id="paidFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#10b981"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="95%"
                          stopColor="#10b981"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={58}
                      tickFormatter={(value) =>
                        compactMoney(value, defaultCurrency)
                      }
                    />
                    <Tooltip
                      content={<MoneyTooltip currency={defaultCurrency} />}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Faturado"
                      stroke="#0ea5e9"
                      fill="url(#revenueFill)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="received"
                      name="Recebido"
                      stroke="#10b981"
                      fill="url(#paidFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>
              <AttentionPanel
                due={analytics.due}
                noShows={analytics.noShows.length}
                cancellations={analytics.cancelled.length}
                unread={data.conversations.reduce(
                  (sum, item) => sum + numberValue(item.unread_count),
                  0
                )}
                automationFailures={
                  data.automationLogs.filter((item) => item.status === 'failed')
                    .length
                }
                currency={defaultCurrency}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <BreakdownPanel
                title="Agenda"
                rows={[
                  {
                    label: 'Concluídas',
                    value: analytics.completed.length,
                    color: '#10b981',
                  },
                  {
                    label: 'Confirmadas',
                    value: analytics.currentAppointments.filter(
                      (item) => item.status === 'confirmed'
                    ).length,
                    color: '#0ea5e9',
                  },
                  {
                    label: 'Canceladas',
                    value: analytics.cancelled.length,
                    color: '#f59e0b',
                  },
                  {
                    label: 'Faltas',
                    value: analytics.noShows.length,
                    color: '#f43f5e',
                  },
                ]}
              />
              <BreakdownPanel
                title="Inbox"
                rows={[
                  {
                    label: 'Recebidas',
                    value: data.messages.filter(
                      (item) => item.sender_type === 'customer'
                    ).length,
                    color: '#0ea5e9',
                  },
                  {
                    label: 'Enviadas',
                    value: data.messages.filter(
                      (item) => item.sender_type !== 'customer'
                    ).length,
                    color: '#8b5cf6',
                  },
                  {
                    label: 'Abertas',
                    value: data.conversations.filter(
                      (item) => item.status === 'open'
                    ).length,
                    color: '#f59e0b',
                  },
                  {
                    label: 'Pendentes',
                    value: data.conversations.filter(
                      (item) => item.status === 'pending'
                    ).length,
                    color: '#f43f5e',
                  },
                ]}
              />
              <BreakdownPanel
                title="Crescimento"
                rows={[
                  {
                    label: 'Indicações',
                    value: analytics.currentReferrals.length,
                    color: '#8b5cf6',
                  },
                  {
                    label: 'Qualificadas',
                    value: analytics.currentReferrals.filter((item) =>
                      ['qualified', 'rewarded'].includes(item.status)
                    ).length,
                    color: '#10b981',
                  },
                  {
                    label: 'Campanhas',
                    value: data.broadcasts.length,
                    color: '#0ea5e9',
                  },
                  {
                    label: 'Automações executadas',
                    value: data.automationLogs.length,
                    color: '#f59e0b',
                  },
                ]}
              />
            </div>
          </TabsContent>

          <TabsContent value="finance" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <MetricCard
                icon={Banknote}
                label="Recebido"
                value={formatCurrency(analytics.received, defaultCurrency)}
                change={analytics.receivedChange}
                detail="Pagamentos confirmados"
                tone="emerald"
              />
              <MetricCard
                icon={WalletCards}
                label="SumUp online"
                value={formatCurrency(analytics.sumUpReceived, defaultCurrency)}
                detail={`${analytics.sumUpPayments.length} pagamento(s) confirmados`}
                tone="violet"
              />
              <MetricCard
                icon={ReceiptText}
                label="Faturado"
                value={formatCurrency(analytics.billed, defaultCurrency)}
                change={analytics.billedChange}
                detail={`${analytics.currentSales.length} vendas válidas`}
                tone="blue"
              />
              <MetricCard
                icon={ReceiptText}
                label="Retroativo"
                value={formatCurrency(analytics.historicalTotal, defaultCurrency)}
                detail={`${analytics.historicalSales.length} já faturada(s), fora do caixa`}
                tone="slate"
              />
              <MetricCard
                icon={CreditCard}
                label="Em dívida"
                value={formatCurrency(analytics.due, defaultCurrency)}
                detail="Saldo das vendas do período"
                tone="rose"
              />
              <MetricCard
                icon={BadgeEuro}
                label="Descontos"
                value={formatCurrency(analytics.discounts, defaultCurrency)}
                detail={`${safeRate(analytics.discounts, analytics.billed + analytics.discounts).toFixed(1)}% do valor bruto`}
                tone="amber"
              />
              <MetricCard
                icon={ReceiptText}
                label="Impostos"
                value={formatCurrency(analytics.taxes, defaultCurrency)}
                detail="IVA registado nas vendas"
                tone="slate"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartPanel
                title="Recebimentos por método"
                description="Distribuição dos pagamentos confirmados."
              >
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={analytics.paymentMethods}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={96}
                      paddingAngle={2}
                    >
                      {analytics.paymentMethods.map((item, index) => (
                        <Cell
                          key={item.name}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<MoneyTooltip currency={defaultCurrency} />}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel
                title="Itens com maior receita"
                description="Serviços, produtos, packs e vouchers vendidos."
              >
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={analytics.itemSales.slice(0, 8)}
                    layout="vertical"
                    margin={{ left: 18, right: 16 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="var(--border)"
                    />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      content={<MoneyTooltip currency={defaultCurrency} />}
                    />
                    <Bar
                      dataKey="revenue"
                      name="Receita"
                      fill="#0ea5e9"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
            <ReportTable
              title="Vendas do período"
              description="Só vendas operacionais: entram em faturação, recebimentos e saldo."
              headers={[
                'Venda',
                'Data',
                'Cliente',
                'Total',
                'Recebido',
                'Saldo',
                'Estado',
              ]}
              rows={analytics.currentSales.map((sale) => [
                <Link
                  key="sale"
                  href={`/finance?tab=sales#sale-${sale.id}`}
                  className="text-primary inline-flex items-center gap-1 font-medium"
                >
                  #{sale.sale_number}
                  <ArrowUpRight className="size-3" />
                </Link>,
                formatDateTime(sale.created_at),
                one(sale.contact)?.name ||
                  one(sale.contact)?.phone ||
                  'Consumidor final',
                formatCurrency(numberValue(sale.total_amount), sale.currency),
                formatCurrency(numberValue(sale.paid_amount), sale.currency),
                formatCurrency(numberValue(sale.balance_due), sale.currency),
                <StatusBadge key="status" status={sale.status} />,
              ])}
            />
            <ReportTable
              title="Vendas retroativas / já faturadas"
              description="Registo individual de vendas pagas fora do CRM. Mantêm-se para auditoria e nunca entram no saldo de entrada."
              headers={['Venda', 'Data de registo', 'Cliente', 'Valor externo', 'Estado']}
              rows={analytics.historicalSales.map((sale) => [
                <Link
                  key="historical-sale"
                  href={`/finance?tab=sales#sale-${sale.id}`}
                  className="text-primary inline-flex items-center gap-1 font-medium"
                >
                  #{sale.sale_number}
                  <ArrowUpRight className="size-3" />
                </Link>,
                formatDateTime(sale.created_at),
                one(sale.contact)?.name || one(sale.contact)?.phone || 'Consumidor final',
                formatCurrency(numberValue(sale.total_amount), sale.currency),
                <Badge key="historical" variant="outline" className="border-amber-400 text-amber-700">Já faturada</Badge>,
              ])}
            />
            <ReportTable
              title="Movimentos de caixa"
              headers={['Data', 'Tipo', 'Descrição', 'Referência', 'Valor']}
              rows={data.cashMovements.map((movement) => [
                formatDateTime(movement.created_at),
                statusLabel(movement.movement_type),
                movement.description,
                movement.reference || '—',
                formatCurrency(numberValue(movement.amount), defaultCurrency),
              ])}
            />
          </TabsContent>

          <TabsContent value="agenda" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard
                icon={CalendarDays}
                label="Marcações"
                value={String(analytics.currentAppointments.length)}
                change={analytics.appointmentsChange}
                detail="Total do período"
                tone="blue"
              />
              <MetricCard
                icon={CalendarCheck}
                label="Concluídas"
                value={String(analytics.completed.length)}
                change={analytics.completedChange}
                detail={`${safeRate(analytics.completed.length, analytics.currentAppointments.length).toFixed(0)}% da agenda`}
                tone="emerald"
              />
              <MetricCard
                icon={CircleAlert}
                label="Faltas"
                value={String(analytics.noShows.length)}
                detail={`${safeRate(analytics.noShows.length, analytics.currentAppointments.length).toFixed(1)}% da agenda`}
                tone="rose"
              />
              <MetricCard
                icon={CalendarDays}
                label="Canceladas"
                value={String(analytics.cancelled.length)}
                detail={`${safeRate(analytics.cancelled.length, analytics.currentAppointments.length).toFixed(1)}% da agenda`}
                tone="amber"
              />
              <MetricCard
                icon={RefreshCw}
                label="Remarcações"
                value={String(
                  analytics.currentAppointments.reduce(
                    (sum, item) => sum + numberValue(item.reschedule_count),
                    0
                  )
                )}
                detail="Alterações registadas"
                tone="violet"
              />
              <MetricCard
                icon={BadgeEuro}
                label="Valor previsto"
                value={formatCurrency(
                  analytics.currentAppointments
                    .filter(
                      (item) => !['cancelled', 'no_show'].includes(item.status)
                    )
                    .reduce((sum, item) => sum + numberValue(item.price), 0),
                  defaultCurrency
                )}
                detail="Agenda válida"
                tone="slate"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartPanel
                title="Desempenho por serviço"
                description="Volume e conclusão das modalidades."
              >
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={analytics.serviceStats.slice(0, 10)}
                    margin={{ left: 0, right: 10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      minTickGap={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="bookings"
                      name="Marcações"
                      fill="#0ea5e9"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="completed"
                      name="Concluídas"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel
                title="Origem das marcações"
                description="Como os clientes chegaram à agenda."
              >
                <SimpleDonut
                  data={groupCount(analytics.currentAppointments, (item) =>
                    statusLabel(item.source)
                  )}
                />
              </ChartPanel>
            </div>
            <ReportTable
              title="Marcações"
              description="Histórico operacional com benefício e origem."
              headers={[
                'Data',
                'Cliente',
                'Serviço',
                'Profissional',
                'Origem',
                'Benefício',
                'Valor',
                'Estado',
              ]}
              rows={analytics.currentAppointments.map((appointment) => {
                const benefit = appointment.referral_id
                  ? 'Indicação'
                  : appointment.benefits?.find((item) =>
                      ['reserved', 'consumed'].includes(item.status)
                    )?.benefit_type;
                return [
                  <Link
                    key="date"
                    href={`/agenda?appointment=${appointment.id}&date=${appointment.scheduled_start.slice(0, 10)}`}
                    className="text-primary inline-flex items-center gap-1 font-medium"
                  >
                    {formatDateTime(appointment.scheduled_start)}
                    <ArrowUpRight className="size-3" />
                  </Link>,
                  one(appointment.contact)?.name ||
                    one(appointment.contact)?.phone ||
                    'Cliente',
                  one(appointment.service)?.name || 'Sem serviço',
                  one(appointment.professional)?.full_name ||
                    one(appointment.professional)?.email ||
                    'Sem profissional',
                  statusLabel(appointment.source),
                  benefit ? statusLabel(benefit) : 'Direto',
                  formatCurrency(
                    numberValue(appointment.price),
                    appointment.currency
                  ),
                  <StatusBadge key="status" status={appointment.status} />,
                ];
              })}
            />
          </TabsContent>

          <TabsContent value="communications" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={MessageSquare}
                label="WhatsApp enviados"
                value={String(
                  communicationRows.filter((row) => row.whatsapp?.sent).length
                )}
                detail="Envios confirmados no período"
                tone="emerald"
              />
              <MetricCard
                icon={Inbox}
                label="Emails enviados"
                value={String(
                  communicationRows.filter((row) => row.email?.sent).length
                )}
                detail="Envios confirmados no período"
                tone="blue"
              />
              <MetricCard
                icon={CircleAlert}
                label="Falhas"
                value={String(
                  communicationRows.filter(
                    (row) => row.whatsapp?.error || row.email?.error
                  ).length
                )}
                detail="Comunicações que exigem revisão"
                tone="rose"
              />
              <MetricCard
                icon={Activity}
                label="Total"
                value={String(communicationRows.length)}
                detail="Eventos de comunicação da agenda"
                tone="violet"
              />
            </div>
            <ReportTable
              title="Histórico de comunicações"
              description="Quem recebeu, por qual canal e o motivo das falhas."
              headers={[
                'Data',
                'Cliente',
                'Destino',
                'Tipo',
                'WhatsApp',
                'Email',
                'Detalhes',
              ]}
              rows={communicationRows.map((row) => {
                const recipient = row.metadata?.recipient;
                return [
                  formatDateTime(row.created_at),
                  recipient?.name || 'Cliente',
                  [recipient?.phone, recipient?.email]
                    .filter(Boolean)
                    .join(' · ') || 'Sem contacto',
                  communicationActionLabel(row.metadata?.message_action),
                  <DeliveryBadge key="whatsapp" delivery={row.whatsapp} />,
                  <DeliveryBadge key="email" delivery={row.email} />,
                  row.whatsapp?.error || row.email?.error || row.reason || '—',
                ];
              })}
            />
          </TabsContent>

          <TabsContent value="clients" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                icon={Users}
                label="Base total"
                value={String(data.contacts.length)}
                detail="Clientes registados"
                tone="slate"
              />
              <MetricCard
                icon={UserCheck}
                label="Novos"
                value={String(analytics.newContacts.length)}
                change={analytics.contactsChange}
                detail="Criados no período"
                tone="blue"
              />
              <MetricCard
                icon={Activity}
                label="Ativos"
                value={String(analytics.activeClientIds.size)}
                detail="Com venda ou marcação"
                tone="emerald"
              />
              <MetricCard
                icon={RefreshCw}
                label="Recorrentes"
                value={String(analytics.recurringClients)}
                detail="Mais de uma atividade no período"
                tone="violet"
              />
              <MetricCard
                icon={CircleAlert}
                label="Sem atividade"
                value={String(
                  Math.max(
                    0,
                    data.contacts.length - analytics.activeClientIds.size
                  )
                )}
                detail="Sem venda ou marcação no período"
                tone="amber"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
              <ChartPanel
                title="Aquisição e atividade"
                description="Novos clientes e marcações por dia."
              >
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={analytics.daily}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={22}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="clients"
                      name="Novos clientes"
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="appointments"
                      name="Marcações"
                      fill="#0ea5e9"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel
                title="Retenção no período"
                description="Distribuição da base pelo comportamento observado."
              >
                <SimpleDonut
                  data={[
                    { name: 'Ativos', value: analytics.activeClientIds.size },
                    { name: 'Recorrentes', value: analytics.recurringClients },
                    {
                      name: 'Sem atividade',
                      value: Math.max(
                        0,
                        data.contacts.length - analytics.activeClientIds.size
                      ),
                    },
                  ]}
                />
              </ChartPanel>
            </div>
            <ReportTable
              title="Valor por cliente"
              description="Receita, recebimento e visitas dentro do período."
              headers={['Cliente', 'Telefone', 'Vendas', 'Recebido', 'Visitas']}
              rows={analytics.customerStats.map((customer) => [
                <Link
                  key="client"
                  href={`/contacts/${customer.id}`}
                  className="text-primary inline-flex items-center gap-1 font-medium"
                >
                  {customer.name}
                  <ArrowUpRight className="size-3" />
                </Link>,
                customer.phone || '—',
                formatCurrency(customer.sales, defaultCurrency),
                formatCurrency(customer.received, defaultCurrency),
                customer.visits,
              ])}
            />
          </TabsContent>

          <TabsContent value="inbox" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard
                icon={MessageSquare}
                label="Recebidas"
                value={String(
                  data.messages.filter(
                    (item) => item.sender_type === 'customer'
                  ).length
                )}
                detail="Mensagens de clientes"
                tone="blue"
              />
              <MetricCard
                icon={ArrowUpRight}
                label="Enviadas"
                value={String(
                  data.messages.filter(
                    (item) => item.sender_type !== 'customer'
                  ).length
                )}
                detail="Agentes e automações"
                tone="violet"
              />
              <MetricCard
                icon={Inbox}
                label="Abertas"
                value={String(
                  data.conversations.filter((item) => item.status === 'open')
                    .length
                )}
                detail="Estado atual"
                tone="amber"
              />
              <MetricCard
                icon={Clock3}
                label="Pendentes"
                value={String(
                  data.conversations.filter((item) => item.status === 'pending')
                    .length
                )}
                detail="Aguardando ação"
                tone="rose"
              />
              <MetricCard
                icon={CircleAlert}
                label="Não lidas"
                value={String(
                  data.conversations.reduce(
                    (sum, item) => sum + numberValue(item.unread_count),
                    0
                  )
                )}
                detail="Acumulado atual"
                tone="rose"
              />
              <MetricCard
                icon={Clock3}
                label="Resposta média"
                value={formatMinutes(analytics.responseAverage)}
                detail={`${analytics.responseSamples.length} amostras`}
                tone="emerald"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartPanel
                title="Tráfego de mensagens"
                description="Entradas e saídas por dia."
              >
                <ResponsiveContainer width="100%" height={290}>
                  <AreaChart data={analytics.daily}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={22}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="incoming"
                      name="Recebidas"
                      stroke="#0ea5e9"
                      fill="#0ea5e933"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="outgoing"
                      name="Enviadas"
                      stroke="#8b5cf6"
                      fill="#8b5cf633"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel
                title="Estado das mensagens enviadas"
                description="Confirmações devolvidas pelo WhatsApp."
              >
                <SimpleDonut
                  data={groupCount(
                    data.messages.filter(
                      (item) => item.sender_type !== 'customer'
                    ),
                    (item) => statusLabel(item.status)
                  )}
                />
              </ChartPanel>
            </div>
            <ReportTable
              title="Conversas que exigem atenção"
              description="Não lidas, abertas ou pendentes, ordenadas por atividade."
              headers={[
                'Cliente',
                'Última atividade',
                'Não lidas',
                'Responsável',
                'Estado',
              ]}
              rows={data.conversations
                .filter(
                  (item) =>
                    item.status !== 'closed' ||
                    numberValue(item.unread_count) > 0
                )
                .map((conversation) => [
                  <Link
                    key="conversation"
                    href={`/inbox?conversation=${conversation.id}`}
                    className="text-primary inline-flex items-center gap-1 font-medium"
                  >
                    {one(conversation.contact)?.name ||
                      one(conversation.contact)?.phone ||
                      'Cliente'}
                    <ArrowUpRight className="size-3" />
                  </Link>,
                  conversation.last_message_at
                    ? formatDateTime(conversation.last_message_at)
                    : 'Sem mensagens',
                  numberValue(conversation.unread_count),
                  conversation.assigned_agent_id
                    ? data.profiles.find(
                        (profile) =>
                          profile.user_id === conversation.assigned_agent_id
                      )?.full_name || 'Atribuído'
                    : 'Sem responsável',
                  <StatusBadge key="status" status={conversation.status} />,
                ])}
            />
          </TabsContent>

          <TabsContent value="growth" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard
                icon={Gift}
                label="Indicações"
                value={String(analytics.currentReferrals.length)}
                change={analytics.referralsChange}
                detail="Entradas no período"
                tone="violet"
              />
              <MetricCard
                icon={UserCheck}
                label="Conversão"
                value={`${analytics.qualificationRate.toFixed(1)}%`}
                detail="Qualificadas ou premiadas"
                tone="emerald"
              />
              <MetricCard
                icon={WalletCards}
                label="Recompensas emitidas"
                value={String(
                  data.rewards.filter((item) => item.status === 'issued').length
                )}
                detail={formatCurrency(
                  data.rewards
                    .filter((item) => item.status === 'issued')
                    .reduce(
                      (sum, item) => sum + numberValue(item.reward_value),
                      0
                    ),
                  defaultCurrency
                )}
                tone="amber"
              />
              <MetricCard
                icon={Megaphone}
                label="Campanhas"
                value={String(data.broadcasts.length)}
                detail={`${analytics.confirmedBroadcastRecipients} envios`}
                tone="blue"
              />
              <MetricCard
                icon={MessageSquare}
                label="Leitura campanhas"
                value={`${analytics.broadcastReadRate.toFixed(1)}%`}
                detail={`${analytics.broadcastReplyRate.toFixed(1)}% responderam`}
                tone="violet"
              />
              <MetricCard
                icon={Zap}
                label="Automações"
                value={String(data.automationLogs.length)}
                detail={`${data.automationLogs.filter((item) => item.status === 'failed').length} falhas`}
                tone="rose"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartPanel
                title="Funil de indicações"
                description="Do registo à recompensa."
              >
                <BreakdownPanel
                  rows={[
                    {
                      label: 'Registadas',
                      value: analytics.currentReferrals.length,
                      color: '#0ea5e9',
                    },
                    {
                      label: 'Contactadas/agendadas',
                      value: analytics.currentReferrals.filter((item) =>
                        [
                          'contacted',
                          'scheduled',
                          'qualified',
                          'rewarded',
                        ].includes(item.status)
                      ).length,
                      color: '#8b5cf6',
                    },
                    {
                      label: 'Qualificadas',
                      value: analytics.currentReferrals.filter((item) =>
                        ['qualified', 'rewarded'].includes(item.status)
                      ).length,
                      color: '#10b981',
                    },
                    {
                      label: 'Premiadas',
                      value: analytics.currentReferrals.filter(
                        (item) => item.status === 'rewarded'
                      ).length,
                      color: '#f59e0b',
                    },
                  ]}
                  compact
                />
              </ChartPanel>
              <ChartPanel
                title="Saúde das automações"
                description="Execuções por estado no período."
              >
                <SimpleDonut
                  data={groupCount(data.automationLogs, (item) =>
                    statusLabel(item.status)
                  )}
                />
              </ChartPanel>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ReportTable
                title="Indicações"
                headers={[
                  'Quem indicou',
                  'Amigo',
                  'Telefone',
                  'Data',
                  'Estado',
                ]}
                rows={analytics.currentReferrals.map((referral) => [
                  one(referral.referrer)?.name ||
                    one(referral.referrer)?.phone ||
                    'Cliente',
                  referral.friend_name,
                  referral.friend_phone,
                  formatDateTime(referral.created_at),
                  <StatusBadge key="status" status={referral.status} />,
                ])}
              />
              <ReportTable
                title="Campanhas"
                headers={[
                  'Campanha',
                  'Público',
                  'Enviado',
                  'Entregue',
                  'Lido',
                  'Respondeu',
                  'Falhou',
                ]}
                rows={data.broadcasts.map((broadcast) => [
                  <Link
                    key="broadcast"
                    href={`/broadcasts/${broadcast.id}`}
                    className="text-primary font-medium"
                  >
                    {broadcast.name}
                  </Link>,
                  broadcast.total_recipients,
                  broadcast.sent_count,
                  broadcast.delivered_count,
                  broadcast.read_count,
                  broadcast.replied_count,
                  broadcast.failed_count,
                ])}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <BenefitInventory
                title="Vouchers"
                value={formatCurrency(
                  analytics.voucherBalance,
                  defaultCurrency
                )}
                detail={`${data.vouchers.filter((item) => item.status === 'active').length} ativos`}
                href="/finance?tab=vouchers"
                icon={Gift}
              />
              <BenefitInventory
                title="Packs"
                value={`${analytics.packTotals.remaining} sessões`}
                detail={`${analytics.packTotals.used} utilizadas de ${analytics.packTotals.purchased}`}
                href="/finance?tab=packs"
                icon={PackageCheck}
              />
              <BenefitInventory
                title="Cartão-saldo"
                value={formatCurrency(analytics.walletBalance, defaultCurrency)}
                detail={`${data.wallets.filter((item) => numberValue(item.balance) > 0).length} clientes com saldo`}
                href="/finance?tab=wallets"
                icon={WalletCards}
              />
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard
                icon={Users}
                label="Membros"
                value={String(data.profiles.length)}
                detail={`${data.profiles.filter((item) => item.is_professional).length} profissionais`}
                tone="blue"
              />
              <MetricCard
                icon={Clock3}
                label="Horas trabalhadas"
                value={formatMinutes(
                  analytics.workStats.reduce(
                    (sum, item) => sum + item.minutes,
                    0
                  )
                )}
                detail={`${data.workSessions.length} jornadas`}
                tone="emerald"
              />
              <MetricCard
                icon={CalendarCheck}
                label="Atendimentos"
                value={String(analytics.completed.length)}
                detail="Marcações concluídas"
                tone="violet"
              />
              <MetricCard
                icon={BriefcaseBusiness}
                label="Negócios abertos"
                value={String(
                  data.deals.filter((item) => item.status === 'open').length
                )}
                detail={formatCurrency(
                  data.deals
                    .filter((item) => item.status === 'open')
                    .reduce((sum, item) => sum + numberValue(item.value), 0),
                  defaultCurrency
                )}
                tone="amber"
              />
              <MetricCard
                icon={UserCheck}
                label="Ganhos"
                value={String(
                  data.deals.filter((item) => item.status === 'won').length
                )}
                detail={formatCurrency(
                  data.deals
                    .filter((item) => item.status === 'won')
                    .reduce((sum, item) => sum + numberValue(item.value), 0),
                  defaultCurrency
                )}
                tone="emerald"
              />
              <MetricCard
                icon={CircleAlert}
                label="Perdidos"
                value={String(
                  data.deals.filter((item) => item.status === 'lost').length
                )}
                detail={`${safeRate(data.deals.filter((item) => item.status === 'won').length, data.deals.filter((item) => ['won', 'lost'].includes(item.status)).length).toFixed(1)}% conversão`}
                tone="rose"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartPanel
                title="Agenda por profissional"
                description="Marcações e conclusões no período."
              >
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.professionalStats.slice(0, 10)}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={10}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="bookings"
                      name="Marcações"
                      fill="#0ea5e9"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="completed"
                      name="Concluídas"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel
                title="Funil comercial"
                description="Distribuição atual dos negócios."
              >
                <SimpleDonut
                  data={groupCount(data.deals, (item) =>
                    statusLabel(item.status)
                  )}
                />
              </ChartPanel>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ReportTable
                title="Jornada por membro"
                headers={[
                  'Membro',
                  'Dias',
                  'Trabalhado',
                  'Pausas',
                  'Média diária',
                ]}
                rows={analytics.workStats.map((item) => [
                  item.name,
                  item.sessions,
                  formatMinutes(item.minutes),
                  item.breaks,
                  formatMinutes(
                    item.sessions ? item.minutes / item.sessions : 0
                  ),
                ])}
              />
              <ReportTable
                title="Negócios comerciais"
                headers={[
                  'Negócio',
                  'Cliente',
                  'Pipeline',
                  'Etapa',
                  'Valor',
                  'Estado',
                ]}
                rows={data.deals.map((deal) => [
                  <Link
                    key="deal"
                    href={`/pipelines?deal=${deal.id}`}
                    className="text-primary font-medium"
                  >
                    {deal.title}
                  </Link>,
                  one(deal.contact)?.name ||
                    one(deal.contact)?.phone ||
                    'Cliente',
                  one(deal.pipeline)?.name || 'Pipeline',
                  one(deal.stage)?.name || 'Etapa',
                  formatCurrency(
                    numberValue(deal.value),
                    deal.currency || defaultCurrency
                  ),
                  <StatusBadge key="status" status={deal.status} />,
                ])}
              />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function PresetButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick}>
      {label}
    </Button>
  );
}

function ReportDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium">
      {label}
      <Input
        type="date"
        value={value}
        max={label === 'De' ? undefined : today()}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-40"
      />
    </label>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  change,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  change?: number | null;
  tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
}) {
  const tones = {
    blue: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  };
  return (
    <article className="border-border bg-card min-w-0 rounded-lg border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          {label}
        </span>
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-md ${tones[tone]}`}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-2 flex min-w-0 items-end gap-2">
        <strong className="truncate text-xl font-semibold" title={value}>
          {value}
        </strong>
        {change !== undefined && <Delta value={change} />}
      </div>
      <p
        className="text-muted-foreground mt-1 truncate text-[11px]"
        title={detail}
      >
        {detail}
      </p>
    </article>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null)
    return <span className="text-muted-foreground text-[10px]">novo</span>;
  const positive = value >= 0;
  return (
    <span
      className={`mb-0.5 inline-flex items-center text-[10px] font-medium ${positive ? 'text-emerald-600' : 'text-rose-600'}`}
    >
      {positive ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function ChartPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card min-w-0 rounded-lg border">
      <div className="border-border border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <div className="min-h-[280px] p-3">{children}</div>
    </section>
  );
}

function AttentionPanel({
  due,
  noShows,
  cancellations,
  unread,
  automationFailures,
  currency,
}: {
  due: number;
  noShows: number;
  cancellations: number;
  unread: number;
  automationFailures: number;
  currency: string;
}) {
  const items = [
    {
      label: 'Saldo por receber',
      value: formatCurrency(due, currency),
      href: '/finance?tab=sales',
      tone: 'text-rose-600',
    },
    {
      label: 'Faltas na agenda',
      value: String(noShows),
      href: '/agenda',
      tone: 'text-amber-600',
    },
    {
      label: 'Cancelamentos',
      value: String(cancellations),
      href: '/agenda',
      tone: 'text-amber-600',
    },
    {
      label: 'Mensagens não lidas',
      value: String(unread),
      href: '/inbox',
      tone: 'text-sky-600',
    },
    {
      label: 'Falhas de automação',
      value: String(automationFailures),
      href: '/automations',
      tone: 'text-rose-600',
    },
  ];
  return (
    <section className="border-border bg-card rounded-lg border">
      <div className="border-border border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CircleAlert className="size-4 text-amber-500" /> Atenção operacional
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Pontos que merecem revisão.
        </p>
      </div>
      <div className="divide-border divide-y px-4">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center justify-between gap-3 py-3 text-sm hover:underline"
          >
            <span>{item.label}</span>
            <strong className={item.tone}>{item.value}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}

function BreakdownPanel({
  title,
  rows,
  compact = false,
}: {
  title?: string;
  rows: Array<{ label: string; value: number; color: string }>;
  compact?: boolean;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <section
      className={compact ? '' : 'border-border bg-card rounded-lg border p-4'}
    >
      {title && <h2 className="text-sm font-semibold">{title}</h2>}
      <div className={title ? 'mt-4 space-y-3' : 'space-y-4'}>
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-sm">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${(row.value / max) * 100}%`,
                  backgroundColor: row.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SimpleDonut({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  const normalized = data.filter((item) => item.value > 0);
  if (!normalized.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={270}>
      <PieChart>
        <Pie
          data={normalized}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          outerRadius={94}
          paddingAngle={2}
        >
          {normalized.map((item, index) => (
            <Cell
              key={item.name}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EmptyChart() {
  return (
    <div className="text-muted-foreground flex h-[270px] items-center justify-center text-sm">
      Sem dados no período.
    </div>
  );
}

function BenefitInventory({
  title,
  value,
  detail,
  href,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="border-border bg-card hover:border-primary/40 flex items-center gap-3 rounded-lg border p-4 transition-colors"
    >
      <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <strong className="block text-lg">{value}</strong>
        <span className="text-muted-foreground block truncate text-xs">
          {detail}
        </span>
      </span>
      <ArrowUpRight className="text-muted-foreground ml-auto size-4" />
    </Link>
  );
}

function ReportTable({
  title,
  description,
  headers,
  rows,
}: {
  title: string;
  description?: string;
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? rows.filter((row) =>
        row
          .map(readNodeText)
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      )
    : rows;
  const displayed = filtered.slice(0, 100);
  return (
    <section className="border-border bg-card min-w-0 overflow-hidden rounded-lg border">
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-muted-foreground text-xs">
            {description || `${rows.length} registos`}
          </p>
        </div>
        {rows.length > 6 && (
          <label className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar nesta tabela..."
              className="h-8 w-56 pl-8 text-xs"
            />
          </label>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-left text-xs">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-4 py-2 font-medium whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {displayed.length ? (
              displayed.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-muted/20">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="max-w-[260px] px-4 py-2.5 whitespace-nowrap"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={headers.length}
                  className="text-muted-foreground px-4 py-10 text-center"
                >
                  Sem dados no período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 100 && (
        <p className="text-muted-foreground border-border border-t px-4 py-2 text-xs">
          Mostrando 100 de {filtered.length}. A exportação inclui todos.
        </p>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const positive = [
    'paid',
    'completed',
    'confirmed',
    'won',
    'success',
    'qualified',
    'rewarded',
    'read',
    'delivered',
  ].includes(status);
  const negative = [
    'voided',
    'refunded',
    'cancelled',
    'no_show',
    'lost',
    'failed',
    'rejected',
  ].includes(status);
  return (
    <Badge
      variant={negative ? 'destructive' : positive ? 'default' : 'secondary'}
    >
      {statusLabel(status)}
    </Badge>
  );
}

function MoneyTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    payload?: { name?: string };
  }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border bg-popover rounded-md border px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label || payload[0]?.payload?.name}</p>
      {payload.map((item) => (
        <p key={item.name} className="text-muted-foreground">
          <span className="text-foreground">{item.name}:</span>{' '}
          {formatCurrency(numberValue(item.value), currency)}
        </p>
      ))}
    </div>
  );
}

function groupCount<T>(rows: T[], key: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return Array.from(counts, ([name, value]) => ({ name, value })).sort(
    (a, b) => b.value - a.value
  );
}

function readNodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(readNodeText).join(' ');
  if (node && typeof node === 'object' && 'props' in node) {
    return readNodeText(
      (node as React.ReactElement<{ children?: React.ReactNode }>).props
        .children
    );
  }
  return '';
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function compactMoney(value: number, currency: string) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

type ExportAnalytics = {
  currentSales: SaleRow[];
  historicalSales: SaleRow[];
  currentAppointments: AppointmentRow[];
  currentReferrals: ReferralRow[];
  customerStats: Array<{
    name: string;
    phone: string;
    sales: number;
    received: number;
    visits: number;
  }>;
  workStats: Array<{
    name: string;
    sessions: number;
    minutes: number;
    breaks: number;
  }>;
  billed: number;
  received: number;
  due: number;
  historicalTotal: number;
  averageTicket: number;
  completed: AppointmentRow[];
  noShows: AppointmentRow[];
  newContacts: ContactRow[];
  activeClientIds: Set<string>;
  responseAverage: number;
  voucherBalance: number;
  walletBalance: number;
};

function exportRows(
  tab: ReportTab,
  data: ReportData,
  analytics: ExportAnalytics,
  currency: string
): unknown[][] {
  if (tab === 'finance')
    return [
      ['Venda', 'Data', 'Cliente', 'Total', 'Recebido', 'Saldo', 'Estado', 'Classificação'],
      ...analytics.currentSales.map((sale) => [
        sale.sale_number,
        sale.created_at,
        one(sale.contact)?.name || one(sale.contact)?.phone || '',
        sale.total_amount,
        sale.paid_amount,
        sale.balance_due,
        statusLabel(sale.status),
        'Operacional',
      ]),
      ...analytics.historicalSales.map((sale) => [
        sale.sale_number,
        sale.created_at,
        one(sale.contact)?.name || one(sale.contact)?.phone || '',
        sale.total_amount,
        0,
        0,
        statusLabel(sale.status),
        'Já faturada / retroativa (fora do caixa)',
      ]),
    ];
  if (tab === 'agenda')
    return [
      [
        'Data',
        'Cliente',
        'Serviço',
        'Profissional',
        'Origem',
        'Valor',
        'Estado',
      ],
      ...analytics.currentAppointments.map((item) => [
        item.scheduled_start,
        one(item.contact)?.name || one(item.contact)?.phone || '',
        one(item.service)?.name || '',
        one(item.professional)?.full_name ||
          one(item.professional)?.email ||
          '',
        item.source,
        item.price,
        statusLabel(item.status),
      ]),
    ];
  if (tab === 'communications')
    return [
      [
        'Data',
        'Cliente',
        'Telefone',
        'Email',
        'Tipo',
        'WhatsApp',
        'Email',
        'Detalhes',
      ],
      ...data.communicationEvents.map((event) => {
        const recipient = event.metadata?.recipient;
        const whatsapp = event.metadata?.deliveries?.whatsapp;
        const email = event.metadata?.deliveries?.email;
        return [
          event.created_at,
          recipient?.name || '',
          recipient?.phone || '',
          recipient?.email || '',
          communicationActionLabel(event.metadata?.message_action),
          deliveryLabel(whatsapp),
          deliveryLabel(email),
          whatsapp?.error || email?.error || event.reason || '',
        ];
      }),
    ];
  if (tab === 'clients')
    return [
      ['Cliente', 'Telefone', 'Vendas', 'Recebido', 'Visitas'],
      ...analytics.customerStats.map((item) => [
        item.name,
        item.phone,
        item.sales,
        item.received,
        item.visits,
      ]),
    ];
  if (tab === 'inbox')
    return [
      ['Cliente', 'Última atividade', 'Não lidas', 'Estado'],
      ...data.conversations.map((item) => [
        one(item.contact)?.name || one(item.contact)?.phone || '',
        item.last_message_at || '',
        item.unread_count || 0,
        statusLabel(item.status),
      ]),
    ];
  if (tab === 'growth')
    return [
      ['Indicação', 'Quem indicou', 'Amigo', 'Telefone', 'Data', 'Estado'],
      ...analytics.currentReferrals.map((item) => [
        item.id,
        one(item.referrer)?.name || one(item.referrer)?.phone || '',
        item.friend_name,
        item.friend_phone,
        item.created_at,
        statusLabel(item.status),
      ]),
    ];
  if (tab === 'team')
    return [
      ['Membro', 'Dias', 'Minutos trabalhados', 'Pausas'],
      ...analytics.workStats.map((item) => [
        item.name,
        item.sessions,
        Math.round(item.minutes),
        item.breaks,
      ]),
    ];
  return [
    ['Indicador', 'Valor'],
    ['Faturado', analytics.billed],
    ['Recebido', analytics.received],
    ['Por receber', analytics.due],
    ['Vendas já faturadas / retroativas (fora do caixa)', analytics.historicalTotal],
    ['Ticket médio', analytics.averageTicket],
    ['Marcações', analytics.currentAppointments.length],
    ['Concluídas', analytics.completed.length],
    ['Faltas', analytics.noShows.length],
    ['Novos clientes', analytics.newContacts.length],
    ['Clientes ativos', analytics.activeClientIds.size],
    ['Tempo médio de resposta (min)', analytics.responseAverage],
    ['Saldo de benefícios', analytics.voucherBalance + analytics.walletBalance],
    ['Moeda', currency],
  ];
}

function deliveryLabel(delivery?: DeliveryState) {
  if (!delivery) return 'Sem registo';
  if (delivery.error) return 'Falhou';
  if (delivery.skipped) return 'Ignorado';
  if (delivery.sent) return 'Enviado';
  return 'Pendente';
}
