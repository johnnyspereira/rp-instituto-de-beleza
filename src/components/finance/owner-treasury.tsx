'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileUp,
  ExternalLink,
  Filter,
  LayoutDashboard,
  Loader2,
  PieChart,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ContactSearchSelect } from '@/components/contacts/contact-search-select';
import { FinanceReminderSettings } from '@/components/finance/finance-reminder-settings';
import { TreasuryImportDialog } from '@/components/finance/treasury-import-dialog';
import type { TreasuryImportRow } from '@/lib/finance/import-types';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  ClinicAppointment,
  Contact,
  Deal,
  FinanceCashSession,
  FinancePaymentMethod,
  FinanceSale,
  FinanceVoucher,
} from '@/types';

type Payable = {
  id: string;
  description: string;
  supplier: string | null;
  category: string;
  amount: number;
  currency: string;
  due_date: string;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  contact_id?: string | null;
  appointment_id?: string | null;
  deal_id?: string | null;
  document_reference?: string | null;
  installment_number?: number;
  installment_count?: number;
  source?: string;
  contact?: Contact | null;
  appointment?: ClinicAppointment | null;
  deal?: Deal | null;
};

type Receivable = {
  id: string;
  sale_id: string | null;
  voucher_id: string | null;
  contact_id: string | null;
  description: string;
  amount: number;
  currency: string;
  due_date: string;
  status: 'pending' | 'received' | 'cancelled';
  received_at: string | null;
  notes: string | null;
  appointment_id?: string | null;
  deal_id?: string | null;
  document_reference?: string | null;
  payment_method?: string | null;
  installment_number?: number;
  installment_count?: number;
  source?: string;
  contact?: Contact | null;
  sale?: FinanceSale | null;
  voucher?: FinanceVoucher | null;
  appointment?: ClinicAppointment | null;
  deal?: Deal | null;
};

type Draft = {
  kind: 'payable' | 'receivable';
  description: string;
  counterparty: string;
  category: string;
  amount: string;
  dueDate: string;
  notes: string;
  saleId: string;
  voucherId: string;
  contactId: string;
  appointmentId: string;
  dealId: string;
  documentReference: string;
  installmentCount: string;
  correctionReason: string;
};

type Settlement = {
  kind: Draft['kind'];
  id: string;
  ids?: string[];
  description: string;
  method: FinancePaymentMethod;
  reference: string;
};

const PAYABLE_CATEGORIES = [
  'Renda e instalações',
  'Fornecedores',
  'Produtos e stock',
  'Salários e comissões',
  'Impostos e taxas',
  'Marketing',
  'Software e subscrições',
  'Energia e comunicações',
  'Manutenção',
  'Formação',
  'Seguros',
  'Transportes',
  'Outros',
] as const;

const today = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): Draft => ({
  kind: 'payable',
  description: '',
  counterparty: '',
  category: 'Outros',
  amount: '',
  dueDate: today(),
  notes: '',
  saleId: '',
  voucherId: '',
  contactId: '',
  appointmentId: '',
  dealId: '',
  documentReference: '',
  installmentCount: '1',
  correctionReason: '',
});

function toSafeDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}/.test(normalized)
    ? new Date(`${normalized.slice(0, 10)}T12:00:00Z`)
    : new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(value: unknown) {
  const date = toSafeDate(value);
  if (!date) return 'Data não definida';
  return new Intl.DateTimeFormat('pt-PT', { timeZone: 'UTC' }).format(date);
}

