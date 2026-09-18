'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  Link2,
  Loader2,
  MessageSquare,
  PlugZap,
  RefreshCw,
  Settings2,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { createClient } from '@/lib/supabase/client';
import type { ClinicProduct, FinanceInvoiceRequest, FinanceSale } from '@/types';

type IntegrationSetting = {
  id: string;
  account_id: string;
  category: 'fiscal' | 'payments' | 'ads' | 'email' | 'booking_ai';
  provider: string;
  status: 'not_configured' | 'configured' | 'active' | 'paused' | 'error';
  display_name: string;
  config: Record<string, unknown>;
  last_error: string | null;
  connected_at: string | null;
};

type PaymentLink = {
  id: string;
  sale_id: string | null;
  contact_id: string | null;
  provider: string;
  status: 'draft' | 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';
  amount: number;
  currency: string;
  description: string | null;
  payment_url: string | null;
  external_session_id?: string | null;
  external_payment_intent_id?: string | null;
  created_at: string;
  sale?: FinanceSale | null;
};

type ProductWithStock = ClinicProduct & {
  low_stock_threshold?: number;
  supplier_name?: string | null;
  supplier_reference?: string | null;
  cost_price?: number;
};

type StockMovement = {
  id: string;
  product_id: string;
  movement_type: 'sale' | 'return' | 'adjustment' | 'purchase';
  quantity: number;
  stock_after: number;
  notes: string | null;
  created_at: string;
  product?: Pick<ClinicProduct, 'id' | 'name' | 'sku'> | null;
};

type FinanceGoal = {
  id: string;
  account_id: string;
  title: string;
  category: 'revenue' | 'rent' | 'car' | 'salary' | 'supplier' | 'tax' | 'savings' | 'other';
  goal_type: 'manual' | 'revenue_paid';
  target_amount: number;
  current_amount: number;
  currency: string;
  period_start: string;
  period_end: string | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  alert_threshold_percent: number;
  notes: string | null;
  created_at: string;
  entries?: FinanceGoalEntry[];
  ledger_amount?: number;
  entries_count?: number;
  last_entry_on?: string | null;
};

type FinanceGoalEntry = {
  id: string;
  goal_id: string;
  entry_type: 'contribution' | 'withdrawal' | 'adjustment';
  amount: number;
  occurred_on: string;
  notes: string | null;
  created_at: string;
};

const GOAL_CATEGORIES: Record<FinanceGoal['category'], string> = {
  revenue: 'Receita',
  rent: 'Aluguel',
  car: 'Carro',
  salary: 'Salários',
  supplier: 'Fornecedores',
  tax: 'Impostos',
  savings: 'Reserva',
  other: 'Outro',
};

const PROVIDERS = [
  {
    category: 'fiscal',
    provider: 'vendus',
    displayName: 'Vendus / Cegid',
    detail: 'Faturação certificada, documentos fiscais e preparação SAF-T.',
  },
  {
    category: 'fiscal',
    provider: 'manual_fiscal',
    displayName: 'Faturação manual',
    detail: 'Usar enquanto a integração certificada não estiver ligada.',
  },
  {
    category: 'payments',
    provider: 'easypay',
    displayName: 'Easypay',
    detail: 'MB Way, Referência Multibanco e reconciliação automática.',
  },
  {
    category: 'payments',
    provider: 'stripe',
    displayName: 'Stripe',
    detail: 'Cartão, Apple Pay/Google Pay e links de pagamento online.',
  },
  {
    category: 'payments',
    provider: 'sumup',
    displayName: 'SumUp',
    detail: 'Checkout online por link e reconciliação automática no financeiro.',
  },
  {
    category: 'email',
    provider: 'brevo',
    displayName: 'Brevo',
    detail: 'Newsletters, sincronização de segmentos e consentimentos RGPD.',
  },
  {
    category: 'ads',
    provider: 'meta_google_ads',
    displayName: 'Meta/Google Ads',
    detail: 'Conversões de leads, marcações e vendas para otimizar anúncios.',
  },
  {
    category: 'booking_ai',
    provider: 'booking_ai',
    displayName: 'IA de agendamento',
    detail: 'Agente com acesso a serviços, horários, preços e base de conhecimento.',
  },
] as const;

const STATUS_LABEL: Record<IntegrationSetting['status'], string> = {
  not_configured: 'Por configurar',
  configured: 'Configurado',
  active: 'Ativo',
  paused: 'Pausado',
  error: 'Erro',
};

function statusClass(status: IntegrationSetting['status']) {
  if (status === 'active') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500';
  if (status === 'configured') return 'border-blue-500/30 bg-blue-500/10 text-blue-500';
  if (status === 'error') return 'border-red-500/30 bg-red-500/10 text-red-500';
  return 'border-muted bg-muted text-muted-foreground';
}

export function BusinessHubPage({ focus = '' }: { focus?: 'goals' | '' }) {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user, defaultCurrency, canEditSettings } = useAuth();

  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationSetting[]>([]);
  const [sales, setSales] = useState<FinanceSale[]>([]);
  const [invoiceRequests, setInvoiceRequests] = useState<FinanceInvoiceRequest[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [goals, setGoals] = useState<FinanceGoal[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState({
    title: '',
    category: 'revenue' as FinanceGoal['category'],
    goalType: 'revenue_paid' as FinanceGoal['goal_type'],
    targetAmount: '',
    currentAmount: '',
    periodEnd: '',
    notes: '',
  });
  const [goalEntryDrafts, setGoalEntryDrafts] = useState<
    Record<string, { amount: string; notes: string }>
  >({});
  const [stockDrafts, setStockDrafts] = useState<
    Record<string, { quantity: string; reason: string }>
  >({});
  const [paymentMethodDrafts, setPaymentMethodDrafts] = useState<Record<string, string>>({});
  const [sumUpStatus, setSumUpStatus] = useState<{
    configured: boolean;
    merchantCode: string | null;
    verified?: boolean;
    error?: string | null;
    mode: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [
      integrationsRes,
      salesRes,
      invoiceRequestsRes,
      linksRes,
      productsRes,
      stockMovementsRes,
      goalsRes,
    ] =
      await Promise.all([
        supabase
          .from('business_integration_settings')
          .select('*')
          .eq('account_id', accountId),
        supabase
          .from('finance_sales')
          .select('*, contact:contacts(*), invoice_request:finance_invoice_requests(*)')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('finance_invoice_requests')
          .select('*, sale:finance_sales(*), contact:contacts(*)')
          .eq('account_id', accountId)
          .order('requested_at', { ascending: false })
          .limit(30),
        supabase
          .from('finance_payment_links')
          .select(
            '*, sale:finance_sales(*, contact:contacts(*), items:finance_sale_items(name_snapshot))'
          )
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('clinic_products')
          .select('*')
          .eq('account_id', accountId)
          .eq('is_active', true)
          .order('stock_quantity', { ascending: true })
          .limit(80),
        supabase
          .from('finance_stock_movements')
          .select('id, product_id, movement_type, quantity, stock_after, notes, created_at, product:clinic_products(id,name,sku)')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('finance_goal_progress')
          .select('*, entries:finance_goal_entries(id,goal_id,entry_type,amount,occurred_on,notes,created_at)')
          .eq('account_id', accountId)
          .eq('status', 'active')
          .order('period_end', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

    if (integrationsRes.error && integrationsRes.error.code !== '42P01') {
      toast.error(integrationsRes.error.message);
    }
    setIntegrations((integrationsRes.data as IntegrationSetting[] | null) ?? []);
    setSales((salesRes.data as FinanceSale[] | null) ?? []);
    setInvoiceRequests((invoiceRequestsRes.data as FinanceInvoiceRequest[] | null) ?? []);
    setPaymentLinks((linksRes.data as PaymentLink[] | null) ?? []);
    setProducts((productsRes.data as ProductWithStock[] | null) ?? []);
    setStockMovements((stockMovementsRes.data as StockMovement[] | null) ?? []);
    setGoals((goalsRes.data as FinanceGoal[] | null) ?? []);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadSumUpStatus = useCallback(async () => {
    const response = await fetch('/api/finance/sumup/status');
    if (response.ok) setSumUpStatus(await response.json());
  }, []);

  useEffect(() => {
    void loadSumUpStatus();
  }, [loadSumUpStatus]);

  const providerMap = new Map(
    integrations.map((item) => [`${item.category}:${item.provider}`, item])
  );
  const unpaidSales = sales.filter((sale) => Number(sale.balance_due ?? 0) > 0);
  const salesWithoutInvoice = sales.filter(
    (sale) => sale.status !== 'voided' && !sale.invoice_request
  );
  const lowStockProducts = products.filter(
    (product) =>
      Number(product.stock_quantity ?? 0) <=
      Number(product.low_stock_threshold ?? 3)
  );
  const outOfStockProducts = products.filter(
    (product) => Number(product.stock_quantity ?? 0) <= 0
  );
  const goalsWithProgress = goals.map((goal) => {
    const ledgerAmount = Number(goal.ledger_amount ?? goal.current_amount ?? 0);
    const automaticRevenue =
      goal.goal_type === 'revenue_paid'
        ? sales
            .filter((sale) => {
              const paidAt = sale.completed_at || sale.created_at;
              const timestamp = new Date(paidAt).getTime();
              const start = new Date(goal.period_start).getTime();
              const end = goal.period_end
                ? new Date(`${goal.period_end}T23:59:59`).getTime()
                : Number.POSITIVE_INFINITY;
              return (
                sale.status === 'paid' &&
                timestamp >= start &&
                timestamp <= end
              );
            })
            .reduce((sum, sale) => sum + Number(sale.paid_amount ?? 0), 0)
        : 0;
    const current =
      goal.goal_type === 'revenue_paid'
        ? automaticRevenue + ledgerAmount
        : ledgerAmount;
    const target = Number(goal.target_amount ?? 0);
    const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    const remaining = Math.max(target - current, 0);
    const daysLeft = goal.period_end
      ? Math.ceil(
          (new Date(`${goal.period_end}T23:59:59`).getTime() - Date.now()) /
            86_400_000
        )
      : null;
    return {
      ...goal,
      current,
      target,
      percent,
      remaining,
      daysLeft,
      automaticRevenue,
      ledgerAmount,
    };
  });
  const activeGoalTotal = goalsWithProgress.reduce(
    (sum, goal) => sum + goal.target,
    0
  );
  const activeGoalDone = goalsWithProgress.reduce(
    (sum, goal) => sum + goal.current,
    0
  );

  async function configureProvider(
    category: IntegrationSetting['category'],
    provider: string,
    displayName: string
  ) {
    if (!accountId || !user?.id || !canEditSettings) return;
    setSavingProvider(`${category}:${provider}`);
    const { error } = await supabase.from('business_integration_settings').upsert(
      {
        account_id: accountId,
        category,
        provider,
        display_name: displayName,
        status: 'configured',
        config: {
          notes: notes[`${category}:${provider}`] || '',
          configured_by: user.id,
        },
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,category,provider' }
    );
    setSavingProvider(null);
    if (error) return toast.error(error.message);
    toast.success(`${displayName} ficou marcado como configurado.`);
    await loadData();
  }

  async function createGoal() {
    if (!accountId || !user?.id || !canEditSettings) return;
    const targetAmount = Number(goalDraft.targetAmount);
    const currentAmount = Number(goalDraft.currentAmount || 0);
    if (!goalDraft.title.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0) {
      return toast.error('Informe o nome da meta e um valor alvo válido.');
    }

    setBusyAction('goal:create');
    const { error } = await supabase.from('finance_goals').insert({
      account_id: accountId,
      title: goalDraft.title.trim(),
      category: goalDraft.category,
      goal_type: goalDraft.goalType,
      target_amount: targetAmount,
      current_amount:
        goalDraft.goalType === 'manual' && Number.isFinite(currentAmount)
          ? Math.max(currentAmount, 0)
          : 0,
      currency: defaultCurrency,
      period_start: new Date().toISOString().slice(0, 10),
      period_end: goalDraft.periodEnd || null,
      notes: goalDraft.notes.trim() || null,
      created_by_user_id: user.id,
    });
    setBusyAction(null);

    if (error) return toast.error(error.message);
    toast.success('Meta criada.');
    setGoalDraft({
      title: '',
      category: 'revenue',
      goalType: 'revenue_paid',
      targetAmount: '',
      currentAmount: '',
      periodEnd: '',
      notes: '',
    });
    await loadData();
  }

  async function addGoalEntry(goal: FinanceGoal, entryType: 'contribution' | 'withdrawal' = 'contribution') {
    if (!accountId || !user?.id || !canEditSettings) return;
    const draft = goalEntryDrafts[goal.id] ?? { amount: '', notes: '' };
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return toast.error('Informe um valor válido para lançar na meta.');
    }
    setBusyAction(`goal:${goal.id}`);
    const { error } = await supabase.from('finance_goal_entries').insert({
      account_id: accountId,
      goal_id: goal.id,
      entry_type: entryType,
      amount,
      notes: draft.notes.trim() || null,
      created_by_user_id: user.id,
    });
    setBusyAction(null);
    if (error) return toast.error(error.message);
    toast.success(entryType === 'withdrawal' ? 'Retirada registada.' : 'Valor lançado na meta.');
    setGoalEntryDrafts((current) => ({
      ...current,
      [goal.id]: { amount: '', notes: '' },
    }));
    await loadData();
  }

  async function completeGoal(goal: FinanceGoal) {
    if (!canEditSettings) return;
    setBusyAction(`goal:${goal.id}`);
    const { error } = await supabase
      .from('finance_goals')
      .update({ status: 'completed' })
      .eq('id', goal.id);
    setBusyAction(null);
    if (error) return toast.error(error.message);
    toast.success('Meta concluída.');
    await loadData();
  }

  async function createPaymentRequest(sale: FinanceSale): Promise<PaymentLink | null> {
    if (!accountId || !user?.id) return null;
    const amount = Number(sale.balance_due ?? 0);
    if (amount <= 0) {
      toast.error('Esta venda não tem valor pendente.');
      return null;
    }

    setBusyAction(`payment:${sale.id}`);
    const sumUpSetting = providerMap.get('payments:sumup');
    if (sumUpStatus?.configured || sumUpSetting?.status === 'active') {
      const response = await fetch('/api/finance/payment-links/sumup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: sale.id }),
      });
      const payload = await response.json().catch(() => ({}));
      setBusyAction(null);
      if (!response.ok) {
        toast.error(payload.error || 'Não foi possível criar o checkout SumUp.');
        return null;
      }
      toast.success('Link SumUp criado. Pode enviar ao cliente por WhatsApp.');
      await loadData();
      return { ...(payload.paymentLink as PaymentLink), sale };
    }
    const stripeSetting = providerMap.get('payments:stripe');
    if (
      stripeSetting &&
      ['configured', 'active'].includes(stripeSetting.status)
    ) {
      const response = await fetch('/api/finance/payment-links/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: sale.id }),
      });
      const payload = await response.json().catch(() => ({}));
      setBusyAction(null);

      if (!response.ok) {
        toast.error(
          payload.error ||
            'Não foi possível criar o checkout Stripe. Verifique as chaves.'
        );
        return null;
      }

      toast.success('Link Stripe criado. Pode enviar ao cliente por WhatsApp.');
      await loadData();
      return {
        ...(payload.paymentLink as PaymentLink),
        sale,
      };
    }

    const { data, error } = await supabase
      .from('finance_payment_links')
      .insert({
        account_id: accountId,
        sale_id: sale.id,
        contact_id: sale.contact_id ?? null,
        provider: 'manual',
        status: 'pending',
        amount,
        currency: sale.currency || defaultCurrency,
        description: `Cobrança da venda #${sale.sale_number}`,
        external_reference: `sale-${sale.id}`,
        created_by_user_id: user.id,
      })
      .select('*')
      .single();
    setBusyAction(null);

    if (error || !data) {
      toast.error(error?.message || 'Não foi possível criar a cobrança.');
      return null;
    }

    toast.success('Cobrança criada. Pode ser conciliada quando o cliente pagar.');
    await loadData();
    return {
      ...(data as PaymentLink),
      sale,
    };
  }

  async function createAndSendPaymentRequest(sale: FinanceSale) {
    const contactId = sale.contact_id;
    if (!contactId) {
      return toast.error('Esta venda não tem cliente associado.');
    }

    setBusyAction(`payment-send:${sale.id}`);
    const link = await createPaymentRequest(sale);
    if (!link) {
      setBusyAction(null);
      return;
    }

    await sendPaymentWhatsApp(link, `payment-send:${sale.id}`);
  }
  async function createInvoiceRequest(sale: FinanceSale) {
    if (!accountId || !user?.id) return;
    const contact = sale.contact;
    if (!sale.contact_id || !contact) {
      return toast.error('Esta venda não tem cliente associado.');
    }
    if (!contact.name || !contact.email || !contact.tax_id) {
      return toast.error('Complete nome, email e NIF na ficha do cliente antes de pedir fatura.');
    }

    setBusyAction(`invoice:${sale.id}`);
    const { error } = await supabase.from('finance_invoice_requests').insert({
      account_id: accountId,
      sale_id: sale.id,
      contact_id: sale.contact_id,
      requested_by_auth_user_id: user.id,
      status: 'pending',
      fiscal_name: contact.name,
      tax_id: contact.tax_id,
      email: contact.email,
      address_line: contact.address_line ?? null,
      postal_code: contact.postal_code ?? null,
      city: contact.city ?? null,
      country: contact.country ?? 'Portugal',
      client_notes: 'Pedido criado pela Central Gestão Zappy.',
    });
    setBusyAction(null);

    if (error) return toast.error(error.message);
    toast.success('Pedido de fatura criado.');
    await loadData();
  }

  async function adjustStock(product: ProductWithStock, direction: 1 | -1) {
    if (!canEditSettings) return;
    const draft = stockDrafts[product.id] ?? { quantity: '', reason: '' };
    const rawQuantity = Math.trunc(Number(draft.quantity));
    if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) {
      return toast.error('Informe uma quantidade válida.');
    }

    const quantity = rawQuantity * direction;
    setBusyAction(`stock:${product.id}`);
    const { error } = await supabase.rpc('adjust_clinic_product_stock', {
      p_product_id: product.id,
      p_quantity: quantity,
      p_movement_type: direction > 0 ? 'purchase' : 'adjustment',
      p_reason:
        draft.reason ||
        (direction > 0 ? 'Entrada de stock pela Central Gestão Zappy' : 'Ajuste de stock pela Central Gestão Zappy'),
    });
    setBusyAction(null);

    if (error) return toast.error(error.message);
    toast.success(direction > 0 ? 'Entrada de stock registada.' : 'Ajuste de stock registado.');
    setStockDrafts((current) => ({
      ...current,
      [product.id]: { quantity: '', reason: '' },
    }));
    await loadData();
  }

  async function copyPaymentMessage(link: PaymentLink) {
    await navigator.clipboard.writeText(paymentMessage(link));
    toast.success('Mensagem de cobrança copiada.');
  }

  function paymentMessage(link: PaymentLink) {
    const sale = link.sale;
    const fullName = sale?.contact?.name || sale?.contact?.phone || 'cliente';
    const client = fullName.split(/\s+/)[0] || 'cliente';
    const services = sale?.items
      ?.map((item) => item.name_snapshot)
      .filter(Boolean)
      .join(', ');
    return [
      `Olá ${client} 👋`,
      `A sua ${services ? `sessão de *${services}*` : 'sessão'} na *RP Instituto de Beleza* está pronta para pagamento.`,
      `Total a pagar: *${formatCurrency(Number(link.amount), link.currency)}*`,
      'Para pagar online de forma segura, use este link:',
      link.payment_url || '',
      'Assim que o pagamento for confirmado, a sua marcação fica validada.',
      'Se precisar de ajuda, responda a esta mensagem.',
      'Obrigado,\n*RP Instituto de Beleza*',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  async function sendPaymentWhatsApp(
    link: PaymentLink,
    busyKey = `send-payment:${link.id}`
  ) {
    const contactId = link.contact_id || link.sale?.contact_id;
    if (!contactId) {
      return toast.error('Esta cobrança não tem cliente associado.');
    }
    if (!link.payment_url) {
      return toast.error(
        'Este pedido ainda não tem um checkout online. Crie primeiro um link SumUp válido.'
      );
    }

    setBusyAction(busyKey);
    const response = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: contactId,
        message_type: 'text',
        content_text: paymentMessage(link),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusyAction(null);

    if (!response.ok) {
      return toast.error(payload.error || 'Não foi possível enviar a cobrança.');
    }
    toast.success('Cobrança enviada pelo WhatsApp.');
  }
  async function confirmPaymentLink(link: PaymentLink) {
    if (!link.sale_id) return toast.error('Esta cobrança não está associada a uma venda.');
    const method = paymentMethodDrafts[link.id] || 'mb_way';

    setBusyAction(`confirm-payment:${link.id}`);
    const { error: paymentError } = await supabase.rpc('add_finance_payment_secure', {
      p_sale_id: link.sale_id,
      p_method: method,
      p_amount: Number(link.amount),
      p_cash_session_id: null,
      p_reference_code: link.id,
      p_pin_code: null,
      p_notes: `Cobrança confirmada pela Central Gestão Zappy (${link.provider}).`,
    });

    if (paymentError) {
      setBusyAction(null);
      return toast.error(paymentError.message);
    }

    const { error: linkError } = await supabase
      .from('finance_payment_links')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', link.id);

    setBusyAction(null);
    if (linkError) return toast.error(linkError.message);
    toast.success('Cobrança confirmada e venda conciliada.');
    await loadData();
  }

  async function cancelPaymentLink(link: PaymentLink) {
    if (link.status === 'paid') return;
    if (!window.confirm('Cancelar esta cobrança? O cliente deixará de conseguir pagar através deste link.')) return;

    setBusyAction(`cancel-payment:${link.id}`);
    const response = await fetch(`/api/finance/payment-links/${encodeURIComponent(link.id)}`, {
      method: 'DELETE',
    });
    const payload = await response.json().catch(() => ({}));
    setBusyAction(null);

    if (!response.ok) {
      return toast.error(payload.error || 'Não foi possível cancelar a cobrança.');
    }
    toast.success('Cobrança cancelada. O checkout deixou de estar disponível.');
    await loadData();
  }

  // The previous all-in-one workspace is retained only for a temporary support
  // view. The normal Business Hub below is deliberately limited to real,
  // day-to-day financial actions.
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('legacy') === '1'
  ) return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary size-6" />
            <h1 className="text-foreground text-2xl font-bold">Gestão Zappy-like</h1>
          </div>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
            Central para fechar as lacunas contra a Zappy: faturação fiscal,
            pagamentos eletrónicos, stock, anúncios, email marketing e IA de agendamento.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={FileText}
          label="Vendas sem fatura"
          value={salesWithoutInvoice.length}
          detail="prontas para emissão fiscal"
        />
        <KpiCard
          icon={CreditCard}
          label="Valores a receber"
          value={formatCurrency(
            unpaidSales.reduce((sum, sale) => sum + Number(sale.balance_due ?? 0), 0),
            defaultCurrency
          )}
          detail={`${unpaidSales.length} venda(s) pendente(s)`}
        />
        <KpiCard
          icon={Boxes}
          label="Stock baixo"
          value={lowStockProducts.length}
          detail={`${outOfStockProducts.length} produto(s) esgotado(s)`}
        />
        <KpiCard
          icon={PlugZap}
          label="Integrações ativas"
          value={integrations.filter((item) => item.status === 'active').length}
          detail={`${integrations.length} fornecedor(es) configurados`}
        />
      </div>

      <Card id="financial-goals" className={focus === 'goals' ? 'ring-primary/30 ring-2' : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target /> Metas financeiras
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Alvo total" value={formatCurrency(activeGoalTotal, defaultCurrency)} />
            <MiniStat label="Realizado" value={formatCurrency(activeGoalDone, defaultCurrency)} />
            <MiniStat label="Falta" value={formatCurrency(Math.max(activeGoalTotal - activeGoalDone, 0), defaultCurrency)} />
            <MiniStat label="Metas ativas" value={String(goalsWithProgress.length)} />
          </div>

          <div className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[1.2fr_150px_150px_140px_1fr_auto]">
            <Input
              placeholder="Ex.: Aluguel, pagar carro, meta mensal..."
              value={goalDraft.title}
              disabled={!canEditSettings || busyAction === 'goal:create'}
              onChange={(event) => setGoalDraft((current) => ({ ...current, title: event.target.value }))}
            />
            <select
              value={goalDraft.category}
              disabled={!canEditSettings || busyAction === 'goal:create'}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              onChange={(event) => {
                const category = event.target.value as FinanceGoal['category'];
                setGoalDraft((current) => ({
                  ...current,
                  category,
                  goalType: category === 'revenue' ? 'revenue_paid' : 'manual',
                }));
              }}
            >
              {Object.entries(GOAL_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Valor alvo"
              value={goalDraft.targetAmount}
              disabled={!canEditSettings || busyAction === 'goal:create'}
              onChange={(event) => setGoalDraft((current) => ({ ...current, targetAmount: event.target.value }))}
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Atual"
              value={goalDraft.currentAmount}
              disabled={!canEditSettings || busyAction === 'goal:create' || goalDraft.goalType === 'revenue_paid'}
              onChange={(event) => setGoalDraft((current) => ({ ...current, currentAmount: event.target.value }))}
            />
            <Input
              type="date"
              value={goalDraft.periodEnd}
              disabled={!canEditSettings || busyAction === 'goal:create'}
              onChange={(event) => setGoalDraft((current) => ({ ...current, periodEnd: event.target.value }))}
            />
            <Button disabled={!canEditSettings || busyAction === 'goal:create'} onClick={() => void createGoal()}>
              {busyAction === 'goal:create' ? <Loader2 className="animate-spin" /> : <Target />}
              Criar meta
            </Button>
          </div>

          {goalsWithProgress.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {goalsWithProgress.map((goal) => {
                const behind = goal.percent < Number(goal.alert_threshold_percent ?? 75) && (goal.daysLeft === null || goal.daysLeft <= 7);
                return (
                  <div key={goal.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{goal.title}</p>
                        <p className="text-muted-foreground text-sm">
                          {GOAL_CATEGORIES[goal.category]} · {goal.goal_type === 'revenue_paid' ? 'automática por vendas pagas' : 'manual'}
                        </p>
                      </div>
                      <Badge variant={behind ? 'destructive' : 'secondary'}>
                        {behind ? 'Atenção' : `${Math.round(goal.percent)}%`}
                      </Badge>
                    </div>
                    <div className="bg-muted mt-4 h-3 overflow-hidden rounded-full">
                      <div className={behind ? 'h-full bg-red-500' : 'bg-primary h-full'} style={{ width: `${Math.min(goal.percent, 100)}%` }} />
                    </div>
                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                      <MiniStat label="Realizado" value={formatCurrency(goal.current, goal.currency)} />
                      <MiniStat label="Falta" value={formatCurrency(goal.remaining, goal.currency)} />
                      <MiniStat label="Prazo" value={goal.period_end ? `${Math.max(goal.daysLeft ?? 0, 0)} dia(s)` : 'Sem prazo'} />
                    </div>
                    {goal.goal_type === 'revenue_paid' ? (
                      <p className="text-muted-foreground mt-3 text-xs">
                        Vendas pagas no período: {formatCurrency(goal.automaticRevenue, goal.currency)} · lançamentos manuais: {formatCurrency(goal.ledgerAmount, goal.currency)}
                      </p>
                    ) : null}
                    <div className="mt-3 grid gap-2 md:grid-cols-[140px_1fr_auto_auto_auto]">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Valor"
                        value={goalEntryDrafts[goal.id]?.amount ?? ''}
                        disabled={!canEditSettings || busyAction === `goal:${goal.id}`}
                        onChange={(event) =>
                          setGoalEntryDrafts((current) => ({
                            ...current,
                            [goal.id]: {
                              amount: event.target.value,
                              notes: current[goal.id]?.notes ?? '',
                            },
                          }))
                        }
                      />
                      <Input
                        placeholder="Nota: pago, reservado, entrada..."
                        value={goalEntryDrafts[goal.id]?.notes ?? ''}
                        disabled={!canEditSettings || busyAction === `goal:${goal.id}`}
                        onChange={(event) =>
                          setGoalEntryDrafts((current) => ({
                            ...current,
                            [goal.id]: {
                              amount: current[goal.id]?.amount ?? '',
                              notes: event.target.value,
                            },
                          }))
                        }
                      />
                      <Button variant="outline" disabled={!canEditSettings || busyAction === `goal:${goal.id}`} onClick={() => void addGoalEntry(goal, 'contribution')}>
                        <Target /> Somar
                      </Button>
                      <Button variant="outline" disabled={!canEditSettings || busyAction === `goal:${goal.id}`} onClick={() => void addGoalEntry(goal, 'withdrawal')}>
                        Retirar
                      </Button>
                      <Button variant="outline" disabled={!canEditSettings || busyAction === `goal:${goal.id}`} onClick={() => void completeGoal(goal)}>
                        <CheckCircle2 /> Concluir
                      </Button>
                    </div>
                    {(goal.entries ?? []).length ? (
                      <div className="mt-3 rounded-lg border p-2">
                        <p className="text-muted-foreground mb-1 text-xs font-medium">
                          Últimos lançamentos
                        </p>
                        {(goal.entries ?? []).slice(0, 3).map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between gap-3 py-1 text-xs">
                            <span className="truncate">
                              {entry.notes || (entry.entry_type === 'withdrawal' ? 'Retirada' : 'Entrada')} · {new Date(entry.occurred_on).toLocaleDateString('pt-PT')}
                            </span>
                            <strong className={entry.entry_type === 'withdrawal' ? 'text-red-500' : 'text-emerald-600'}>
                              {entry.entry_type === 'withdrawal' ? '-' : '+'}{formatCurrency(Number(entry.amount), goal.currency)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={BarChart3} text="Ainda não existem metas. Crie uma pauta como aluguel, carro ou receita mensal." />
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 /> Fornecedores e integrações
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {PROVIDERS.map((provider) => {
              const key = `${provider.category}:${provider.provider}`;
              const configured = providerMap.get(key);
              const isSumUp = provider.provider === 'sumup';
              const sumUpReady =
                isSumUp &&
                Boolean(sumUpStatus?.configured && sumUpStatus?.verified);
              return (
                <div key={key} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{provider.displayName}</p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {provider.detail}
                      </p>
                    </div>
                    <Badge className={statusClass(sumUpReady ? 'active' : configured?.status ?? 'not_configured')}>
                      {sumUpReady ? 'Pronto para checkout' : STATUS_LABEL[configured?.status ?? 'not_configured']}
                    </Badge>
                  </div>
                  {isSumUp ? (
                    <div className={`mt-3 rounded-lg border p-3 text-sm ${sumUpReady ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                      <p className="font-medium">{sumUpReady ? 'Checkout online ativo' : 'Configuração necessária no cPanel'}</p>
                      <p className="text-muted-foreground mt-1 text-xs">{sumUpReady ? `Comerciante ${sumUpStatus?.merchantCode ?? ''} · modo ${sumUpStatus?.mode === 'test' ? 'teste' : 'real'}.` : 'Defina SUMUP_API_KEY e SUMUP_MERCHANT_CODE nas variáveis da aplicação. As chaves nunca são guardadas aqui.'}</p>
                      {sumUpStatus?.configured && sumUpStatus.verified === false ? <p className="mt-1 text-xs text-amber-700">A SumUp não validou esta chave/código: {sumUpStatus.error || 'verifique as credenciais.'}</p> : null}
                      <p className="text-muted-foreground mt-2 text-xs">No POS, o iPhone continua a ser usado na app SumUp/Tap to Pay; depois confirme o pagamento no CRM.</p>
                    </div>
                  ) : <Textarea
                    value={notes[key] ?? String(configured?.config?.notes ?? '')}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [key]: event.target.value }))
                    }
                    placeholder="Notas, credenciais recebidas ou próximos passos internos"
                    rows={3}
                    className="mt-3"
                    disabled={!canEditSettings}
                  />}
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    disabled={!canEditSettings || savingProvider === key}
                    onClick={() => isSumUp ? void loadSumUpStatus() : configureProvider(provider.category, provider.provider, provider.displayName)}
                  >
                    {savingProvider === key ? (
                      <Loader2 className="animate-spin" />
                    ) : configured ? (
                      <BadgeCheck />
                    ) : (
                      <PlugZap />
                    )}
                    {isSumUp ? 'Verificar configuração SumUp' : configured ? 'Atualizar configuração' : 'Marcar como configurado'}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle /> Próximas ações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ActionRow
              done={Boolean(providerMap.get('fiscal:vendus') || providerMap.get('fiscal:manual_fiscal'))}
              title="Escolher fornecedor fiscal"
              detail="Vendus/Cegid, Moloni, InvoiceXpress ou fluxo manual."
            />
            <ActionRow
              done={Boolean(sumUpStatus?.configured || providerMap.get('payments:easypay') || providerMap.get('payments:stripe'))}
              title="Escolher pagamentos online"
              detail="MB Way/Multibanco/cartão para links de pagamento."
            />
            <ActionRow
              done={lowStockProducts.length === 0}
              title="Resolver stock crítico"
              detail={`${lowStockProducts.length} produto(s) abaixo do mínimo.`}
            />
            <ActionRow
              done={salesWithoutInvoice.length === 0}
              title="Emitir documentos fiscais"
              detail={`${salesWithoutInvoice.length} venda(s) ainda sem pedido/documento.`}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText /> Faturação fiscal
            </CardTitle>
          </CardHeader>
          <CardContent>
            {salesWithoutInvoice.length ? (
              <div className="mb-4 divide-y rounded-xl border">
                {salesWithoutInvoice.slice(0, 5).map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">Venda #{sale.sale_number}</p>
                      <p className="text-muted-foreground truncate text-sm">
                        {sale.contact?.name || sale.contact?.phone || 'Cliente'} · emitir documento
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyAction === `invoice:${sale.id}`}
                      onClick={() => createInvoiceRequest(sale)}
                    >
                      {busyAction === `invoice:${sale.id}` ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <FileText />
                      )}
                      Pedir fatura
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <DataList
              empty="Nenhuma venda recente sem fatura."
              rows={salesWithoutInvoice.slice(0, 8).map((sale) => ({
                id: sale.id,
                title: `Venda #${sale.sale_number}`,
                detail: `${sale.contact?.name || sale.contact?.phone || 'Cliente'} · ${new Date(sale.created_at).toLocaleDateString('pt-PT')}`,
                amount: formatCurrency(Number(sale.total_amount), sale.currency),
              }))}
            />
            <div className="mt-4 rounded-lg border border-dashed p-3 text-sm">
              <p className="font-medium">Pedidos de fatura no portal</p>
              <p className="text-muted-foreground mt-1">
                {invoiceRequests.filter((item) => item.status === 'pending').length}{' '}
                pedido(s) pendente(s) para tratar.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard /> Pagamentos eletrónicos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unpaidSales.length ? (
              <div className="mb-4 divide-y rounded-xl border">
                {unpaidSales.slice(0, 5).map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">Venda #{sale.sale_number}</p>
                      <p className="text-muted-foreground truncate text-sm">
                        {sale.contact?.name || sale.contact?.phone || 'Cliente'} ·{' '}
                        {formatCurrency(Number(sale.balance_due), sale.currency)} por receber
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyAction === `payment:${sale.id}`}
                        onClick={() => void createPaymentRequest(sale)}
                      >
                        {busyAction === `payment:${sale.id}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Link2 />
                        )}
                        Criar link
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyAction === `payment-send:${sale.id}`}
                        onClick={() => void createAndSendPaymentRequest(sale)}
                      >
                        {busyAction === `payment-send:${sale.id}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <MessageSquare />
                        )}
                        Criar e enviar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {paymentLinks.length ? (
              <div className="divide-y rounded-xl border">
                {paymentLinks.slice(0, 8).map((link) => (
                  <div key={link.id} className="space-y-3 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {link.description || `Cobrança ${link.provider}`}
                        </p>
                        <p className="text-muted-foreground truncate text-sm">
                          {link.status} · {new Date(link.created_at).toLocaleDateString('pt-PT')}
                        </p>
                      </div>
                      <strong className="shrink-0">
                        {formatCurrency(Number(link.amount), link.currency)}
                      </strong>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
                      <select
                        value={paymentMethodDrafts[link.id] || 'mb_way'}
                        onChange={(event) =>
                          setPaymentMethodDrafts((current) => ({
                            ...current,
                            [link.id]: event.target.value,
                          }))
                        }
                        disabled={link.status === 'paid' || busyAction === `confirm-payment:${link.id}`}
                        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                      >
                        <option value="mb_way">MB Way</option>
                        <option value="bank_transfer">Transferência</option>
                        <option value="card">Cartão</option>
                        <option value="multibanco">Multibanco</option>
                        <option value="other">Outro</option>
                      </select>
                      <Button variant="outline" size="sm" onClick={() => copyPaymentMessage(link)}>
                        <Link2 />
                        Copiar
                      </Button>
                      {link.payment_url ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(link.payment_url || '', '_blank')}
                        >
                          <CreditCard />
                          Abrir link
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          !link.payment_url ||
                          busyAction === `send-payment:${link.id}`
                        }
                        title={
                          !link.payment_url
                            ? 'Crie primeiro um checkout online para poder enviar a cobrança.'
                            : undefined
                        }
                        onClick={() => sendPaymentWhatsApp(link)}
                      >
                        {busyAction === `send-payment:${link.id}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <MessageSquare />
                        )}
                        {link.payment_url ? 'Enviar WhatsApp' : 'Sem checkout'}
                      </Button>
                      <Button
                        size="sm"
                        disabled={link.status === 'paid' || busyAction === `confirm-payment:${link.id}`}
                        onClick={() => confirmPaymentLink(link)}
                      >
                        {busyAction === `confirm-payment:${link.id}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <CheckCircle2 />
                        )}
                        Confirmar pago
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={CreditCard} text="Ainda não existem cobranças criadas." />
            )}            <div className="mt-4 rounded-lg border border-dashed p-3 text-sm">
              <p className="font-medium">Preparado para integração</p>
              <p className="text-muted-foreground mt-1">
                A tabela de links já está pronta para Easypay, Stripe ou outro fornecedor.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes /> Gestão de stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lowStockProducts.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lowStockProducts.slice(0, 12).map((product) => (
                <div key={product.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {product.sku || 'Sem SKU'} · mínimo {product.low_stock_threshold ?? 3}
                      </p>
                    </div>
                    <Badge
                      variant={Number(product.stock_quantity) <= 0 ? 'destructive' : 'outline'}
                    >
                      {Number(product.stock_quantity) <= 0 ? 'Esgotado' : 'Baixo'}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <MiniStat label="Stock" value={String(product.stock_quantity)} />
                    <MiniStat
                      label="Preço"
                      value={formatCurrency(Number(product.price), product.currency)}
                    />
                    <MiniStat
                      label="Custo"
                      value={formatCurrency(Number(product.cost_price ?? 0), product.currency)}
                    />
                    <MiniStat label="Fornecedor" value={product.supplier_name || '—'} />
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="grid grid-cols-[110px_1fr] gap-2">
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qtd."
                        value={stockDrafts[product.id]?.quantity ?? ''}
                        disabled={!canEditSettings || busyAction === `stock:${product.id}`}
                        onChange={(event) =>
                          setStockDrafts((current) => ({
                            ...current,
                            [product.id]: {
                              quantity: event.target.value,
                              reason: current[product.id]?.reason ?? '',
                            },
                          }))
                        }
                      />
                      <Input
                        placeholder="Motivo / fornecedor"
                        value={stockDrafts[product.id]?.reason ?? ''}
                        disabled={!canEditSettings || busyAction === `stock:${product.id}`}
                        onChange={(event) =>
                          setStockDrafts((current) => ({
                            ...current,
                            [product.id]: {
                              quantity: current[product.id]?.quantity ?? '',
                              reason: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canEditSettings || busyAction === `stock:${product.id}`}
                        onClick={() => adjustStock(product, 1)}
                      >
                        {busyAction === `stock:${product.id}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Boxes />
                        )}
                        Entrada
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canEditSettings || busyAction === `stock:${product.id}`}
                        onClick={() => adjustStock(product, -1)}
                      >
                        Ajustar saída
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed text-center">
              <CheckCircle2 className="text-emerald-500 mb-2 size-7" />
              <p className="font-medium">Stock saudável</p>
              <p className="text-muted-foreground text-sm">
                Nenhum produto ativo está abaixo do limite mínimo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes /> Movimentos recentes de stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stockMovements.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="py-2 font-medium">Produto</th>
                    <th className="py-2 font-medium">Tipo</th>
                    <th className="py-2 text-right font-medium">Qtd.</th>
                    <th className="py-2 text-right font-medium">Stock após</th>
                    <th className="py-2 font-medium">Notas</th>
                    <th className="py-2 text-right font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stockMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="py-2">
                        <p className="font-medium">
                          {movement.product?.name || 'Produto'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {movement.product?.sku || 'Sem SKU'}
                        </p>
                      </td>
                      <td className="py-2">{stockMovementLabel(movement.movement_type)}</td>
                      <td
                        className={
                          Number(movement.quantity) >= 0
                            ? 'py-2 text-right font-medium text-emerald-600'
                            : 'py-2 text-right font-medium text-red-600'
                        }
                      >
                        {Number(movement.quantity) >= 0 ? '+' : ''}
                        {movement.quantity}
                      </td>
                      <td className="py-2 text-right">{movement.stock_after}</td>
                      <td className="text-muted-foreground max-w-[220px] truncate py-2">
                        {movement.notes || '—'}
                      </td>
                      <td className="text-muted-foreground py-2 text-right">
                        {new Date(movement.created_at).toLocaleString('pt-PT')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Boxes} text="Ainda não existem movimentos de stock." />
          )}
        </CardContent>
      </Card>
    </div>
  );

  const amountToReceive = unpaidSales.reduce(
    (sum, sale) => sum + Number(sale.balance_due ?? 0),
    0
  );
  const openPaymentLinks = paymentLinks.filter(
    (link) => !['paid', 'cancelled', 'expired', 'failed'].includes(link.status)
  );
  const paidPaymentLinks = paymentLinks.filter((link) => link.status === 'paid');

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-6 py-7 text-white shadow-sm md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-emerald-300">CENTRO FINANCEIRO</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Receber, acompanhar e fechar vendas.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Só o que precisa para trabalhar hoje: pagamentos, faturas, caixa, vouchers e packs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => window.location.assign('/finance?tab=pos')}>
              <CreditCard /> Abrir POS
            </Button>
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={loadData} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Atualizar
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={CreditCard} label="Por receber" value={formatCurrency(amountToReceive, defaultCurrency)} detail={`${unpaidSales.length} venda(s) pendente(s)`} />
        <KpiCard icon={Link2} label="Cobranças abertas" value={openPaymentLinks.length} detail="links aguardando pagamento" />
        <KpiCard icon={FileText} label="Faturas a tratar" value={salesWithoutInvoice.length} detail={`${invoiceRequests.filter((item) => item.status === 'pending').length} pedido(s) no portal`} />
        <KpiCard icon={CheckCircle2} label="Pagamentos confirmados" value={paidPaymentLinks.length} detail="links conciliados recentemente" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Card className="border-primary/15">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2"><Banknote /> Receber pagamentos</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">Crie o checkout SumUp e envie-o diretamente ao cliente.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.assign('/finance?tab=sales')}>Ver vendas</Button>
          </CardHeader>
          <CardContent>
            {unpaidSales.length ? (
              <div className="divide-y rounded-xl border">
                {unpaidSales.slice(0, 6).map((sale) => (
                  <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-semibold">Venda #{sale.sale_number}</p>
                      <p className="text-muted-foreground truncate text-sm">{sale.contact?.name || sale.contact?.phone || 'Consumidor final'} · {formatCurrency(Number(sale.balance_due), sale.currency)} em falta</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" disabled={busyAction === `payment:${sale.id}`} onClick={() => void createPaymentRequest(sale)}>
                        {busyAction === `payment:${sale.id}` ? <Loader2 className="animate-spin" /> : <Link2 />}
                        Criar link
                      </Button>
                      <Button size="sm" disabled={busyAction === `payment-send:${sale.id}`} onClick={() => void createAndSendPaymentRequest(sale)}>
                        {busyAction === `payment-send:${sale.id}` ? <Loader2 className="animate-spin" /> : <MessageSquare />}
                        Criar e enviar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon={CheckCircle2} text="Não há vendas pendentes de pagamento." />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BadgeCheck /> SumUp online</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`rounded-xl border p-4 ${sumUpStatus?.configured && sumUpStatus?.verified ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{sumUpStatus?.configured && sumUpStatus?.verified ? 'Checkout pronto' : 'Checkout requer atenção'}</p>
                <Badge variant={sumUpStatus?.configured && sumUpStatus?.verified ? 'secondary' : 'outline'}>{sumUpStatus?.configured && sumUpStatus?.verified ? 'Ativo' : 'Verificar'}</Badge>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">
                {sumUpStatus?.configured && sumUpStatus?.verified
                  ? 'Os links novos abrem o checkout seguro da SumUp para o cliente pagar online.'
                  : (sumUpStatus?.error || 'Verifique a chave API e o código de comerciante nas variáveis do servidor.')}
              </p>
              <Button className="mt-4 w-full" variant="outline" onClick={() => void loadSumUpStatus()} disabled={loading}>
                <RefreshCw /> Verificar ligação SumUp
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">Para pagamentos presenciais, use o iPhone na app SumUp/Tap to Pay e confirme a venda no POS.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle className="flex items-center gap-2"><Link2 /> Links de pagamento</CardTitle><p className="text-muted-foreground mt-1 text-sm">Acompanhe e envie as cobranças já criadas.</p></div>
            <Button variant="outline" size="sm" onClick={() => window.location.assign('/finance?tab=sales')}>Gerir pagamentos</Button>
          </CardHeader>
          <CardContent>
            {openPaymentLinks.length ? <div className="divide-y rounded-xl border">
              {openPaymentLinks.slice(0, 6).map((link) => (
                <div key={link.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0"><p className="truncate font-semibold">{link.description || 'Cobrança online'}</p><p className="text-muted-foreground text-sm">{link.status === 'paid' ? 'Pago' : 'A aguardar pagamento'} · {formatCurrency(Number(link.amount), link.currency)}</p></div>
                  <div className="flex flex-wrap gap-2">
                    {link.payment_url ? <Button variant="outline" size="sm" onClick={() => window.open(link.payment_url!, '_blank')}><CreditCard /> Abrir</Button> : null}
                    <Button size="sm" disabled={!link.payment_url || busyAction === `send-payment:${link.id}`} onClick={() => sendPaymentWhatsApp(link)}>{busyAction === `send-payment:${link.id}` ? <Loader2 className="animate-spin" /> : <MessageSquare />}{link.payment_url ? 'Enviar' : 'Sem checkout'}</Button>
                    <Button variant="outline" size="sm" disabled={busyAction === `cancel-payment:${link.id}`} onClick={() => void cancelPaymentLink(link)}>
                      {busyAction === `cancel-payment:${link.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      Cancelar
                    </Button>
                  </div>
                </div>
              ))}
            </div> : <EmptyState icon={Link2} text="Não há links de pagamento abertos." />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle className="flex items-center gap-2"><FileText /> Faturas</CardTitle><p className="text-muted-foreground mt-1 text-sm">Vendas que precisam de documento fiscal.</p></div>
            <Button variant="outline" size="sm" onClick={() => window.location.assign('/finance?tab=invoices')}>Abrir faturas</Button>
          </CardHeader>
          <CardContent>
            {salesWithoutInvoice.length ? <div className="divide-y rounded-xl border">
              {salesWithoutInvoice.slice(0, 6).map((sale) => <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">Venda #{sale.sale_number}</p><p className="text-muted-foreground text-sm">{sale.contact?.name || sale.contact?.phone || 'Cliente'} · {formatCurrency(Number(sale.total_amount), sale.currency)}</p></div><Button variant="outline" size="sm" disabled={busyAction === `invoice:${sale.id}`} onClick={() => void createInvoiceRequest(sale)}>{busyAction === `invoice:${sale.id}` ? <Loader2 className="animate-spin" /> : <FileText />}Pedir fatura</Button></div>)}
            </div> : <EmptyState icon={FileText} text="Não há faturas pendentes de tratar." />}
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Banknote, title: 'Caixa', detail: 'Entradas, saídas e fecho diário', href: '/finance?tab=cash' },
          { icon: FileText, title: 'Vouchers', detail: 'Emitir e consultar vales', href: '/finance?tab=vouchers' },
          { icon: Boxes, title: 'Packs', detail: 'Sessões e saldos de clientes', href: '/finance?tab=packs' },
          { icon: Target, title: 'Metas', detail: 'Objetivos financeiros', href: '/business-hub/goals' },
        ].map(({ icon: Icon, title, detail, href }) => <button key={href} type="button" onClick={() => window.location.assign(href)} className="group rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-sm"><Icon className="text-primary size-5" /><p className="mt-3 font-semibold">{title}</p><p className="text-muted-foreground mt-1 text-sm">{detail}</p></button>)}
      </section>
    </div>
  );
}

function stockMovementLabel(type: StockMovement['movement_type']) {
  return {
    sale: 'Venda',
    return: 'Devolução',
    adjustment: 'Ajuste',
    purchase: 'Entrada',
  }[type];
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="bg-primary/10 text-primary rounded-xl p-3">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-muted-foreground text-xs">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionRow({
  done,
  title,
  detail,
}: {
  done: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <span
        className={
          done
            ? 'text-emerald-500'
            : 'text-amber-500'
        }
      >
        {done ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{detail}</p>
      </div>
    </div>
  );
}

function DataList({
  rows,
  empty,
}: {
  rows: Array<{ id: string; title: string; detail: string; amount: string }>;
  empty: string;
}) {
  if (!rows.length) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed text-center">
        <Banknote className="text-muted-foreground mb-2 size-7" />
        <p className="text-muted-foreground text-sm">{empty}</p>
      </div>
    );
  }
  return (
    <div className="divide-y">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{row.title}</p>
            <p className="text-muted-foreground truncate text-sm">{row.detail}</p>
          </div>
          <strong className="shrink-0">{row.amount}</strong>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: typeof Sparkles;
  text: string;
}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed text-center">
      <Icon className="text-muted-foreground mb-2 size-7" />
      <p className="text-muted-foreground text-sm">{text}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-2">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="truncate font-semibold">{value}</p>
    </div>
  );
}