function dateKey(value: unknown) {
  if (typeof value !== 'string') return '';
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = toSafeDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function OwnerTreasury() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user, isOwner, defaultCurrency } = useAuth();
  const [payables, setPayables] = useState<Payable[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [partialSales, setPartialSales] = useState<FinanceSale[]>([]);
  const [vouchers, setVouchers] = useState<FinanceVoucher[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [cashSession, setCashSession] = useState<FinanceCashSession | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<{
    kind: Draft['kind'];
    id: string;
    settled: boolean;
  } | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'settled' | 'overdue'
  >('all');
  const [activeTab, setActiveTab] = useState<
    'overview' | 'calendar' | 'payables' | 'receivables'
  >('overview');
  const [payableView, setPayableView] = useState<'pending' | 'paid'>('pending');
  const [selectedPayableIds, setSelectedPayableIds] = useState<string[]>([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const load = useCallback(async () => {
    if (!accountId || !isOwner) return;
    setLoading(true);
    setLoadError(null);
    try {
    const [
      payableResult,
      receivableResult,
      salesResult,
      vouchersResult,
      contactsResult,
      appointmentsResult,
      dealsResult,
      cashResult,
    ] = await Promise.all([
      supabase
        .from('finance_payables')
        .select(
          '*, contact:contacts(*), appointment:clinic_appointments(*), deal:deals(*)'
        )
        .eq('account_id', accountId)
        .order('due_date'),
      supabase
        .from('finance_receivable_schedules')
        .select(
          '*, contact:contacts(*), sale:finance_sales(*), voucher:finance_vouchers(*), appointment:clinic_appointments(*), deal:deals(*)'
        )
        .eq('account_id', accountId)
        .order('due_date'),
      supabase
        .from('finance_sales')
        .select('*, contact:contacts(*)')
        .eq('account_id', accountId)
        .in('status', ['open', 'partially_paid'])
        .gt('balance_due', 0)
        .order('created_at', { ascending: false }),
      supabase
        .from('finance_vouchers')
        .select('*, owner:contacts(*)')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false }),
      supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .order('name'),
      supabase
        .from('clinic_appointments')
        .select('*, contact:contacts(*), service:clinic_services(*)')
        .eq('account_id', accountId)
        .gte(
          'scheduled_start',
          new Date(Date.now() - 90 * 86400000).toISOString()
        )
        .order('scheduled_start', { ascending: false })
        .limit(200),
      supabase
        .from('deals')
        .select('*, contact:contacts(*)')
        .in('status', ['open', 'won'])
        .order('updated_at', { ascending: false })
        .limit(200),
      supabase
        .from('finance_cash_sessions')
        .select('*')
        .eq('account_id', accountId)
        .eq('status', 'open')
        .maybeSingle(),
    ]);
    const firstError = [payableResult.error, receivableResult.error].find(
      Boolean
    );
    if (firstError) {
      if (firstError.code === '42P01' || firstError.code === 'PGRST205')
        setSchemaMissing(true);
      else toast.error(firstError.message);
    } else {
      setSchemaMissing(false);
      setPayables((payableResult.data ?? []) as Payable[]);
      setReceivables((receivableResult.data ?? []) as Receivable[]);
    }
    setPartialSales((salesResult.data ?? []) as FinanceSale[]);
    setVouchers((vouchersResult.data ?? []) as FinanceVoucher[]);
    setContacts((contactsResult.data ?? []) as Contact[]);
    setAppointments((appointmentsResult.data ?? []) as ClinicAppointment[]);
    setDeals((dealsResult.data ?? []) as Deal[]);
    setCashSession((cashResult.data as FinanceCashSession | null) ?? null);
    } catch (error) {
      console.error('[owner-treasury] load failed:', error);
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os dados da gestão privada.'
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, isOwner, supabase]);

  useEffect(() => {
    // Loading follows the authenticated owner workspace becoming available.
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const pendingPayables = payables.filter(
      (item) => item.status === 'pending'
    );
    const pendingReceivables = receivables.filter(
      (item) => item.status === 'pending'
    );
    const monthPrefix = today().slice(0, 7);
    const monthPayables = payables.filter((item) =>
      item.due_date.startsWith(monthPrefix)
    );
    const monthReceivables = receivables.filter((item) =>
      item.due_date.startsWith(monthPrefix)
    );
    const settledIncoming = monthReceivables
      .filter((item) => item.status === 'received')
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const settledOutgoing = monthPayables
      .filter((item) => item.status === 'paid')
      .reduce((sum, item) => sum + Number(item.amount), 0);
    return {
      payable: pendingPayables.reduce(
        (sum, item) => sum + Number(item.amount),
        0
      ),
      receivable: pendingReceivables.reduce(
        (sum, item) => sum + Number(item.amount),
        0
      ),
      overdue: [...pendingPayables, ...pendingReceivables].filter(
        (item) => item.due_date < today()
      ).length,
      paid: payables
        .filter((item) => item.status === 'paid')
        .reduce((sum, item) => sum + Number(item.amount), 0),
      projectedNet:
        monthReceivables.reduce((sum, item) => sum + Number(item.amount), 0) -
        monthPayables.reduce((sum, item) => sum + Number(item.amount), 0),
      realizedNet: settledIncoming - settledOutgoing,
      clientCount: new Set(
        pendingReceivables.map((item) => item.contact_id).filter(Boolean)
      ).size,
    };
  }, [payables, receivables]);

  const filterEntries = useCallback(
    <T extends Payable | Receivable>(entries: T[]) => {
      const needle = search.trim().toLocaleLowerCase('pt');
      return entries.filter((entry) => {
        const settled = entry.status === 'paid' || entry.status === 'received';
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'pending' && entry.status === 'pending') ||
          (statusFilter === 'settled' && settled) ||
          (statusFilter === 'overdue' &&
            entry.status === 'pending' &&
            entry.due_date < today());
        const party =
          'supplier' in entry ? entry.supplier : entry.contact?.name;
        return (
          matchesStatus &&
          (!needle ||
            `${entry.description} ${party ?? ''} ${entry.document_reference ?? ''}`
              .toLocaleLowerCase('pt')
              .includes(needle))
        );
      });
    },
    [search, statusFilter]
  );

  const visiblePayables = filterEntries(payables)
    .filter((item) =>
      payableView === 'pending' ? item.status === 'pending' : item.status === 'paid'
    )
    .sort((left, right) => {
      const leftDate = payableView === 'paid' ? left.paid_at || left.due_date : left.due_date;
      const rightDate = payableView === 'paid' ? right.paid_at || right.due_date : right.due_date;
      return payableView === 'paid'
        ? rightDate.localeCompare(leftDate)
        : leftDate.localeCompare(rightDate);
    });

  function openCreate(kind: Draft['kind'], sale?: FinanceSale) {
    setEditing(null);
    setDraft({
      ...emptyDraft(),
      kind,
      description: sale ? `Saldo da venda #${sale.sale_number}` : '',
      amount: sale ? String(sale.balance_due) : '',
      saleId: sale?.id ?? '',
      contactId: sale?.contact_id ?? '',
    });
    setDialogOpen(true);
  }

  function openEdit(kind: Draft['kind'], entry: Payable | Receivable) {
    setEditing({ kind, id: entry.id, settled: entry.status !== 'pending' });
    setDraft({
      ...emptyDraft(),
      kind,
      description: entry.description,
      counterparty: 'supplier' in entry ? (entry.supplier ?? '') : '',
      category: 'category' in entry ? entry.category : 'Outros',
      amount: String(entry.amount),
      dueDate: entry.due_date,
      notes: entry.notes ?? '',
      saleId: 'sale_id' in entry ? (entry.sale_id ?? '') : '',
      voucherId: 'voucher_id' in entry ? (entry.voucher_id ?? '') : '',
      contactId: entry.contact_id ?? '',
      appointmentId: entry.appointment_id ?? '',
      dealId: entry.deal_id ?? '',
      documentReference: entry.document_reference ?? '',
      installmentCount: '1',
      correctionReason: '',
    });
    setDialogOpen(true);
  }

  async function save() {
    if (
      !accountId ||
      !user ||
      !draft.description.trim() ||
      Number(draft.amount) <= 0 ||
      !draft.dueDate ||
      (draft.kind === 'payable' && !draft.counterparty.trim())
    ) {
      toast.error('Preencha descrição, valor e vencimento.');
      return;
    }
    setSaving(true);
    if (editing) {
      const update = {
        description: draft.description.trim(),
        supplier:
          draft.kind === 'payable'
            ? draft.counterparty.trim() || null
            : undefined,
        category: draft.kind === 'payable' ? draft.category : undefined,
        amount: editing.settled ? undefined : Number(draft.amount),
        due_date: editing.settled ? undefined : draft.dueDate,
        notes: draft.notes.trim() || null,
        contact_id: draft.kind === 'receivable' ? draft.contactId || null : null,
        appointment_id: draft.appointmentId || null,
        deal_id: draft.dealId || null,
        document_reference: draft.documentReference.trim() || null,
        correction_reason: draft.correctionReason.trim() || null,
      };
      const result =
        draft.kind === 'payable'
          ? await supabase
              .from('finance_payables')
              .update(update)
              .eq('id', editing.id)
          : await supabase
              .from('finance_receivable_schedules')
              .update(update)
              .eq('id', editing.id);
      setSaving(false);
      if (result.error) return toast.error(result.error.message);
      toast.success('Registo atualizado e correção auditada.');
      setDialogOpen(false);
      setEditing(null);
      await load();
      return;
    }
    const common = {
      account_id: accountId,
      description: draft.description.trim(),
      currency: defaultCurrency,
      notes: draft.notes.trim() || null,
      created_by_user_id: user.id,
      contact_id: draft.kind === 'receivable' ? draft.contactId || null : null,
      appointment_id: draft.appointmentId || null,
      deal_id: draft.dealId || null,
      document_reference: draft.documentReference.trim() || null,
    };
    const installmentCount = Math.max(
      1,
      Math.min(60, Number(draft.installmentCount) || 1)
    );
    const totalAmount = Math.round(Number(draft.amount) * 100);
    const baseAmount = Math.floor(totalAmount / installmentCount);
    const groupId = installmentCount > 1 ? crypto.randomUUID() : null;
    const rows = Array.from({ length: installmentCount }, (_, index) => {
      const dueDate = new Date(`${draft.dueDate}T12:00:00`);
      dueDate.setMonth(dueDate.getMonth() + index);
      return {
        ...common,
        description:
          installmentCount > 1
            ? `${draft.description.trim()} (${index + 1}/${installmentCount})`
            : common.description,
        amount:
          (baseAmount +
            (index === installmentCount - 1
              ? totalAmount - baseAmount * installmentCount
              : 0)) /
          100,
        due_date: dueDate.toISOString().slice(0, 10),
        installment_group_id: groupId,
        installment_number: index + 1,
        installment_count: installmentCount,
      };
    });
    const result =
      draft.kind === 'payable'
        ? await supabase.from('finance_payables').insert(
            rows.map((row) => ({
              ...row,
              supplier: draft.counterparty.trim() || null,
              category: draft.category.trim() || 'Outros',
              source: draft.appointmentId
                ? 'appointment'
                : draft.dealId
                  ? 'deal'
                  : 'manual',
            }))
          )
        : await supabase.from('finance_receivable_schedules').insert(
            rows.map((row) => ({
              ...row,
              sale_id: draft.saleId || null,
              voucher_id: draft.voucherId || null,
              source: draft.saleId
                ? 'sale'
                : draft.voucherId
                  ? 'voucher'
                  : draft.appointmentId
                    ? 'appointment'
                    : draft.dealId
                      ? 'deal'
                      : 'manual',
            }))
          );
    setSaving(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(
      draft.kind === 'payable' ? 'Conta registada.' : 'Prestação agendada.'
    );
    setDialogOpen(false);
    await load();
  }

  async function settle() {
    if (!settlement) return;
    if (settlement.method === 'cash' && !cashSession) {
      toast.error('Abra o caixa antes de liquidar em dinheiro.');
      return;
    }
    setSaving(true);
    const ids = settlement.ids?.length ? settlement.ids : [settlement.id];
    const results = await Promise.all(
      ids.map((id) =>
        supabase.rpc(
          settlement.kind === 'payable'
            ? 'settle_owner_payable'
            : 'settle_owner_receivable',
          settlement.kind === 'payable'
            ? {
                p_payable_id: id,
                p_payment_method: settlement.method,
                p_payment_reference: settlement.reference || null,
                p_cash_session_id: cashSession?.id ?? null,
              }
            : {
                p_receivable_id: id,
                p_payment_method: settlement.method,
                p_payment_reference: settlement.reference || null,
                p_cash_session_id: cashSession?.id ?? null,
              }
        )
      )
    );
    setSaving(false);
    const failed = results.find((result) => result.error);
    if (failed?.error) return toast.error(failed.error.message);
    toast.success(
      settlement.kind === 'payable'
        ? `${ids.length} conta(s) marcada(s) como paga(s).`
        : 'Prestação marcada como recebida.'
    );
    setSettlement(null);
    setSelectedPayableIds([]);
    await load();
  }

  function downloadReport() {
    const rows = [
      [
        'Tipo',
        'Descrição',
        'Entidade/Cliente',
        'Categoria',
        'Valor',
        'Moeda',
        'Vencimento',
        'Estado',
      ],
      ...payables.map((item) => [
        'Conta a pagar',
        item.description,
        item.supplier,
        item.category,
        item.amount,
        item.currency,
        item.due_date,
        item.status,
      ]),
      ...receivables.map((item) => [
        'A receber',
        item.description,
        item.contact?.name,
        'Prestação',
        item.amount,
        item.currency,
        item.due_date,
        item.status,
      ]),
    ];
    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
    const url = URL.createObjectURL(
      new Blob([content], { type: 'text/csv;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-tesouraria-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function confirmImport(rows: TreasuryImportRow[], filename: string) {
    if (!accountId || !user) return;
    const payablesToInsert = rows
      .filter((row) => row.kind === 'payable')
      .map((row) => ({
        account_id: accountId,
        description: row.description.trim(),
        supplier: row.counterparty.trim() || null,
        category: row.category || 'Outros',
        amount: row.amount,
        currency: row.currency || defaultCurrency,
        due_date: row.date,
        status: row.settled ? 'paid' : 'pending',
        paid_at: row.settled ? `${row.date}T12:00:00Z` : null,
        payment_method: row.settled ? 'bank_transfer' : null,
        notes: `Importado automaticamente de ${filename}. Confiança: ${Math.round(row.confidence * 100)}%.`,
        document_reference: row.reference || filename,
        created_by_user_id: user.id,
        source: 'manual',
      }));
    const receivablesToInsert = rows
      .filter((row) => row.kind === 'receivable')
      .map((row) => ({
        account_id: accountId,
        description: row.description.trim(),
        amount: row.amount,
        currency: row.currency || defaultCurrency,
        due_date: row.date,
        status: row.settled ? 'received' : 'pending',
        received_at: row.settled ? `${row.date}T12:00:00Z` : null,
        payment_method: row.settled ? 'bank_transfer' : null,
        notes: `Importado automaticamente de ${filename}. Entidade: ${row.counterparty || 'não identificada'}. Confiança: ${Math.round(row.confidence * 100)}%.`,
        document_reference: row.reference || filename,
        created_by_user_id: user.id,
        source: 'manual',
      }));
    const [payableResult, receivableResult] = await Promise.all([
      payablesToInsert.length
        ? supabase.from('finance_payables').insert(payablesToInsert)
        : Promise.resolve({ error: null }),
      receivablesToInsert.length
        ? supabase
            .from('finance_receivable_schedules')
            .insert(receivablesToInsert)
        : Promise.resolve({ error: null }),
    ]);
    const error = payableResult.error || receivableResult.error;
    if (error) {
      toast.error(error.message);
      throw error;
    }
    toast.success(`${rows.length} movimento(s) importado(s).`);
    await load();
  }

  if (!isOwner) return null;
  if (loading)
    return (
      <div className="flex min-h-52 items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  if (loadError)
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <ReceiptText className="text-muted-foreground mx-auto mb-3 size-8" />
          <p className="font-semibold">Não foi possível carregar a tesouraria</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-lg text-sm">
            {loadError}
          </p>
          <Button className="mt-5" variant="outline" onClick={() => void load()}>
            <RefreshCw /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  if (schemaMissing)
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <CalendarDays className="text-muted-foreground mx-auto mb-3 size-8" />
          <p className="font-semibold">Tesouraria pronta para ativação</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Aplique a migração <code>084_owner_treasury.sql</code> no Supabase.
          </p>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5 sm:p-6 dark:border-emerald-950 dark:from-emerald-950/40 dark:via-slate-950 dark:to-cyan-950/30">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="mb-3 bg-emerald-600 text-white hover:bg-emerald-600">
              Área reservada
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight">
              Tesouraria inteligente
            </h2>
            <p className="text-muted-foreground mt-1 max-w-xl text-sm">
              Antecipe compromissos, acompanhe a liquidez e transforme
              documentos em movimentos financeiros auditáveis.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" render={<Link href="/finance?tab=pos" />}>
              <WalletCards /> Abrir POS
            </Button>
            <Button variant="secondary" render={<Link href="/agenda" />}>
              <CalendarDays /> Agenda
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp /> Importar documento
            </Button>
            <Button variant="outline" onClick={downloadReport}>
              <Download /> Relatório CSV
            </Button>
            <Button onClick={() => openCreate('payable')}>
              <Plus /> Nova conta
            </Button>
            <Button variant="secondary" onClick={() => openCreate('receivable')}>
              <ArrowDownRight /> Novo recebimento
            </Button>
          </div>
        </div>
      </div>
      <TreasuryImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existing={[
          ...payables.map((item) => ({
            kind: 'payable' as const,
            amount: Number(item.amount),
            date: item.due_date,
            description: item.description,
          })),
          ...receivables.map((item) => ({
            kind: 'receivable' as const,
            amount: Number(item.amount),
            date: item.due_date,
            description: item.description,
          })),
        ]}
        onConfirm={confirmImport}
      />
      {accountId ? <FinanceReminderSettings accountId={accountId} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Metric
          label="A pagar"
          value={formatCurrency(metrics.payable, defaultCurrency)}
        />
        <Metric
          label="A receber"
          value={formatCurrency(metrics.receivable, defaultCurrency)}
        />
        <Metric
          label="Vencidos"
          value={String(metrics.overdue)}
          danger={metrics.overdue > 0}
        />
        <Metric
          label="Contas já pagas"
          value={formatCurrency(metrics.paid, defaultCurrency)}
        />
        <Metric
          label="Saldo projetado do mês"
          value={formatCurrency(metrics.projectedNet, defaultCurrency)}
          danger={metrics.projectedNet < 0}
        />
        <Metric
          label="Saldo realizado"
          value={formatCurrency(metrics.realizedNet, defaultCurrency)}
          danger={metrics.realizedNet < 0}
        />
      </div>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-muted/70 p-1 sm:grid-cols-4">
          <TabsTrigger value="overview" className="h-11 gap-2 rounded-xl text-xs sm:text-sm"><LayoutDashboard className="size-4" />Visão geral</TabsTrigger>
          <TabsTrigger value="calendar" className="h-11 gap-2 rounded-xl text-xs sm:text-sm"><CalendarDays className="size-4" />Calendário</TabsTrigger>
          <TabsTrigger value="payables" className="h-11 gap-2 rounded-xl text-xs sm:text-sm"><ArrowUpRight className="size-4" />Contas a pagar</TabsTrigger>
          <TabsTrigger value="receivables" className="h-11 gap-2 rounded-xl text-xs sm:text-sm"><ArrowDownRight className="size-4" />A receber</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <TreasuryOverview
            payables={payables}
            receivables={receivables}
            partialSales={partialSales}
            currency={defaultCurrency}
            cashSession={cashSession}
          />
        </TabsContent>
        <TabsContent value="calendar">
          <TreasuryCalendar
            month={month}
            setMonth={setMonth}
            payables={payables}
            receivables={receivables}
            currency={defaultCurrency}
            onCreate={(date) => {
              setEditing(null);
              setDraft({ ...emptyDraft(), kind: 'payable', dueDate: date });
              setDialogOpen(true);
            }}
          />
        </TabsContent>
        <TabsContent value="payables">
          <PayableSupplierSummary
            payables={payables}
            currency={defaultCurrency}
          />
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-2">
            <div className="flex gap-1 rounded-xl bg-background p-1">
              <Button
                size="sm"
                variant={payableView === 'pending' ? 'default' : 'ghost'}
                onClick={() => {
                  setPayableView('pending');
                  setStatusFilter('all');
                }}
              >
                A pagar ({payables.filter((item) => item.status === 'pending').length})
              </Button>
              <Button
                size="sm"
                variant={payableView === 'paid' ? 'default' : 'ghost'}
                onClick={() => {
                  setPayableView('paid');
                  setStatusFilter('all');
                }}
              >
                Concluídas ({payables.filter((item) => item.status === 'paid').length})
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {payableView === 'pending'
                ? 'Ordenadas por vencimento: o que precisa de pagar aparece primeiro.'
                : 'Histórico de pagamentos concluídos, do mais recente para o mais antigo.'}
            </p>
          </div>
          <EntryFilters
            search={search}
            setSearch={setSearch}
            status={statusFilter}
            setStatus={setStatusFilter}
          />
          {payableView === 'pending' && selectedPayableIds.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <span className="text-sm font-medium">
                {selectedPayableIds.length} conta(s) selecionada(s)
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedPayableIds([])}>
                  Limpar
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    setSettlement({
                      kind: 'payable',
                      id: selectedPayableIds[0],
                      ids: selectedPayableIds,
                      description: `${selectedPayableIds.length} contas a pagar selecionadas`,
                      method: 'bank_transfer',
                      reference: '',
                    })
                  }
                >
                  <CheckCircle2 /> Pagar selecionadas
                </Button>
              </div>
            </div>
          ) : null}
          <EntriesList
            kind="payable"
            entries={visiblePayables}
            currency={defaultCurrency}
            selectedIds={selectedPayableIds}
            onToggleSelection={(id) =>
              setSelectedPayableIds((current) =>
                current.includes(id)
                  ? current.filter((item) => item !== id)
                  : [...current, id]
              )
            }
            onSettle={(entry) =>
              setSettlement({
                kind: 'payable',
                id: entry.id,
                description: entry.description,
                method: 'bank_transfer',
                reference: '',
              })
            }
            onEdit={(entry) => openEdit('payable', entry)}
          />
        </TabsContent>
        <TabsContent value="receivables">
          <div className="space-y-4">
            {partialSales
              .filter(
                (sale) =>
                  !receivables.some(
                    (item) =>
                      item.sale_id === sale.id && item.status === 'pending'
                  )
              )
              .map((sale) => (
                <div
                  key={sale.id}
                  className="border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Venda #{sale.sale_number} ·{' '}
                      {sale.contact?.name || 'Cliente'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Pagamento parcial: falta{' '}
                      {formatCurrency(sale.balance_due, sale.currency)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => openCreate('receivable', sale)}
                  >
                    Definir data do restante
                  </Button>
                </div>
              ))}
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => openCreate('receivable')}
              >
                <Plus /> Agendar prestação
              </Button>
            </div>
            <EntryFilters
              search={search}
              setSearch={setSearch}
              status={statusFilter}
              setStatus={setStatusFilter}
            />
            <EntriesList
              kind="receivable"
              entries={filterEntries(receivables)}
              currency={defaultCurrency}
              onSettle={(entry) =>
                setSettlement({
                  kind: 'receivable',
                  id: entry.id,
                  description: entry.description,
                  method: 'bank_transfer',
                  reference: '',
                })
              }
              onEdit={(entry) => openEdit('receivable', entry)}
            />
          </div>
        </TabsContent>
      </Tabs>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Editar ${draft.kind === 'payable' ? 'conta' : 'prestação'}`
                : draft.kind === 'payable'
                  ? 'Nova conta a pagar'
                  : 'Nova prestação a receber'}
            </DialogTitle>
            <DialogDescription>
              Registe o valor e a data prevista para o movimento.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Descrição">
              <Input
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
            {draft.kind === 'payable' ? (
              <>
                <Field label="Fornecedor">
                  <Input
                    list="treasury-suppliers"
                    placeholder="Selecione ou escreva um fornecedor"
                    value={draft.counterparty}
                    onChange={(e) =>
                      setDraft({ ...draft, counterparty: e.target.value })
                    }
                  />
                  <datalist id="treasury-suppliers">
                    {Array.from(
                      new Set(
                        payables.map((item) => item.supplier).filter(Boolean)
                      )
                    ).map((supplier) => (
                      <option key={supplier} value={supplier!}>
                        {supplier}
                      </option>
                    ))}
                  </datalist>
                </Field>
                <Field label="Categoria">
                  <select
                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({ ...draft, category: e.target.value })
                    }
                  >
                    {PAYABLE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Cliente">
                  <ContactSearchSelect
                    contacts={contacts}
                    value={draft.contactId}
                    onChange={(value) =>
                      setDraft({ ...draft, contactId: value })
                    }
                    placeholder="Sem cliente"
                    searchPlaceholder="Buscar por nome, telefone, referência, email..."
                    emptyOptionLabel="Sem cliente"
                  />
                </Field>
                <Field label="Voucher relacionado (opcional)">
                  <SearchableSelect
                    value={draft.voucherId}
                    onChange={(value) =>
                      setDraft({ ...draft, voucherId: value })
                    }
                    placeholder="Nenhum voucher"
                    searchPlaceholder="Pesquisar código ou cliente..."
                    options={vouchers.map((item) => ({
                      value: item.id,
                      label: `${item.code} · ${item.owner?.name || item.recipient_name || 'Cliente'}`,
                      search: `${item.code} ${item.owner?.name ?? ''} ${item.recipient_name ?? ''}`,
                    }))}
                  />
                </Field>
              </>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Marcação relacionada">
                <SearchableSelect
                  value={draft.appointmentId}
                  onChange={(value) => {
                    const appointment = appointments.find(
                      (item) => item.id === value
                    );
                    setDraft({
                      ...draft,
                      appointmentId: value,
                      contactId:
                        draft.kind === 'receivable'
                          ? draft.contactId || appointment?.contact_id || ''
                          : '',
                    });
                  }}
                  placeholder="Nenhuma marcação"
                  searchPlaceholder="Pesquisar por cliente, serviço ou data..."
                  options={appointments.map((item) => ({
                    value: item.id,
                    label: `${new Date(item.scheduled_start).toLocaleDateString('pt-PT')} · ${item.contact?.name || item.service?.name || 'Marcação'}`,
                    search: `${new Date(item.scheduled_start).toLocaleDateString('pt-PT')} ${item.contact?.name ?? ''} ${item.contact?.phone ?? ''} ${item.service?.name ?? ''}`,
                  }))}
                />
              </Field>
              <Field label="Negócio do funil">
                <SearchableSelect
                  value={draft.dealId}
                  onChange={(value) => {
                    const deal = deals.find((item) => item.id === value);
                    setDraft({
                      ...draft,
                      dealId: value,
                      contactId:
                        draft.kind === 'receivable'
                          ? draft.contactId || deal?.contact_id || ''
                          : '',
                    });
                  }}
                  placeholder="Nenhum negócio"
                  searchPlaceholder="Pesquisar título ou cliente..."
                  options={deals.map((item) => ({
                    value: item.id,
                    label: item.title,
                    search: `${item.title} ${item.contact?.name ?? ''}`,
                  }))}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  disabled={Boolean(editing?.settled)}
                  value={draft.amount}
                  onChange={(e) =>
                    setDraft({ ...draft, amount: e.target.value })
                  }
                />
              </Field>
              <Field label="Vencimento">
                <Input
                  type="date"
                  disabled={Boolean(editing?.settled)}
                  value={draft.dueDate}
                  onChange={(e) =>
                    setDraft({ ...draft, dueDate: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número de parcelas">
                <Input
                  type="number"
                  min="1"
                  max="60"
                  disabled={Boolean(editing)}
                  value={draft.installmentCount}
                  onChange={(e) =>
                    setDraft({ ...draft, installmentCount: e.target.value })
                  }
                />
              </Field>
              <Field label="Documento / referência">
                <Input
                  value={draft.documentReference}
                  placeholder="Fatura, contrato, recibo..."
                  onChange={(e) =>
                    setDraft({ ...draft, documentReference: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Observações">
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
            {editing && (
              <Field label="Motivo da correção">
                <Textarea
                  value={draft.correctionReason}
                  placeholder="Descreva por que este registo foi alterado"
                  onChange={(e) =>
                    setDraft({ ...draft, correctionReason: e.target.value })
                  }
                />
              </Field>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}{' '}
              {editing ? 'Guardar correção' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(settlement)}
        onOpenChange={(open) => !open && setSettlement(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liquidar movimento</DialogTitle>
            <DialogDescription>{settlement?.description}</DialogDescription>
          </DialogHeader>
          {settlement && (
            <div className="grid gap-4">
              <Field label="Método de pagamento">
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  value={settlement.method}
                  onChange={(e) =>
                    setSettlement({
                      ...settlement,
                      method: e.target.value as FinancePaymentMethod,
                    })
                  }
                >
                  <option value="bank_transfer">Transferência</option>
                  <option value="cash">Dinheiro</option>
                  <option value="card">Cartão</option>
                  <option value="mb_way">MB Way</option>
                  <option value="multibanco">Multibanco</option>
                  <option value="other">Outro</option>
                </select>
              </Field>
              {settlement.method === 'cash' && (
                <div
                  className={cn(
                    'rounded-md border p-3 text-sm',
                    cashSession
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-destructive/30 bg-destructive/5'
                  )}
                >
                  {cashSession
                    ? `Será conciliado com o caixa aberto em ${new Date(cashSession.opened_at).toLocaleString('pt-PT')}.`
                    : 'Não existe caixa aberto. Abra o caixa antes de continuar.'}
                </div>
              )}
              <Field label="Referência do pagamento">
                <Input
                  value={settlement.reference}
                  onChange={(e) =>
                    setSettlement({ ...settlement, reference: e.target.value })
                  }
                  placeholder="Comprovativo, operação, recibo..."
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettlement(null)}>
              Cancelar
            </Button>
            <Button
              onClick={settle}
              disabled={
                saving || (settlement?.method === 'cash' && !cashSession)
              }
            >
              {saving && <Loader2 className="animate-spin" />} Confirmar
              liquidação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; search?: string }>;
  placeholder: string;
  searchPlaceholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);
  const normalized = query.trim().toLocaleLowerCase('pt');
  const filtered = normalized
    ? options.filter((option) =>
        `${option.label} ${option.search ?? ''}`
          .toLocaleLowerCase('pt')
          .includes(normalized)
      )
    : options;
  return (
    <div className="relative">
      <button
        type="button"
        className="border-input bg-background flex h-9 w-full items-center justify-between rounded-md border px-3 text-left text-sm"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected?.label || placeholder}
        </span>
        <Search className="text-muted-foreground size-4" />
      </button>
      {open && (
        <div className="border-border bg-popover absolute z-50 mt-1 w-full rounded-lg border p-2 shadow-xl">
          <div className="relative mb-2">
            <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
            <Input
              autoFocus
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
              }}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button
              type="button"
              className="hover:bg-muted flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm"
              onClick={() => {
                onChange('');
                setOpen(false);
                setQuery('');
              }}
            >
              {placeholder}
              {!value && <CheckCircle2 className="text-primary size-4" />}
            </button>
            {filtered.slice(0, 50).map((option) => (
              <button
                key={option.value}
                type="button"
                className="hover:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <span className="truncate">{option.label}</span>
                {value === option.value && (
                  <CheckCircle2 className="text-primary size-4 shrink-0" />
                )}
              </button>
            ))}
            {!filtered.length && (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                Nenhum resultado encontrado.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <Card
      className={cn(
        'group overflow-hidden border-slate-200 shadow-none transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800',
        danger &&
          'border-rose-200 bg-rose-50/40 dark:border-rose-950 dark:bg-rose-950/10'
      )}
    >
      <CardContent className="p-4">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {label}
          </p>
          <span
            className={cn(
              'size-2 rounded-full bg-emerald-400',
              danger && 'bg-rose-500'
            )}
          />
        </div>
        <p
          className={cn(
            'text-2xl font-semibold tracking-tight',
            danger && 'text-rose-600'
          )}
        >
          {value}
        </p>
        <div
          className={cn(
            'mt-3 h-1 rounded-full bg-emerald-500/15 after:block after:h-full after:w-2/3 after:rounded-full after:bg-emerald-500',
            danger && 'bg-rose-500/15 after:bg-rose-500'
          )}
        />
      </CardContent>
    </Card>
  );
}

function EntryFilters({
  search,
  setSearch,
  status,
  setStatus,
}: {
  search: string;
  setSearch: (value: string) => void;
  status: 'all' | 'pending' | 'settled' | 'overdue';
  setStatus: (value: 'all' | 'pending' | 'settled' | 'overdue') => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
        <Input
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar descrição, entidade ou documento"
        />
      </div>
      <Filter className="text-muted-foreground size-4" />
      <select
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        value={status}
        onChange={(e) => setStatus(e.target.value as typeof status)}
      >
        <option value="all">Todos os estados</option>
        <option value="pending">Pendentes</option>
        <option value="overdue">Vencidos</option>
        <option value="settled">Liquidados</option>
      </select>
    </div>
  );
}

function TreasuryOverview({
  payables,
  receivables,
  partialSales,
  currency,
  cashSession,
}: {
  payables: Payable[];
  receivables: Receivable[];
  partialSales: FinanceSale[];
  currency: string;
  cashSession: FinanceCashSession | null;
}) {
  const next = [
    ...payables.map((item) => ({ ...item, kind: 'payable' as const })),
    ...receivables.map((item) => ({ ...item, kind: 'receivable' as const })),
  ]
    .filter((item) => item.status === 'pending')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 6);
  const categoryTotals = payables
    .filter((item) => item.status === 'pending')
    .reduce<Record<string, number>>(
      (acc, item) => ({
        ...acc,
        [item.category]: (acc[item.category] ?? 0) + Number(item.amount),
      }),
      {}
    );
  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maximum = Math.max(1, ...topCategories.map((item) => item[1]));
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-5" /> Próximos compromissos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {next.length ? (
            next.map((item) => (
              <div
                key={`${item.kind}-${item.id}`}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      'rounded-full p-2',
                      item.kind === 'payable'
                        ? 'bg-red-500/10 text-red-600'
                        : 'bg-emerald-500/10 text-emerald-600'
                    )}
                  >
                    {item.kind === 'payable' ? (
                      <ArrowUpRight className="size-4" />
                    ) : (
                      <ArrowDownRight className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.description}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {dateLabel(item.due_date)}
                    </p>
                  </div>
                </div>
                <strong
                  className={
                    item.kind === 'payable'
                      ? 'text-red-600'
                      : 'text-emerald-600'
                  }
                >
                  {item.kind === 'payable' ? '−' : '+'}
                  {formatCurrency(
                    Number(item.amount),
                    item.currency || currency
                  )}
                </strong>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nenhum compromisso pendente.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="size-5" /> Conciliação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {cashSession ? 'Caixa aberto e disponível' : 'Caixa fechado'}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Pagamentos em dinheiro são refletidos automaticamente no caixa.
            </p>
            <Button
              render={<Link href="/finance?tab=cash" />}
              nativeButton={false}
              variant="outline"
              size="sm"
              className="mt-3"
            >
              Ir para o caixa <ExternalLink />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-5" /> CRM financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Vendas com saldo</span>
              <strong>{partialSales.length}</strong>
            </div>
            <div className="flex justify-between">
              <span>Prestações pendentes</span>
              <strong>
                {receivables.filter((item) => item.status === 'pending').length}
              </strong>
            </div>
            <Button
              render={<Link href="/finance?tab=sales" />}
              nativeButton={false}
              variant="outline"
              size="sm"
              className="mt-2 w-full"
            >
              Ver vendas <ExternalLink />
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="size-5" /> Despesas por categoria
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {topCategories.length ? (
            topCategories.map(([category, amount]) => (
              <div key={category}>
                <div className="flex justify-between text-xs">
                  <span>{category}</span>
                  <strong>{formatCurrency(amount, currency)}</strong>
                </div>
                <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${(amount / maximum) * 100}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              Sem despesas pendentes.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PayableSupplierSummary({
  payables,
  currency,
}: {
  payables: Payable[];
  currency: string;
}) {
  const suppliers = Object.values(
    payables
      .filter((item) => item.status === 'pending')
      .reduce<Record<string, { name: string; count: number; amount: number }>>(
        (summary, item) => {
          const name = item.supplier?.trim() || 'Fornecedor não identificado';
          const key = name.toLocaleLowerCase('pt');
          const current = summary[key] ?? { name, count: 0, amount: 0 };
          current.count += 1;
          current.amount += Number(item.amount);
          summary[key] = current;
          return summary;
        },
        {}
      )
  ).sort((left, right) => right.amount - left.amount);

  if (!suppliers.length) return null;

  return (
    <section className="mb-4 rounded-xl border bg-muted/20 p-4">
      <div className="mb-3">
        <h3 className="font-semibold">Fornecedores e contas pendentes</h3>
        <p className="text-muted-foreground text-sm">
          Contas a pagar são agrupadas por fornecedor e categoria, nunca por cliente.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {suppliers.slice(0, 8).map((supplier) => (
          <div key={supplier.name} className="rounded-lg border bg-background p-3">
            <p className="truncate text-sm font-medium" title={supplier.name}>
              {supplier.name}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {supplier.count} conta{supplier.count === 1 ? '' : 's'} pendente{supplier.count === 1 ? '' : 's'}
            </p>
            <strong className="mt-2 block text-sm">
              {formatCurrency(supplier.amount, currency)}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function EntriesList({
  kind,
  entries,
  currency,
  onSettle,
  onEdit,
  selectedIds = [],
  onToggleSelection,
}: {
  kind: Draft['kind'];
  entries: Array<Payable | Receivable>;
  currency: string;
  onSettle: (entry: Payable | Receivable) => void;
  onEdit: (entry: Payable | Receivable) => void;
  selectedIds?: string[];
  onToggleSelection?: (id: string) => void;
}) {
  if (!entries.length)
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        Nenhum registo.
      </div>
    );
  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const pending = entry.status === 'pending';
        const counterparty =
          'supplier' in entry ? entry.supplier : entry.contact?.name;
        return (
          <div
            key={entry.id}
            className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          >
            <div className="flex min-w-0 items-start gap-3">
              {kind === 'payable' && pending && onToggleSelection ? (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(entry.id)}
                  onChange={() => onToggleSelection(entry.id)}
                  aria-label={`Selecionar ${entry.description}`}
                  className="mt-1 size-4 accent-primary"
                />
              ) : null}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{entry.description}</p>
                <Badge
                  variant={
                    pending
                      ? entry.due_date < today()
                        ? 'destructive'
                        : 'secondary'
                      : 'outline'
                  }
                  className={cn(
                    !pending && 'border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                  )}
                >
                  {pending
                    ? entry.due_date < today()
                      ? 'Vencido'
                      : 'Pendente'
                    : kind === 'payable'
                      ? 'PAGO'
                      : 'Recebida'}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">
                {counterparty || 'Sem entidade'} · vence{' '}
                {dateLabel(entry.due_date)}
              </p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {kind === 'receivable' && entry.contact_id && (
                  <Link
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                    href={`/contacts/${entry.contact_id}`}
                  >
                    <Users className="size-3" /> Cliente
                  </Link>
                )}
                {entry.appointment_id && (
                  <Link
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                    href={`/agenda?appointment=${entry.appointment_id}`}
                  >
                    <CalendarCheck className="size-3" /> Agenda
                  </Link>
                )}
                {'sale_id' in entry && entry.sale_id && (
                  <Link
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                    href="/finance?tab=sales"
                  >
                    <ReceiptText className="size-3" /> Venda #
                    {entry.sale?.sale_number}
                  </Link>
                )}
                {'voucher_id' in entry && entry.voucher_id && (
                  <Link
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                    href="/finance?tab=vouchers"
                  >
                    <ExternalLink className="size-3" /> Voucher
                  </Link>
                )}
                {entry.deal_id && (
                  <Link
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                    href="/pipeline"
                  >
                    <TrendingUp className="size-3" /> Negócio
                  </Link>
                )}
              </div>
            </div>
            </div>
            <div className="flex items-center gap-3">
              <strong>
                {formatCurrency(
                  Number(entry.amount),
                  entry.currency || currency
                )}
              </strong>
              <Button size="sm" variant="ghost" onClick={() => onEdit(entry)}>
                <Pencil /> Editar
              </Button>
              {pending && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSettle(entry)}
                >
                  <CheckCircle2 />{' '}
                  {kind === 'payable' ? 'Marcar paga' : 'Marcar recebida'}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TreasuryCalendar({
  month,
  setMonth,
  payables,
  receivables,
  currency,
  onCreate,
}: {
  month: Date;
  setMonth: (value: Date) => void;
  payables: Payable[];
  receivables: Receivable[];
  currency: string;
  onCreate: (date: string) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const startOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((startOffset + days) / 7) * 7 },
    (_, index) => index - startOffset + 1
  );
  const events = [
    ...payables.map((item) => ({ ...item, kind: 'payable' as const })),
    ...receivables.map((item) => ({ ...item, kind: 'receivable' as const })),
  ];
  const pendingEvents = events.filter((event) => event.status === 'pending');
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const monthEvents = pendingEvents.filter((event) =>
    dateKey(event.due_date).startsWith(monthPrefix)
  );
  const monthPayables = monthEvents
    .filter((event) => event.kind === 'payable')
    .reduce((sum, event) => sum + Number(event.amount), 0);
  const monthReceivables = monthEvents
    .filter((event) => event.kind === 'receivable')
    .reduce((sum, event) => sum + Number(event.amount), 0);
  return (
    <Card
      aria-label={`No mês: ${formatCurrency(monthPayables, currency)} a pagar e ${formatCurrency(monthReceivables, currency)} a receber.`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
          >
            <ChevronLeft />
          </Button>
          <CardTitle className="capitalize">
            {new Intl.DateTimeFormat('pt-PT', {
              month: 'long',
              year: 'numeric',
            }).format(month)}
          </CardTitle>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            Clique num dia para adicionar uma conta a pagar.
          </span>
          <span className="flex gap-3 font-medium">
            <span className="text-red-700">
              A pagar: {formatCurrency(monthPayables, currency)}
            </span>
            <span className="text-emerald-700">
              A receber: {formatCurrency(monthReceivables, currency)}
            </span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 text-center text-xs font-medium">
          <span>Seg</span>
          <span>Ter</span>
          <span>Qua</span>
          <span>Qui</span>
          <span>Sex</span>
          <span>Sáb</span>
          <span>Dom</span>
        </div>
        <div className="mt-2 grid grid-cols-7">
          {cells.map((day, index) => {
            const key =
              day > 0 && day <= days
                ? `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                : '';
            const dayEvents = events.filter(
              (event) => dateKey(event.due_date) === key
            );
            return (
              <div
                key={index}
                onClick={() => key && onCreate(key)}
                className={cn(
                  'border-border min-h-28 border p-2 transition-colors',
                  key && 'hover:bg-primary/5 cursor-pointer',
                  !key && 'bg-muted/30'
                )}
              >
                <span className="text-xs">{key ? day : ''}</span>
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={`${event.kind}-${event.id}`}
                    title={`${event.description} · ${formatCurrency(Number(event.amount), event.currency || currency)}`}
                    className={cn(
                      'mt-1 truncate rounded px-1.5 py-1 text-[10px] font-medium',
                      event.status === 'paid' || event.status === 'received'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                        : event.kind === 'payable'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                          : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
                    )}
                  >
                    {event.kind === 'payable' ? '−' : '+'}{' '}
                    {event.status === 'paid' || event.status === 'received'
                      ? 'PAGO · '
                      : ''}
                    {event.description}
                  </div>
                ))}
                {dayEvents.length > 3 ? (
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    +{dayEvents.length - 3} lançamento(s)
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="text-muted-foreground mt-3 flex gap-4 text-xs">
          <span>🔴 A pagar</span>
          <span>🟢 A receber</span>
          <span className="ml-auto">
            Duplo clique num dia para criar uma conta
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
