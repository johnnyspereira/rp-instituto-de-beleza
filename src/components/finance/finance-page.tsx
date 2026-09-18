'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeEuro,
  Banknote,
  Box,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck2,
  FileClock,
  Gift,
  History,
  Landmark,
  LayoutDashboard,
  Link2,
  Loader2,
  Minus,
  PackageCheck,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ArrowRightLeft,
  Search,
  ShoppingCart,
  Trash2,
  WalletCards,
  X,
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
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { formatCurrency } from '@/lib/currency';
import { CashView } from '@/components/finance/finance-cash-view';
import { InvoiceRequestsView } from '@/components/finance/finance-invoice-requests-view';
import { PacksView } from '@/components/finance/finance-packs-view';
import { SalesView } from '@/components/finance/finance-sales-view';
import { VouchersView } from '@/components/finance/finance-vouchers-view';
import type {
  CartItem,
  CatalogItem,
  OpeningPosition,
  PaymentDraft,
} from '@/components/finance/finance-types';
import {
  datetimeLocalValue,
  invoiceRequestStatus,
  isMissingFinanceSchema,
  money,
  paymentMethodLabel,
  PAYMENT_METHODS,
  randomId,
  randomPin,
  REGISTER_METHODS,
  SALE_STATUS,
} from '@/components/finance/finance-utils';
import {
  Empty,
  Field,
  FinanceMetric,
  NativeSelect,
  Summary,
} from '@/components/finance/finance-ui';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  ClinicProduct,
  ClinicService,
  Contact,
  FinanceCashSession,
  FinanceBenefitLog,
  FinanceCashMovement,
  FinanceCashSnapshot,
  FinanceFundAccount,
  FinanceClientPack,
  FinanceItemType,
  FinanceInvoiceRequest,
  FinancePackCatalog,
  FinancePaymentMethod,
  FinanceSale,
  FinanceVoucherTransferRequest,
  FinanceVoucher,
} from '@/types';

export function FinancePage({
  initialContactId = '',
  initialAppointmentId = '',
  initialTab = '',
}: {
  initialContactId?: string;
  initialAppointmentId?: string;
  initialTab?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  function navigateFinance(tab: string) {
    if (tab === 'treasury') {
      window.location.assign('/private-management');
      return;
    }
    setActiveTab(tab);
  }
  const {
    accountId,
    user,
    account,
    defaultCurrency,
    profileLoading,
    canEditSettings,
    isOwner,
  } = useAuth();
  const canOperate = useCan('send-messages');

  const [activeTab, setActiveTab] = useState(
    [
      'overview',
      'sales',
      'cash',
      'packs',
      'vouchers',
      'invoices',
      'pos',
    ].includes(initialTab)
      ? initialTab
      : initialAppointmentId
        ? 'pos'
        : 'overview'
  );
  const [catalogMode, setCatalogMode] = useState<
    'services' | 'products' | 'packs'
  >('services');
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [services, setServices] = useState<ClinicService[]>([]);
  const [products, setProducts] = useState<ClinicProduct[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [packs, setPacks] = useState<FinancePackCatalog[]>([]);
  const [sales, setSales] = useState<FinanceSale[]>([]);
  const [invoiceRequests, setInvoiceRequests] = useState<
    FinanceInvoiceRequest[]
  >([]);
  const [cashSession, setCashSession] = useState<FinanceCashSession | null>(
    null
  );
  const [cashSessions, setCashSessions] = useState<FinanceCashSession[]>([]);
  const [cashMovements, setCashMovements] = useState<FinanceCashMovement[]>([]);
  const [fundAccounts, setFundAccounts] = useState<FinanceFundAccount[]>([]);
  const [cashSnapshot, setCashSnapshot] = useState<FinanceCashSnapshot | null>(
    null
  );
  const [vouchers, setVouchers] = useState<FinanceVoucher[]>([]);
  const [voucherTransferRequests, setVoucherTransferRequests] = useState<
    FinanceVoucherTransferRequest[]
  >([]);
  const [clientPacks, setClientPacks] = useState<FinanceClientPack[]>([]);
  const [benefitLogs, setBenefitLogs] = useState<FinanceBenefitLog[]>([]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [contactId, setContactId] = useState(initialContactId);
  const [clientWalletBalance, setClientWalletBalance] = useState(0);
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [saleNotes, setSaleNotes] = useState('');
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [alreadyPaidElsewhere, setAlreadyPaidElsewhere] = useState(false);
  const [checkoutAppointmentLabel, setCheckoutAppointmentLabel] = useState('');
  const checkoutLoadedRef = useRef(false);

  const [cashOpen, setCashOpen] = useState(false);
  const [cashCloseOpen, setCashCloseOpen] = useState(false);
  const [openingPositions, setOpeningPositions] = useState<OpeningPosition[]>(
    []
  );
  const [fundTransferOpen, setFundTransferOpen] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferDescription, setTransferDescription] = useState('');
  const [closingAmount, setClosingAmount] = useState(0);
  const [closingBreakdown, setClosingBreakdown] = useState<
    Partial<Record<FinancePaymentMethod, number>>
  >({});
  const [cashNotes, setCashNotes] = useState('');
  const [cashMovementOpen, setCashMovementOpen] = useState(false);
  const [cashMovementType, setCashMovementType] = useState<
    'deposit' | 'withdrawal' | 'expense' | 'adjustment' | 'tip'
  >('expense');
  const [cashMovementMethod, setCashMovementMethod] =
    useState<FinancePaymentMethod>('cash');
  const [cashMovementCategory, setCashMovementCategory] = useState('');
  const [cashMovementAmount, setCashMovementAmount] = useState(0);
  const [cashMovementDescription, setCashMovementDescription] = useState('');
  const [cashMovementReference, setCashMovementReference] = useState('');
  const [cashMovementDate, setCashMovementDate] = useState(() =>
    datetimeLocalValue()
  );
  const [editingCashMovement, setEditingCashMovement] =
    useState<FinanceCashMovement | null>(null);
  const [deletingCashMovement, setDeletingCashMovement] =
    useState<FinanceCashMovement | null>(null);

  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState(0);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherValue, setVoucherValue] = useState(50);
  const [voucherType, setVoucherType] = useState<'gift_card' | 'service'>(
    'gift_card'
  );
  const [voucherServiceId, setVoucherServiceId] = useState('');
  const [voucherPin, setVoucherPin] = useState(() => randomPin());
  const [voucherRecipient, setVoucherRecipient] = useState('');
  const [voucherMessage, setVoucherMessage] = useState('');
  const [voucherValidity, setVoucherValidity] = useState(365);

  const [paymentSale, setPaymentSale] = useState<FinanceSale | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [laterPaymentMethod, setLaterPaymentMethod] =
    useState<FinancePaymentMethod>('card');
  const [laterPaymentAmount, setLaterPaymentAmount] = useState(0);
  const [laterReference, setLaterReference] = useState('');
  const [laterPin, setLaterPin] = useState('');
  const [reverseSale, setReverseSale] = useState<FinanceSale | null>(null);
  const [reverseMode, setReverseMode] = useState<'void' | 'refund'>('void');
  const [reverseReason, setReverseReason] = useState('');

  const loadFinance = useCallback(async () => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setSchemaMissing(false);
    try {
      const [
        servicesRes,
        productsRes,
        contactsRes,
        packsRes,
        salesRes,
        cashRes,
        sessionsRes,
        vouchersRes,
        clientPacksRes,
        logsRes,
        movementsRes,
        invoiceRequestsRes,
        voucherTransferRequestsRes,
      ] = await Promise.all([
        supabase
          .from('clinic_services')
          .select('*')
          .eq('account_id', accountId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('clinic_products')
          .select('*')
          .eq('account_id', accountId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('contacts')
          .select('*')
          .eq('account_id', accountId)
          .order('name')
          .limit(1000),
        supabase
          .from('finance_pack_catalog')
          .select('*, items:finance_pack_items(*, service:clinic_services(*))')
          .eq('account_id', accountId)
          .order('is_active', { ascending: false })
          .order('name'),
        supabase
          .from('finance_sales')
          .select(
            '*, contact:contacts(*), items:finance_sale_items(*), payments:finance_payments(*)'
          )
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('finance_cash_sessions')
          .select('*')
          .eq('account_id', accountId)
          .eq('status', 'open')
          .maybeSingle(),
        supabase
          .from('finance_cash_sessions')
          .select('*')
          .eq('account_id', accountId)
          .order('opened_at', { ascending: false })
          .limit(30),
        supabase
          .from('finance_vouchers')
          .select('*, owner:contacts(*), service:clinic_services(*)')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
        supabase
          .from('finance_client_packs')
          .select(
            '*, contact:contacts(*), pack:finance_pack_catalog(*), balances:finance_client_pack_balances(*, service:clinic_services(*))'
          )
          .eq('account_id', accountId)
          .order('purchased_at', { ascending: false }),
        supabase
          .from('finance_benefit_logs')
          .select(
            '*, appointment:clinic_appointments(id, scheduled_start, service:clinic_services(name), contact:contacts(name, phone))'
          )
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('finance_cash_movements')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('finance_invoice_requests')
          .select('*, sale:finance_sales(*), contact:contacts(*)')
          .eq('account_id', accountId)
          .order('requested_at', { ascending: false })
          .limit(300),
        supabase
          .from('finance_voucher_transfer_requests')
          .select(
            '*, voucher:finance_vouchers(*, owner:contacts(*), service:clinic_services(*))'
          )
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(300),
      ]);

      const firstError =
        packsRes.error ??
        salesRes.error ??
        cashRes.error ??
        sessionsRes.error ??
        vouchersRes.error ??
        clientPacksRes.error ??
        logsRes.error ??
        movementsRes.error ??
        invoiceRequestsRes.error ??
        voucherTransferRequestsRes.error;
      if (firstError) {
        if (isMissingFinanceSchema(firstError)) setSchemaMissing(true);
        else toast.error(`Falha ao carregar financeiro: ${firstError.message}`);
        setLoading(false);
        return;
      }
      setServices((servicesRes.data ?? []) as ClinicService[]);
      setProducts((productsRes.data ?? []) as ClinicProduct[]);
      setContacts((contactsRes.data ?? []) as Contact[]);
      setPacks((packsRes.data ?? []) as FinancePackCatalog[]);
      setSales((salesRes.data ?? []) as FinanceSale[]);
      setCashSession((cashRes.data as FinanceCashSession | null) ?? null);
      setCashSessions((sessionsRes.data ?? []) as FinanceCashSession[]);
      setVouchers((vouchersRes.data ?? []) as FinanceVoucher[]);
      setClientPacks((clientPacksRes.data ?? []) as FinanceClientPack[]);
      setBenefitLogs((logsRes.data ?? []) as FinanceBenefitLog[]);
      setCashMovements((movementsRes.data ?? []) as FinanceCashMovement[]);
      setInvoiceRequests(
        (invoiceRequestsRes.data ?? []) as FinanceInvoiceRequest[]
      );
      setVoucherTransferRequests(
        (voucherTransferRequestsRes.data ??
          []) as FinanceVoucherTransferRequest[]
      );
      const { data: accountPositions, error: accountPositionsError } =
        await supabase.rpc('get_finance_fund_accounts');
      if (!accountPositionsError) {
        setFundAccounts(
          (accountPositions ?? []).map((item: FinanceFundAccount) => ({
            ...item,
            balance: Number(item.balance),
          }))
        );
      } else {
        setFundAccounts([]);
      }
      if (cashRes.data?.id) {
        const { data: snapshot, error: snapshotError } = await supabase.rpc(
          'get_finance_register_snapshot',
          { p_cash_session_id: cashRes.data.id }
        );
        if (snapshotError) {
          if (isMissingFinanceSchema(snapshotError)) setSchemaMissing(true);
          else toast.error(`Falha ao conferir caixa: ${snapshotError.message}`);
          setCashSnapshot(null);
        } else {
          setCashSnapshot(snapshot as FinanceCashSnapshot);
        }
      } else {
        setCashSnapshot(null);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro inesperado ao carregar o financeiro.';
      toast.error(`Falha ao carregar financeiro: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    if (profileLoading) return;
    // Loading is intentionally tied to the authenticated workspace becoming ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFinance();
  }, [loadFinance, profileLoading]);

  useEffect(() => {
    if (!accountId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadFinance(), 350);
    };
    const channel = supabase
      .channel(`finance-live-${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_sales',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_payments',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_cash_sessions',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_cash_movements',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_invoice_requests',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_fund_transactions',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [accountId, loadFinance, supabase]);

  useEffect(() => {
    if (!accountId || !contactId) {
      // Reset the amount when the POS switches back to an anonymous sale.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClientWalletBalance(0);
      return;
    }
    let cancelled = false;
    void supabase
      .from('finance_client_wallets')
      .select('balance, currency')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .then(({ data }) => {
        if (cancelled) return;
        setClientWalletBalance(
          (data ?? [])
            .filter((wallet) => wallet.currency === defaultCurrency)
            .reduce((sum, wallet) => sum + Number(wallet.balance), 0)
        );
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, contactId, defaultCurrency, supabase]);

  useEffect(() => {
    if (!accountId || !initialAppointmentId || checkoutLoadedRef.current)
      return;
    checkoutLoadedRef.current = true;
    void supabase
      .from('clinic_appointments')
      .select(
        'id, contact_id, price, original_price, referral_id, referral_discount_amount, manual_discount_amount, currency, scheduled_start, service:clinic_services(id, name, reference)'
      )
      .eq('account_id', accountId)
      .eq('id', initialAppointmentId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error('Não foi possível preparar a marcação no POS.');
          return;
        }
        const service = Array.isArray(data.service)
          ? data.service[0]
          : data.service;
        if (!service) {
          toast.error('A marcação não possui um serviço válido.');
          return;
        }
        setContactId(data.contact_id ?? initialContactId);
        setCart([
          {
            key: `appointment-${data.id}`,
            itemType: 'service',
            sourceId: service.id,
            name: service.name,
            reference: service.reference ?? undefined,
            quantity: 1,
            unitPrice: Number(data.original_price ?? data.price ?? 0),
            // The booked price can include both an operator's manual discount
            // and an Indique & Ganhe discount. The POS must start from the
            // original service price and carry both reductions into the sale.
            discountAmount:
              Number(data.manual_discount_amount ?? 0) +
              Number(data.referral_discount_amount ?? 0),
            taxRate: 0,
            metadata: {
              appointment_id: data.id,
              referral_id: data.referral_id,
              referral_discount_amount: Number(
                data.referral_discount_amount ?? 0
              ),
              manual_discount_amount: Number(data.manual_discount_amount ?? 0),
            },
          },
        ]);
        setSaleNotes(`Pagamento da marcação ${data.id}`);
        setCheckoutAppointmentLabel(
          `${service.name} · ${new Date(data.scheduled_start).toLocaleString('pt-PT')}`
        );
        setActiveTab('pos');
      });
  }, [accountId, initialAppointmentId, initialContactId, supabase]);

  const subtotal = cart.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const itemDiscount = cart.reduce((sum, item) => sum + item.discountAmount, 0);
  const tax = cart.reduce((sum, item) => {
    const base = Math.max(
      item.quantity * item.unitPrice - item.discountAmount,
      0
    );
    return sum + (base * item.taxRate) / 100;
  }, 0);
  const total = Math.max(subtotal - itemDiscount - saleDiscount + tax, 0);
  const paidNow = payments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  );
  const remaining = Math.max(total - paidNow, 0);
  const financeMetrics = useMemo(() => {
    const validSales = sales.filter(
      (sale) => !['voided', 'refunded'].includes(sale.status)
    );
    // Sales imported as already paid are evidence of a past transaction, not
    // money that entered this CRM's cash flow. Keep them visible separately.
    const operational = validSales.filter((sale) => !sale.is_historical);
    const historical = validSales.filter((sale) => sale.is_historical);
    return {
      billed: operational.reduce(
        (sum, sale) => sum + Number(sale.total_amount),
        0
      ),
      received: operational.reduce(
        (sum, sale) => sum + Number(sale.paid_amount),
        0
      ),
      due: operational.reduce((sum, sale) => sum + Number(sale.balance_due), 0),
      openSales: operational.filter((sale) => Number(sale.balance_due) > 0)
        .length,
      historicalTotal: historical.reduce(
        (sum, sale) => sum + Number(sale.total_amount),
        0
      ),
      historicalCount: historical.length,
    };
  }, [sales]);

  const catalog = useMemo<CatalogItem[]>(() => {
    const term = search.trim().toLocaleLowerCase();
    if (catalogMode === 'products') {
      return products
        .filter(
          (item) =>
            !term ||
            `${item.name} ${item.sku ?? ''}`.toLocaleLowerCase().includes(term)
        )
        .map((item) => ({
          id: item.id,
          type: 'product' as const,
          name: item.name,
          reference: item.sku,
          price: Number(item.price),
          detail: `${item.stock_quantity} em stock`,
          available: item.stock_quantity > 0,
        }));
    }
    if (catalogMode === 'packs') {
      return packs
        .filter(
          (item) =>
            item.is_active &&
            (!term ||
              `${item.name} ${item.reference ?? ''}`
                .toLocaleLowerCase()
                .includes(term))
        )
        .map((item) => ({
          id: item.id,
          type: 'pack' as const,
          name: item.name,
          reference: item.reference,
          price: Number(item.price),
          detail: `${item.validity_days} dias`,
        }));
    }
    return services
      .filter(
        (item) =>
          !term ||
          `${item.name} ${item.reference ?? ''}`
            .toLocaleLowerCase()
            .includes(term)
      )
      .map((item) => ({
        id: item.id,
        type: 'service' as const,
        name: item.name,
        reference: item.reference,
        price: Number(item.price),
        detail: `${item.duration_minutes} min`,
      }));
  }, [catalogMode, packs, products, search, services]);

  function addCatalogItem(item: CatalogItem) {
    if (item.available === false) {
      toast.error('Este produto está sem stock.');
      return;
    }
    const key = `${item.type}-${item.id}`;
    setCart((current) => {
      const existing = current.find((entry) => entry.key === key);
      if (existing)
        return current.map((entry) =>
          entry.key === key ? { ...entry, quantity: entry.quantity + 1 } : entry
        );
      return [
        ...current,
        {
          key,
          itemType: item.type,
          sourceId: item.id,
          name: item.name,
          reference: item.reference ?? undefined,
          quantity: 1,
          unitPrice: item.price,
          discountAmount: 0,
          taxRate: 0,
        },
      ];
    });
  }

  function updateCart(key: string, patch: Partial<CartItem>) {
    setCart((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  function removeCart(key: string) {
    setCart((current) => current.filter((item) => item.key !== key));
  }

  function addPayment() {
    const amount = Number(remaining.toFixed(2));
    if (amount <= 0) return;
    setPayments((current) => [
      ...current,
      {
        id: randomId(),
        method: 'card',
        amount,
        referenceCode: '',
        pinCode: '',
      },
    ]);
  }

  function resetSale() {
    setCart([]);
    setContactId('');
    setSaleDiscount(0);
    setSaleNotes('');
    setPayments([]);
    setAlreadyPaidElsewhere(false);
  }

  async function deliverSaleVouchers(saleId: string) {
    const delivery = await fetch('/api/finance/vouchers/deliver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saleId }),
    });
    const payload = (await delivery.json().catch(() => ({}))) as {
      sent?: number;
      skipped?: number;
      failures?: string[];
      error?: string;
      attachments?: number;
      attachmentBytes?: number;
    };
    if (!delivery.ok || payload.failures?.length)
      toast.warning(
        `Pagamento registado, mas o voucher não foi enviado: ${payload.error || payload.failures?.[0] || 'falha no email'}`
      );
    else if (payload.sent && payload.attachments === payload.sent)
      toast.success('Voucher e PDF enviados por email ao cliente.');
    else if (payload.sent)
      toast.warning('O email foi enviado, mas o PDF não foi confirmado.');
    else if (payload.skipped)
      toast.warning('Voucher criado, mas o cliente não possui email na ficha.');
  }

  async function deliverSalePacks(saleId: string) {
    const delivery = await fetch('/api/finance/packs/deliver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saleId }),
    });
    const payload = (await delivery.json().catch(() => ({}))) as {
      sent?: number;
      skipped?: number;
      failures?: string[];
      error?: string;
      notApplicable?: boolean;
    };
    if (payload.notApplicable) return;
    if (!delivery.ok || payload.failures?.length)
      toast.warning(
        `Pagamento registado, mas o pack não foi enviado: ${payload.error || payload.failures?.[0] || 'falha no email'}`
      );
    else if (payload.sent) toast.success('Pack enviado por email ao cliente.');
    else if (payload.skipped)
      toast.warning('Pack criado, mas o cliente não possui email na ficha.');
  }

  async function finishSale(sumUpOnline = false) {
    if (!accountId || !cart.length) return;
    if (
      cart.some(
        (item) =>
          item.quantity <= 0 ||
          item.unitPrice < 0 ||
          item.discountAmount < 0 ||
          item.discountAmount > item.quantity * item.unitPrice ||
          item.taxRate < 0 ||
          item.taxRate > 100
      ) ||
      saleDiscount < 0 ||
      saleDiscount + itemDiscount > subtotal
    ) {
      toast.error('Revise quantidades, impostos e descontos da venda.');
      return;
    }
    if (cart.some((item) => item.itemType === 'pack') && !contactId) {
      toast.error('Selecione um cliente para vender packs.');
      return;
    }
    if (
      !alreadyPaidElsewhere &&
      payments.some((payment) => payment.method === 'cash') &&
      !cashSession
    ) {
      toast.error('Abra o caixa antes de receber dinheiro.');
      setCashOpen(true);
      return;
    }
    if (
      !alreadyPaidElsewhere &&
      payments.some(
        (payment) =>
          payment.method === 'voucher' &&
          (!payment.referenceCode.trim() || !payment.pinCode.trim())
      )
    ) {
      toast.error('Informe o código e o PIN do voucher usado no pagamento.');
      return;
    }
    if (!alreadyPaidElsewhere && paidNow > total + 0.001) {
      toast.error('Os pagamentos não podem ultrapassar o total.');
      return;
    }
    const walletPayment = payments
      .filter((payment) => payment.method === 'client_credit')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    if (!alreadyPaidElsewhere && walletPayment > clientWalletBalance) {
      toast.error('O cartão-saldo do cliente não possui saldo suficiente.');
      return;
    }
    setSaving(true);
    const voucherInSale = cart.some((item) => item.itemType === 'voucher');
    const packInSale = cart.some((item) => item.itemType === 'pack');
    const { data: createdSale, error } = await supabase.rpc(
      'create_finance_sale_secure',
      {
        p_contact_id: contactId || null,
        p_appointment_id: initialAppointmentId || null,
        p_cash_session_id: cashSession?.id ?? null,
        p_currency: defaultCurrency,
        p_items: cart.map((item) => ({
          item_type: item.itemType,
          source_id: item.sourceId ?? null,
          name: item.name,
          reference: item.reference ?? null,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount_amount: item.discountAmount,
          tax_rate: item.taxRate,
          metadata: item.metadata ?? {},
        })),
        p_payments: payments
          .filter((payment) => payment.amount > 0)
          .map((payment) => ({
            method: payment.method,
            amount: payment.amount,
            reference_code: payment.referenceCode || null,
            pin_code: payment.pinCode || null,
          })),
        p_sale_discount: saleDiscount,
        p_already_paid_elsewhere: alreadyPaidElsewhere,
        p_notes: saleNotes || null,
      }
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      remaining > 0
        ? `Venda registada com ${money(remaining, defaultCurrency)} pendente.`
        : 'Venda concluída e paga.'
    );
    const saleId =
      createdSale && typeof createdSale === 'object' && 'id' in createdSale
        ? String(createdSale.id)
        : '';
    if (sumUpOnline && saleId) {
      const response = await fetch('/api/finance/payment-links/sumup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.checkoutUrl)
        toast.error(
          payload.error ||
            'Venda criada, mas não foi possível abrir o checkout SumUp.'
        );
      else {
        window.open(payload.checkoutUrl, '_blank', 'noopener,noreferrer');
        toast.success('Checkout SumUp criado. Pode enviar o link ao cliente.');
      }
    }
    const saleWasPaid =
      createdSale &&
      typeof createdSale === 'object' &&
      'status' in createdSale &&
      createdSale.status === 'paid';
    if (voucherInSale && contactId && saleId && saleWasPaid) {
      try {
        await deliverSaleVouchers(saleId);
      } catch {
        toast.warning('Voucher criado, mas o email não pôde ser enviado.');
      }
    }
    if (packInSale && contactId && saleId && saleWasPaid) {
      try {
        await deliverSalePacks(saleId);
      } catch {
        toast.warning('Pack criado, mas o email não pôde ser enviado.');
      }
    }
    resetSale();
    await loadFinance();
    setActiveTab('sales');
  }

  async function openCashRegister() {
    if (!accountId || !user?.id || !canOperate) return;
    const positions = openingPositions.filter((position) =>
      position.name.trim()
    );
    if (
      !positions.length ||
      positions.some((position) => position.amount < 0)
    ) {
      toast.error('Informe pelo menos uma origem com um saldo válido.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('open_finance_cash_session_v3', {
      p_opening_positions: positions.map((position) => ({
        name: position.name.trim(),
        account_type: position.accountType,
        institution: position.institution.trim() || null,
        amount: position.amount,
        currency: defaultCurrency,
      })),
      p_notes: cashNotes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Caixa aberto.');
    setCashOpen(false);
    setCashNotes('');
    await loadFinance();
  }

  function startOpenCashRegister() {
    setOpeningPositions(
      fundAccounts.length
        ? fundAccounts.map((account) => ({
            id: account.id,
            name: account.name,
            accountType: account.account_type,
            institution: account.institution || '',
            amount: Number(account.balance),
          }))
        : [
            {
              name: 'Dinheiro',
              accountType: 'cash',
              institution: '',
              amount: 0,
            },
            {
              name: 'Revolut',
              accountType: 'bank',
              institution: 'Revolut',
              amount: 0,
            },
            {
              name: 'Santander',
              accountType: 'bank',
              institution: 'Santander',
              amount: 0,
            },
          ]
    );
    setCashOpen(true);
  }

  async function transferFunds() {
    if (
      !transferSourceId ||
      !transferDestinationId ||
      transferSourceId === transferDestinationId ||
      transferAmount <= 0
    ) {
      toast.error('Selecione contas diferentes e informe um valor válido.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('transfer_finance_funds', {
      p_source_account_id: transferSourceId,
      p_destination_account_id: transferDestinationId,
      p_amount: transferAmount,
      p_description: transferDescription.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Transferência entre contas registada.');
    setFundTransferOpen(false);
    setTransferAmount(0);
    setTransferDescription('');
    await loadFinance();
  }

  async function closeCashRegister() {
    if (!cashSession || !user?.id || !canOperate) return;
    const expected = Number(cashSnapshot?.expected_amount ?? 0);
    const counted = {
      ...closingBreakdown,
      cash: closingAmount,
    };
    setSaving(true);
    const { error } = await supabase.rpc('close_finance_cash_session_v2', {
      p_cash_session_id: cashSession.id,
      p_counted_breakdown: counted,
      p_notes: cashNotes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      `Caixa fechado. Diferença: ${money(closingAmount - expected, defaultCurrency)}.`
    );
    setCashCloseOpen(false);
    setClosingBreakdown({});
    setCashNotes('');
    await loadFinance();
  }

  async function addCashMovement() {
    if (
      !cashSession ||
      !canOperate ||
      cashMovementAmount <= 0 ||
      !cashMovementDescription.trim() ||
      !cashMovementDate
    )
      return;
    const occurredAt = new Date(cashMovementDate);
    if (Number.isNaN(occurredAt.getTime())) {
      toast.error('Informe uma data/hora válida.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('add_finance_register_movement', {
      p_cash_session_id: cashSession.id,
      p_movement_type: cashMovementType,
      p_amount: cashMovementAmount,
      p_description: cashMovementDescription.trim(),
      p_reference: cashMovementReference.trim() || null,
      p_payment_method: cashMovementMethod,
      p_category: cashMovementCategory.trim() || null,
      p_occurred_at: occurredAt.toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Movimento de caixa registado.');
    setCashMovementOpen(false);
    setCashMovementAmount(0);
    setCashMovementDescription('');
    setCashMovementReference('');
    setCashMovementCategory('');
    setCashMovementMethod('cash');
    setCashMovementDate(datetimeLocalValue());
    await loadFinance();
  }

  function clearCashMovementForm() {
    setCashMovementOpen(false);
    setEditingCashMovement(null);
    setCashMovementType('expense');
    setCashMovementMethod('cash');
    setCashMovementCategory('');
    setCashMovementAmount(0);
    setCashMovementDescription('');
    setCashMovementReference('');
    setCashMovementDate(datetimeLocalValue());
  }

  function startEditCashMovement(movement: FinanceCashMovement) {
    setEditingCashMovement(movement);
    setCashMovementType(
      movement.movement_type as
        'deposit' | 'withdrawal' | 'expense' | 'adjustment' | 'tip'
    );
    setCashMovementMethod(movement.payment_method || 'cash');
    setCashMovementCategory(movement.category || '');
    setCashMovementAmount(Number(movement.amount));
    setCashMovementDescription(movement.description);
    setCashMovementReference(movement.reference || '');
    setCashMovementDate(datetimeLocalValue(new Date(movement.created_at)));
  }

  async function updateCashMovement() {
    if (
      !editingCashMovement ||
      !canOperate ||
      cashMovementAmount <= 0 ||
      !cashMovementDescription.trim() ||
      !cashMovementDate
    )
      return;
    const occurredAt = new Date(cashMovementDate);
    if (Number.isNaN(occurredAt.getTime())) {
      toast.error('Informe uma data/hora válida.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('finance_cash_movements')
      .update({
        movement_type: cashMovementType,
        payment_method: cashMovementMethod,
        category: cashMovementCategory.trim() || null,
        amount: cashMovementAmount,
        description: cashMovementDescription.trim(),
        reference: cashMovementReference.trim() || null,
        created_at: occurredAt.toISOString(),
      })
      .eq('id', editingCashMovement.id)
      .eq('account_id', accountId);
    setSaving(false);
    if (error) return toast.error(`Não foi possível editar: ${error.message}`);
    toast.success('Lançamento atualizado.');
    clearCashMovementForm();
    await loadFinance();
  }

  async function deleteCashMovement() {
    if (!deletingCashMovement || !canEditSettings) return;
    setSaving(true);
    const { error } = await supabase
      .from('finance_cash_movements')
      .delete()
      .eq('id', deletingCashMovement.id)
      .eq('account_id', accountId);
    setSaving(false);
    if (error) return toast.error(`Não foi possível excluir: ${error.message}`);
    toast.success('Lançamento excluído do caixa.');
    setDeletingCashMovement(null);
    await loadFinance();
  }

  function startReverseSale(sale: FinanceSale) {
    setReverseSale(sale);
    setReverseMode(Number(sale.paid_amount) > 0 ? 'refund' : 'void');
    setReverseReason('');
  }

  async function confirmReverseSale() {
    if (!reverseSale || !reverseReason.trim() || !canOperate) return;
    setSaving(true);
    const { error } = await supabase.rpc('reverse_finance_sale', {
      p_sale_id: reverseSale.id,
      p_mode: reverseMode,
      p_reason: reverseReason.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      reverseMode === 'refund'
        ? 'Venda reembolsada e movimentos revertidos.'
        : 'Venda anulada e stock reposto.'
    );
    setReverseSale(null);
    setReverseReason('');
    await loadFinance();
  }

  function addVoucherToCart() {
    const selectedVoucherService = services.find(
      (service) => service.id === voucherServiceId
    );
    if (
      (voucherType === 'gift_card' && voucherValue <= 0) ||
      (voucherType === 'service' && !selectedVoucherService) ||
      !/^\d{4,8}$/.test(voucherPin)
    ) {
      toast.error('Defina o valor ou serviço e um PIN de 4 a 8 números.');
      return;
    }
    const saleValue =
      voucherType === 'service'
        ? Number(selectedVoucherService?.price ?? 0)
        : voucherValue;
    setCart((current) => [
      ...current,
      {
        key: `voucher-${randomId()}`,
        itemType: 'voucher',
        name:
          voucherType === 'service'
            ? `Voucher · ${selectedVoucherService?.name}`
            : `Cartão-presente ${money(saleValue, defaultCurrency)}`,
        quantity: 1,
        unitPrice: saleValue,
        discountAmount: 0,
        taxRate: 0,
        metadata: {
          face_value: saleValue,
          voucher_type: voucherType,
          service_id: selectedVoucherService?.id ?? null,
          remaining_uses: voucherType === 'service' ? 1 : null,
          service_name: selectedVoucherService?.name ?? null,
          pin_code: voucherPin,
          recipient_name: voucherRecipient,
          message: voucherMessage,
          validity_days: voucherValidity,
        },
      },
    ]);
    setVoucherOpen(false);
    setVoucherRecipient('');
    setVoucherMessage('');
    setVoucherServiceId('');
    setVoucherPin(randomPin());
  }

  function addCustomToCart() {
    if (!customName.trim() || customPrice < 0) return;
    setCart((current) => [
      ...current,
      {
        key: `custom-${randomId()}`,
        itemType: 'custom',
        name: customName.trim(),
        quantity: 1,
        unitPrice: customPrice,
        discountAmount: 0,
        taxRate: 0,
      },
    ]);
    setCustomOpen(false);
    setCustomName('');
    setCustomPrice(0);
  }

  function startLaterPayment(sale: FinanceSale) {
    setPaymentSale(sale);
    setLaterPaymentAmount(Number(sale.balance_due));
    setLaterPaymentMethod('card');
    setLaterReference('');
    setLaterPin('');
    setPaymentOpen(true);
  }

  async function receiveLaterPayment() {
    if (!paymentSale || laterPaymentAmount <= 0) return;
    if (laterPaymentMethod === 'cash' && !cashSession)
      return toast.error('Abra o caixa para receber dinheiro.');
    if (
      laterPaymentMethod === 'voucher' &&
      (!laterReference.trim() || !laterPin.trim())
    )
      return toast.error('Informe o código e o PIN do voucher.');
    if (laterPaymentMethod === 'client_credit') {
      if (!paymentSale.contact_id)
        return toast.error('Esta venda não possui um cliente associado.');
      const { data: wallet } = await supabase
        .from('finance_client_wallets')
        .select('balance')
        .eq('account_id', accountId)
        .eq('contact_id', paymentSale.contact_id)
        .eq('currency', paymentSale.currency)
        .maybeSingle();
      if (Number(wallet?.balance ?? 0) < laterPaymentAmount)
        return toast.error('O cartão-saldo do cliente é insuficiente.');
    }
    setSaving(true);
    const { error } = await supabase.rpc('add_finance_payment_secure', {
      p_sale_id: paymentSale.id,
      p_method: laterPaymentMethod,
      p_amount: laterPaymentAmount,
      p_cash_session_id: cashSession?.id ?? null,
      p_reference_code: laterReference || null,
      p_pin_code: laterPin || null,
      p_notes: null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Pagamento registado.');
    if (laterPaymentAmount >= Number(paymentSale.balance_due)) {
      try {
        await deliverSaleVouchers(paymentSale.id);
        await deliverSalePacks(paymentSale.id);
      } catch {
        toast.warning('Pagamento concluído, mas o email do voucher falhou.');
      }
    }
    setPaymentOpen(false);
    await loadFinance();
  }

  async function approveComplimentarySale(sale: FinanceSale) {
    if (!canOperate) return;
    setSaving(true);
    const { error } = await supabase.rpc('approve_complimentary_finance_sale', {
      p_sale_id: sale.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    try {
      await deliverSaleVouchers(sale.id);
      await deliverSalePacks(sale.id);
    } catch {
      toast.warning('Venda aprovada, mas a entrega por email ficou pendente.');
    }
    toast.success('Venda aprovada e benefício emitido.');
    await loadFinance();
  }

  async function resendSaleVoucher(sale: FinanceSale) {
    if (!canOperate) return;
    if (!sale.contact?.email) {
      toast.error('Adicione um email à ficha do cliente antes de reenviar.');
      return;
    }
    setSaving(true);
    try {
      await deliverSaleVouchers(sale.id);
    } finally {
      setSaving(false);
    }
  }

  async function repairSaleVoucherQuantity(sale: FinanceSale) {
    if (!canOperate) return;
    const response = await fetch('/api/finance/vouchers/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saleId: sale.id }),
    });
    const payload = (await response.json().catch(() => null)) as {
      created?: number;
      error?: string;
    } | null;
    if (!response.ok) {
      toast.error(
        payload?.error || 'N\u00e3o foi poss\u00edvel corrigir os vouchers.'
      );
      return;
    }
    const created = Number(payload?.created ?? 0);
    toast.success(
      created
        ? `${created} voucher${created === 1 ? '' : 's'} criado${created === 1 ? '' : 's'} sem alterar a venda.`
        : 'A venda j\u00e1 tinha todos os vouchers emitidos.'
    );
    await loadFinance();
  }

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );

  if (schemaMissing) {
    return (
      <div className="space-y-5">
        <PageHeader
          cashSession={cashSession}
          onRefresh={loadFinance}
          onNavigate={navigateFinance}
          isOwner={isOwner}
        />
        <div className="border-border bg-card rounded-lg border p-8 text-center">
          <CircleDollarSign className="text-muted-foreground mx-auto size-8" />
          <h2 className="mt-3 text-lg font-semibold">
            Módulo financeiro pronto para ativação
          </h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-xl text-sm">
            Aplique a migração <code>051_finance_pos.sql</code> no Supabase para
            criar POS, pagamentos, caixa, packs, vouchers e stock.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        cashSession={cashSession}
        onRefresh={loadFinance}
        onNavigate={navigateFinance}
        isOwner={isOwner}
      />
      {activeTab === 'overview' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <FinanceMetric
            label="Faturado"
            value={money(financeMetrics.billed, defaultCurrency)}
            detail={`${sales.length} vendas recentes`}
            icon={ReceiptText}
          />
          <FinanceMetric
            label="Recebido"
            value={money(financeMetrics.received, defaultCurrency)}
            detail="pagamentos confirmados"
            icon={CircleDollarSign}
          />
          <FinanceMetric
            label="A receber"
            value={money(financeMetrics.due, defaultCurrency)}
            detail={`${financeMetrics.openSales} contas pendentes`}
            icon={History}
          />
          <FinanceMetric
            label="Histórico externo"
            value={money(financeMetrics.historicalTotal, defaultCurrency)}
            detail={`${financeMetrics.historicalCount} venda(s) já faturada(s)`}
            icon={ReceiptText}
          />
          <FinanceMetric
            label="Caixa esperado"
            value={money(
              Number(cashSnapshot?.expected_amount ?? 0),
              defaultCurrency
            )}
            detail={cashSession ? 'sessão atual' : 'caixa fechado'}
            icon={Banknote}
          />
          <FinanceMetric
            label="Benefícios ativos"
            value={String(
              vouchers.filter((item) => item.status === 'active').length +
                clientPacks.filter((item) => item.status === 'active').length
            )}
            detail="vouchers e packs"
            icon={WalletCards}
          />
        </div>
      )}
      {initialAppointmentId ? (
        <div className="border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Pagamento de marcação</p>
            <p className="text-muted-foreground text-xs">
              {checkoutAppointmentLabel || 'A preparar serviço e cliente...'}
            </p>
          </div>
          <span className="text-primary text-xs font-medium">
            O pagamento integral atualizará a agenda
          </span>
        </div>
      ) : null}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-5">
        <nav aria-label="Navegação financeira" className="rounded-xl border border-border bg-card p-1.5 shadow-sm">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent p-0 sm:grid-cols-4 xl:grid-cols-7">
            <TabsTrigger
              value="overview"
              className="data-active:border-primary data-active:bg-primary/10 h-11 justify-center gap-2 rounded-lg border border-transparent px-2 text-sm font-semibold whitespace-nowrap hover:bg-muted/70"
            >
              <LayoutDashboard />
              Visão geral
            </TabsTrigger>
            <TabsTrigger
              value="pos"
              className="data-active:border-primary data-active:bg-primary/10 h-11 justify-center gap-2 rounded-lg border border-transparent px-2 text-sm font-semibold whitespace-nowrap hover:bg-muted/70"
            >
              <ShoppingCart />
              Ponto de venda
            </TabsTrigger>
            <TabsTrigger
              value="sales"
              className="data-active:border-primary data-active:bg-primary/10 h-11 justify-center gap-2 rounded-lg border border-transparent px-2 text-sm font-semibold whitespace-nowrap hover:bg-muted/70"
            >
              <ReceiptText />
              Vendas
            </TabsTrigger>
            <TabsTrigger
              value="invoices"
              className="data-active:border-primary data-active:bg-primary/10 h-11 justify-center gap-2 rounded-lg border border-transparent px-2 text-sm font-semibold whitespace-nowrap hover:bg-muted/70"
            >
              <FileClock />
              Faturas
              {invoiceRequests.filter((item) => item.status === 'pending')
                .length > 0 && (
                <Badge variant="destructive">
                  {
                    invoiceRequests.filter((item) => item.status === 'pending')
                      .length
                  }
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="cash"
              className="data-active:border-primary data-active:bg-primary/10 h-11 justify-center gap-2 rounded-lg border border-transparent px-2 text-sm font-semibold whitespace-nowrap hover:bg-muted/70"
            >
              <Banknote />
              Caixa
            </TabsTrigger>
            <TabsTrigger
              value="vouchers"
              className="data-active:border-primary data-active:bg-primary/10 h-11 justify-center gap-2 rounded-lg border border-transparent px-2 text-sm font-semibold whitespace-nowrap hover:bg-muted/70"
            >
              <Gift />
              Vouchers
            </TabsTrigger>
            <TabsTrigger
              value="packs"
              className="data-active:border-primary data-active:bg-primary/10 h-11 justify-center gap-2 rounded-lg border border-transparent px-2 text-sm font-semibold whitespace-nowrap hover:bg-muted/70"
            >
              <PackageCheck />
              Packs
            </TabsTrigger>
          </TabsList>
        </nav>

        <TabsContent value="overview">
          <FinanceOverview
            sales={sales}
            cashSession={cashSession}
            vouchers={vouchers}
            clientPacks={clientPacks}
            invoiceRequests={invoiceRequests}
            currency={defaultCurrency}
            isOwner={isOwner}
            onNavigate={navigateFinance}
          />
        </TabsContent>

        <TabsContent value="pos">
          <PosView
            {...{
              catalogMode,
              setCatalogMode,
              search,
              setSearch,
              catalog,
              addCatalogItem,
              cart,
              updateCart,
              removeCart,
              contacts,
              contactId,
              setContactId,
              clientWalletBalance,
              subtotal,
              itemDiscount,
              tax,
              saleDiscount,
              setSaleDiscount,
              total,
              payments,
              setPayments,
              alreadyPaidElsewhere,
              setAlreadyPaidElsewhere,
              addPayment,
              paidNow,
              remaining,
              saleNotes,
              setSaleNotes,
              defaultCurrency,
              canOperate,
              saving,
              finishSale,
              finishSaleOnline: () => void finishSale(true),
              resetSale,
              setCustomOpen,
              setVoucherOpen,
              cashSession,
            }}
          />
        </TabsContent>
        <TabsContent value="sales">
          <SalesView
            sales={sales}
            currency={defaultCurrency}
            onPayment={startLaterPayment}
            onApprove={approveComplimentarySale}
            onResendVoucher={resendSaleVoucher}
            onRepairVoucherQuantity={repairSaleVoucherQuantity}
            onReverse={startReverseSale}
            canOperate={canOperate}
            canRefund={canEditSettings}
            brand={{
              name: account?.name || 'CRM',
              logoUrl: account?.logo_url,
              publicUrl: account?.public_url,
            }}
          />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoiceRequestsView
            requests={invoiceRequests}
            canManage={canEditSettings}
            onRefresh={loadFinance}
          />
        </TabsContent>
        <TabsContent value="cash">
          <CashView
            cashSession={cashSession}
            sales={sales}
            snapshot={cashSnapshot}
            movements={cashMovements}
            sessions={cashSessions}
            fundAccounts={fundAccounts}
            currency={defaultCurrency}
            canOperate={canOperate}
            canDelete={canEditSettings}
            onOpen={startOpenCashRegister}
            onTransfer={() => {
              setTransferSourceId(fundAccounts[0]?.id || '');
              setTransferDestinationId(fundAccounts[1]?.id || '');
              setFundTransferOpen(true);
            }}
            onMovement={() => setCashMovementOpen(true)}
            onEditMovement={startEditCashMovement}
            onDeleteMovement={setDeletingCashMovement}
            onClose={() => {
              setClosingAmount(Number(cashSnapshot?.expected_amount ?? 0));
              const totals = Object.fromEntries(
                PAYMENT_METHODS.map(({ value }) => [
                  value,
                  Number(cashSnapshot?.payments_by_method?.[value] ?? 0) +
                    Number(cashSnapshot?.tips_by_method?.[value] ?? 0),
                ])
              ) as Record<FinancePaymentMethod, number>;
              totals.cash = Number(cashSnapshot?.expected_amount ?? 0);
              setClosingBreakdown(totals);
              setCashCloseOpen(true);
            }}
          />
        </TabsContent>
        <TabsContent value="vouchers">
          <VouchersView
            vouchers={vouchers}
            transferRequests={voucherTransferRequests}
            contacts={contacts}
            logs={benefitLogs}
            currency={defaultCurrency}
            accountId={accountId}
            userId={user?.id ?? ''}
            canManage={canOperate}
            brand={{
              name: account?.name || 'CRM',
              logoUrl: account?.logo_url,
              publicUrl: account?.public_url,
            }}
            onRefresh={loadFinance}
            onSell={() => {
              setActiveTab('pos');
              setVoucherOpen(true);
            }}
          />
        </TabsContent>
        <TabsContent value="packs">
          <PacksView
            packs={packs}
            clientPacks={clientPacks}
            logs={benefitLogs}
            currency={defaultCurrency}
            canConfigure={canEditSettings}
            onCreate={() => window.location.assign('/settings?tab=clinic')}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={cashOpen} onOpenChange={setCashOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Abrir caixa</DialogTitle>
            <DialogDescription>
              Confira onde está cada valor no início do turno.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {openingPositions.map((position, index) => (
              <div
                key={position.id || `${position.name}-${index}`}
                className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[130px_1fr_140px_auto]"
              >
                <NativeSelect
                  value={position.accountType}
                  onChange={(value) =>
                    setOpeningPositions((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              accountType:
                                value as FinanceFundAccount['account_type'],
                            }
                          : item
                      )
                    )
                  }
                >
                  <option value="cash">Dinheiro</option>
                  <option value="bank">Conta bancária</option>
                  <option value="other">Outra conta</option>
                </NativeSelect>
                <Input
                  value={position.name}
                  disabled={Boolean(position.id)}
                  onChange={(event) =>
                    setOpeningPositions((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, name: event.target.value }
                          : item
                      )
                    )
                  }
                  placeholder="Ex.: Revolut ou Santander"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={position.amount}
                  onChange={(event) =>
                    setOpeningPositions((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, amount: Number(event.target.value) }
                          : item
                      )
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Remover origem"
                  disabled={openingPositions.length === 1}
                  onClick={() =>
                    setOpeningPositions((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setOpeningPositions((current) => [
                  ...current,
                  {
                    name: '',
                    accountType: 'bank',
                    institution: '',
                    amount: 0,
                  },
                ])
              }
            >
              <Plus /> Adicionar conta
            </Button>
          </div>
          <Field label="Observação">
            <Textarea
              value={cashNotes}
              onChange={(event) => setCashNotes(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={openCashRegister} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Abrir caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={fundTransferOpen} onOpenChange={setFundTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir entre contas</DialogTitle>
            <DialogDescription>
              Move o valor entre duas contas sem alterar o saldo financeiro
              total.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Conta de origem">
              <NativeSelect
                value={transferSourceId}
                onChange={setTransferSourceId}
              >
                <option value="">Selecione</option>
                {fundAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {money(account.balance, account.currency)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Conta de destino">
              <NativeSelect
                value={transferDestinationId}
                onChange={setTransferDestinationId}
              >
                <option value="">Selecione</option>
                {fundAccounts
                  .filter((account) => account.id !== transferSourceId)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Valor">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={transferAmount}
              onChange={(event) =>
                setTransferAmount(Number(event.target.value))
              }
            />
          </Field>
          <Field label="Descrição (opcional)">
            <Input
              value={transferDescription}
              onChange={(event) => setTransferDescription(event.target.value)}
              placeholder="Ex.: Reforço da conta Santander"
            />
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFundTransferOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={transferFunds} disabled={saving}>
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowRightLeft />
              )}
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={cashCloseOpen} onOpenChange={setCashCloseOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fechar caixa</DialogTitle>
            <DialogDescription>
              Conte todo o dinheiro físico antes de fechar.
            </DialogDescription>
          </DialogHeader>
          <Field label="Valor contado">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={closingAmount}
              onChange={(event) => setClosingAmount(Number(event.target.value))}
            />
          </Field>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Conferência por canal</p>
              <p className="text-muted-foreground text-xs">
                Confirme os totais dos terminais e extratos do turno.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {REGISTER_METHODS.filter(({ value }) => value !== 'cash').map(
                (method) => {
                  const expected =
                    Number(
                      cashSnapshot?.payments_by_method?.[method.value] ?? 0
                    ) +
                    Number(cashSnapshot?.tips_by_method?.[method.value] ?? 0);
                  const counted = Number(
                    closingBreakdown[method.value] ?? expected
                  );
                  return (
                    <Field key={method.value} label={method.label}>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={counted}
                        onChange={(event) =>
                          setClosingBreakdown((current) => ({
                            ...current,
                            [method.value]: Number(event.target.value),
                          }))
                        }
                      />
                      <p
                        className={cn(
                          'mt-1 text-[11px]',
                          Math.abs(counted - expected) > 0.009
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        )}
                      >
                        Sistema: {money(expected, defaultCurrency)}
                        {Math.abs(counted - expected) > 0.009
                          ? ` · diferença ${money(counted - expected, defaultCurrency)}`
                          : ' · conferido'}
                      </p>
                    </Field>
                  );
                }
              )}
            </div>
          </div>
          <div className="bg-muted grid grid-cols-2 gap-3 rounded-md p-3 text-sm">
            <span className="text-muted-foreground">Esperado</span>
            <strong className="text-right">
              {money(
                Number(cashSnapshot?.expected_amount ?? 0),
                defaultCurrency
              )}
            </strong>
            <span className="text-muted-foreground">Diferença</span>
            <strong
              className={cn(
                'text-right',
                Math.abs(
                  closingAmount - Number(cashSnapshot?.expected_amount ?? 0)
                ) > 0.009 && 'text-destructive'
              )}
            >
              {money(
                closingAmount - Number(cashSnapshot?.expected_amount ?? 0),
                defaultCurrency
              )}
            </strong>
          </div>
          <Field label="Observação do fecho">
            <Textarea
              value={cashNotes}
              onChange={(event) => setCashNotes(event.target.value)}
              placeholder="Justifique diferenças ou ocorrências do turno"
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashCloseOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={closeCashRegister} disabled={saving}>
              Fechar caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item livre</DialogTitle>
            <DialogDescription>
              Venda um item ou serviço que ainda não existe no catálogo.
            </DialogDescription>
          </DialogHeader>
          <Field label="Descrição">
            <Input
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
            />
          </Field>
          <Field label="Preço">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={customPrice}
              onChange={(event) => setCustomPrice(Number(event.target.value))}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={addCustomToCart}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={voucherOpen} onOpenChange={setVoucherOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo presente</DialogTitle>
            <DialogDescription>
              Venda saldo livre ou uma modalidade específica com código e PIN.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted grid grid-cols-2 gap-1 rounded-md p-1">
            <button
              type="button"
              onClick={() => setVoucherType('gift_card')}
              className={`rounded-md px-3 py-2 text-sm font-medium ${voucherType === 'gift_card' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              Cartão-presente
            </button>
            <button
              type="button"
              onClick={() => setVoucherType('service')}
              className={`rounded-md px-3 py-2 text-sm font-medium ${voucherType === 'service' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              Voucher de serviço
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {voucherType === 'gift_card' ? (
              <Field label="Valor do cartão">
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={voucherValue}
                  onChange={(event) =>
                    setVoucherValue(Number(event.target.value))
                  }
                />
              </Field>
            ) : (
              <Field label="Modalidade oferecida">
                <NativeSelect
                  value={voucherServiceId}
                  onChange={setVoucherServiceId}
                >
                  <option value="">Selecione um serviço</option>
                  {services
                    .filter((service) => service.is_active)
                    .map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} ·{' '}
                        {money(Number(service.price), service.currency)}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="Validade (dias)">
              <Input
                type="number"
                min="1"
                value={voucherValidity}
                onChange={(event) =>
                  setVoucherValidity(Number(event.target.value))
                }
              />
            </Field>
          </div>
          <Field label="PIN de utilização">
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                value={voucherPin}
                onChange={(event) =>
                  setVoucherPin(
                    event.target.value.replace(/\D/g, '').slice(0, 8)
                  )
                }
                placeholder="4 a 8 números"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setVoucherPin(randomPin())}
              >
                Gerar PIN
              </Button>
            </div>
          </Field>
          <Field label="Destinatário">
            <Input
              value={voucherRecipient}
              onChange={(event) => setVoucherRecipient(event.target.value)}
            />
          </Field>
          <Field label="Mensagem para quem vai receber">
            <Textarea
              value={voucherMessage}
              onChange={(event) => setVoucherMessage(event.target.value)}
              placeholder="Ex.: Este presente foi escolhido especialmente para você. Aproveite!"
              maxLength={180}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoucherOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={addVoucherToCart}>Adicionar ao carrinho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receber pagamento</DialogTitle>
            <DialogDescription>
              Venda #{paymentSale?.sale_number} · saldo{' '}
              {money(Number(paymentSale?.balance_due ?? 0), defaultCurrency)}
            </DialogDescription>
          </DialogHeader>
          <Field label="Meio de pagamento">
            <NativeSelect
              value={laterPaymentMethod}
              onChange={(value) =>
                setLaterPaymentMethod(value as FinancePaymentMethod)
              }
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Valor">
            <Input
              type="number"
              min="0.01"
              max={Number(paymentSale?.balance_due ?? 0)}
              step="0.01"
              value={laterPaymentAmount}
              onChange={(event) =>
                setLaterPaymentAmount(Number(event.target.value))
              }
            />
          </Field>
          {laterPaymentMethod === 'voucher' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <Field label="Código do voucher">
                <Input
                  value={laterReference}
                  onChange={(event) => setLaterReference(event.target.value)}
                />
              </Field>
              <Field label="PIN">
                <Input
                  value={laterPin}
                  inputMode="numeric"
                  type="password"
                  onChange={(event) => setLaterPin(event.target.value)}
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={receiveLaterPayment} disabled={saving}>
              Registar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={cashMovementOpen || Boolean(editingCashMovement)}
        onOpenChange={(open) => {
          if (!open) clearCashMovementForm();
          else setCashMovementOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCashMovement
                ? 'Editar lançamento do caixa'
                : 'Novo movimento de caixa'}
            </DialogTitle>
            <DialogDescription>
              {editingCashMovement
                ? 'A alteração recalcula imediatamente os totais e a conferência do turno.'
                : 'Registe gorjetas, entradas, retiradas, despesas ou acertos em qualquer forma de pagamento.'}
            </DialogDescription>
          </DialogHeader>
          <Field label="Tipo de movimento">
            <NativeSelect
              value={cashMovementType}
              onChange={(value) =>
                setCashMovementType(
                  value as
                    'deposit' | 'withdrawal' | 'expense' | 'adjustment' | 'tip'
                )
              }
            >
              <option value="tip">Gorjeta</option>
              <option value="deposit">Entrada / reforço</option>
              <option value="withdrawal">Retirada / sangria</option>
              <option value="expense">Despesa</option>
              <option value="adjustment">Ajuste</option>
            </NativeSelect>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Forma de pagamento">
              <NativeSelect
                value={cashMovementMethod}
                onChange={(value) =>
                  setCashMovementMethod(value as FinancePaymentMethod)
                }
              >
                {REGISTER_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Categoria (opcional)">
              <Input
                value={cashMovementCategory}
                onChange={(event) =>
                  setCashMovementCategory(event.target.value)
                }
                placeholder={
                  cashMovementType === 'tip'
                    ? 'Equipa, profissional...'
                    : 'Operação, despesas...'
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Valor">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={cashMovementAmount}
                onChange={(event) =>
                  setCashMovementAmount(Number(event.target.value))
                }
              />
            </Field>
            <Field label="Referência (opcional)">
              <Input
                value={cashMovementReference}
                onChange={(event) =>
                  setCashMovementReference(event.target.value)
                }
                placeholder="Fatura, recibo ou documento"
              />
            </Field>
          </div>
          <Field label="Data/hora do lançamento">
            <Input
              type="datetime-local"
              value={cashMovementDate}
              onChange={(event) => setCashMovementDate(event.target.value)}
              max={datetimeLocalValue()}
            />
          </Field>
          <Field label="Motivo">
            <Textarea
              value={cashMovementDescription}
              onChange={(event) =>
                setCashMovementDescription(event.target.value)
              }
              placeholder="Descreva por que este movimento foi realizado"
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={clearCashMovementForm}>
              Cancelar
            </Button>
            <Button
              onClick={
                editingCashMovement ? updateCashMovement : addCashMovement
              }
              disabled={
                saving ||
                cashMovementAmount <= 0 ||
                !cashMovementDescription.trim() ||
                !cashMovementDate
              }
            >
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : editingCashMovement ? (
                <Pencil />
              ) : (
                <Plus />
              )}
              {editingCashMovement
                ? 'Guardar alterações'
                : 'Registar movimento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deletingCashMovement)}
        onOpenChange={(open) => !open && setDeletingCashMovement(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir lançamento do caixa?</DialogTitle>
            <DialogDescription>
              O lançamento “{deletingCashMovement?.description}” será removido e
              os totais do turno serão recalculados. Esta ação não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingCashMovement(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={deleteCashMovement}
              disabled={saving || !canEditSettings}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(reverseSale)}
        onOpenChange={(open) => !open && setReverseSale(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reverseMode === 'refund' ? 'Reembolsar venda' : 'Anular venda'}
            </DialogTitle>
            <DialogDescription>
              Venda #{reverseSale?.sale_number}. O sistema reverte pagamentos,
              stock e benefícios ainda não utilizados, mantendo o histórico de
              auditoria.
            </DialogDescription>
          </DialogHeader>
          {reverseMode === 'refund' && !canEditSettings ? (
            <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-sm">
              Apenas proprietários e administradores podem reembolsar valores
              recebidos.
            </div>
          ) : null}
          <Field label="Motivo obrigatório">
            <Textarea
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              placeholder="Informe o motivo para constar na auditoria"
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseSale(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReverseSale}
              disabled={
                saving ||
                !reverseReason.trim() ||
                (reverseMode === 'refund' && !canEditSettings)
              }
            >
              {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Confirmar {reverseMode === 'refund' ? 'reembolso' : 'anulação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FinanceOverview({
  sales,
  cashSession,
  vouchers,
  clientPacks,
  invoiceRequests,
  currency,
  isOwner,
  onNavigate,
}: {
  sales: FinanceSale[];
  cashSession: FinanceCashSession | null;
  vouchers: FinanceVoucher[];
  clientPacks: FinanceClientPack[];
  invoiceRequests: FinanceInvoiceRequest[];
  currency: string;
  isOwner: boolean;
  onNavigate: (value: string) => void;
}) {
  const openSales = sales.filter(
    (sale) => sale.status === 'open' || sale.status === 'partially_paid'
  );
  const due = openSales.reduce(
    (sum, sale) => sum + Number(sale.balance_due),
    0
  );
  const recent = sales.slice(0, 6);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Operação financeira</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OverviewAction
            icon={ShoppingCart}
            title="Nova venda"
            detail="Registar serviços, produtos e pagamentos"
            onClick={() => onNavigate('pos')}
          />
          <OverviewAction
            icon={History}
            title="Valores a receber"
            detail={`${openSales.length} vendas · ${money(due, currency)}`}
            onClick={() => onNavigate('sales')}
          />
          <OverviewAction
            icon={Banknote}
            title={cashSession ? 'Caixa aberto' : 'Abrir caixa'}
            detail={
              cashSession
                ? 'Consultar movimentos da sessão'
                : 'Iniciar operação em dinheiro'
            }
            onClick={() => onNavigate('cash')}
          />
          <OverviewAction
            icon={FileClock}
            title="Pedidos de fatura"
            detail={`${invoiceRequests.filter((item) => item.status === 'pending').length} aguardam tratamento`}
            onClick={() => onNavigate('invoices')}
          />
          <OverviewAction
            icon={Gift}
            title="Benefícios"
            detail={`${vouchers.filter((item) => item.status === 'active').length} vouchers ativos`}
            onClick={() => onNavigate('vouchers')}
          />
          {isOwner && (
            <OverviewAction
              icon={Landmark}
              title="Gestão e tesouraria"
              detail="Contas, prestações e fluxo de caixa"
              onClick={() => onNavigate('treasury')}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Estado atual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <OverviewLine
            label="Caixa"
            value={cashSession ? 'Aberto' : 'Fechado'}
            positive={Boolean(cashSession)}
          />
          <OverviewLine
            label="Vendas pendentes"
            value={String(openSales.length)}
          />
          <OverviewLine
            label="Faturas pendentes"
            value={String(
              invoiceRequests.filter((item) => item.status === 'pending').length
            )}
          />
          <OverviewLine
            label="Vouchers ativos"
            value={String(
              vouchers.filter((item) => item.status === 'active').length
            )}
          />
          <OverviewLine
            label="Packs ativos"
            value={String(
              clientPacks.filter((item) => item.status === 'active').length
            )}
          />
        </CardContent>
      </Card>
      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle>Últimas vendas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length ? (
            recent.map((sale) => (
              <button
                key={sale.id}
                type="button"
                onClick={() => onNavigate('sales')}
                className="hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">
                    Venda #{sale.sale_number} ·{' '}
                    {sale.contact?.name || 'Cliente não identificado'}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {SALE_STATUS[sale.status] || sale.status} ·{' '}
                    {new Date(sale.created_at).toLocaleDateString('pt-PT')}
                  </p>
                </div>
                <strong>
                  {money(sale.total_amount, sale.currency || currency)}
                </strong>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Ainda não existem vendas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewAction({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:border-primary/50 hover:bg-primary/5 flex gap-3 rounded-xl border p-4 text-left transition-colors"
    >
      <span className="bg-primary/10 text-primary rounded-lg p-2">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
          {detail}
        </span>
      </span>
    </button>
  );
}

function OverviewLine({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant={positive ? 'default' : 'secondary'}>{value}</Badge>
    </div>
  );
}

function PageHeader({
  cashSession,
  onRefresh,
  onNavigate,
  isOwner,
}: {
  cashSession: FinanceCashSession | null;
  onRefresh: () => void;
  onNavigate: (tab: string) => void;
  isOwner: boolean;
}) {
  return (
    <header className="relative overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 px-5 py-6 text-white shadow-xl shadow-slate-950/10 sm:px-7 sm:py-7">
      <div className="absolute -top-32 -right-24 size-80 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="absolute -bottom-40 left-1/4 size-72 rounded-full bg-cyan-500/15 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-emerald-300 uppercase">
            <CircleDollarSign className="size-4" /> Command center
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Centro Financeiro
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300 sm:text-base">
            Vendas, caixa, benefícios e tesouraria reunidos numa operação
            simples, mensurável e pronta para agir.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-2 font-semibold',
                cashSession
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                  : 'border-amber-300/25 bg-amber-300/10 text-amber-200'
              )}
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  cashSession ? 'bg-emerald-400' : 'bg-amber-300'
                )}
              />
              {cashSession ? 'Caixa aberto e operacional' : 'Caixa encerrado'}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-300">
              Atualização em tempo real
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            onClick={onRefresh}
          >
            <RefreshCw /> Atualizar
          </Button>
          <Button
            className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
            onClick={() => onNavigate('pos')}
          >
            <ShoppingCart /> Abrir POS
          </Button>
          {isOwner ? (
            <Button
              variant="outline"
              className="col-span-2 border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
              onClick={() => onNavigate('treasury')}
            >
              <Landmark /> Tesouraria
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function PosView(props: {
  catalogMode: 'services' | 'products' | 'packs';
  setCatalogMode: (value: 'services' | 'products' | 'packs') => void;
  search: string;
  setSearch: (value: string) => void;
  catalog: CatalogItem[];
  addCatalogItem: (item: CatalogItem) => void;
  cart: CartItem[];
  updateCart: (key: string, patch: Partial<CartItem>) => void;
  removeCart: (key: string) => void;
  contacts: Contact[];
  contactId: string;
  setContactId: (value: string) => void;
  clientWalletBalance: number;
  subtotal: number;
  itemDiscount: number;
  tax: number;
  saleDiscount: number;
  setSaleDiscount: (value: number) => void;
  total: number;
  payments: PaymentDraft[];
  setPayments: React.Dispatch<React.SetStateAction<PaymentDraft[]>>;
  alreadyPaidElsewhere: boolean;
  setAlreadyPaidElsewhere: (value: boolean) => void;
  addPayment: () => void;
  paidNow: number;
  remaining: number;
  saleNotes: string;
  setSaleNotes: (value: string) => void;
  defaultCurrency: string;
  canOperate: boolean;
  saving: boolean;
  finishSale: () => void;
  finishSaleOnline: () => void;
  resetSale: () => void;
  setCustomOpen: (value: boolean) => void;
  setVoucherOpen: (value: boolean) => void;
  cashSession: FinanceCashSession | null;
}) {
  const {
    catalogMode,
    setCatalogMode,
    search,
    setSearch,
    catalog,
    cart,
    updateCart,
    removeCart,
    contacts,
    contactId,
    setContactId,
    clientWalletBalance,
    subtotal,
    itemDiscount,
    tax,
    saleDiscount,
    setSaleDiscount,
    total,
    payments,
    setPayments,
    alreadyPaidElsewhere,
    setAlreadyPaidElsewhere,
    addPayment,
    paidNow,
    remaining,
    saleNotes,
    setSaleNotes,
    defaultCurrency,
    canOperate,
    saving,
    finishSale,
    finishSaleOnline,
    resetSale,
    setCustomOpen,
    setVoucherOpen,
    cashSession,
  } = props;
  const [onlinePaymentOpen, setOnlinePaymentOpen] = useState(false);
  const selectedContact = contacts.find((contact) => contact.id === contactId);

  return (
    <div className="grid min-h-[680px] min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="border-border bg-card min-w-0 overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border bg-card/95 sticky top-0 z-10 space-y-3 border-b p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="bg-muted flex rounded-md p-1">
              {(['services', 'products', 'packs'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCatalogMode(mode)}
                  aria-pressed={catalogMode === mode}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${catalogMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {mode === 'services'
                    ? 'Serviços'
                    : mode === 'products'
                      ? 'Produtos'
                      : 'Packs'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVoucherOpen(true)}
              >
                <Gift /> Voucher
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustomOpen(true)}
              >
                <Plus /> Item livre
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar catálogo..."
              aria-label="Pesquisar no catálogo"
              className="h-10 pl-9"
            />
            {search ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSearch('')}
                aria-label="Limpar pesquisa"
                className="absolute top-1/2 right-1.5 -translate-y-1/2"
              >
                <X />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3">
          {catalog.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => props.addCatalogItem(item)}
              disabled={item.available === false}
              className="border-border bg-background hover:border-primary/35 hover:bg-primary/[0.03] disabled:bg-muted/40 group min-h-32 rounded-lg border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="bg-primary-soft text-primary flex size-9 items-center justify-center rounded-lg transition-transform group-hover:scale-105">
                  {item.type === 'service' ? (
                    <BadgeEuro />
                  ) : item.type === 'product' ? (
                    <Box />
                  ) : (
                    <PackageCheck />
                  )}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {money(item.price, defaultCurrency)}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-snug font-medium">
                {item.name}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {item.detail}
              </p>
            </button>
          ))}
          {catalog.length === 0 ? (
            <div className="text-muted-foreground col-span-full flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Search className="mb-3 size-8 opacity-40" />
              <p className="text-foreground text-sm font-medium">
                Nenhum item encontrado
              </p>
              <p className="mt-1 max-w-xs text-xs">
                Experimente outro termo ou selecione uma categoria diferente.
              </p>
              {search ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setSearch('')}
                  className="mt-2"
                >
                  Limpar pesquisa
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
      <section className="border-border bg-card flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-xl border shadow-sm xl:sticky xl:top-16 xl:max-h-[calc(100vh-5rem)]">
        <div className="border-border flex items-center justify-between border-b p-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <span className="bg-primary-soft text-primary flex size-8 items-center justify-center rounded-lg">
                <ShoppingCart className="size-4" />
              </span>
              Venda atual
            </h2>
            <p className="text-muted-foreground text-xs">
              {cart.length} {cart.length === 1 ? 'item' : 'itens'} ·{' '}
              <span className={cashSession ? 'text-emerald-600' : undefined}>
                {cashSession ? 'caixa aberto' : 'sem caixa'}
              </span>
            </p>
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={resetSale}>
              <Trash2 /> Limpar
            </Button>
          )}
        </div>
        <div className="space-y-3 p-4">
          <Field label="Cliente">
            <ContactSearchSelect
              contacts={contacts}
              value={contactId}
              onChange={setContactId}
              placeholder="Consumidor final"
              searchPlaceholder="Buscar por nome, telefone, referência, email..."
              emptyOptionLabel="Consumidor final"
            />
          </Field>
          {selectedContact ? (
            <div className="border-primary/20 bg-primary/[0.04] flex items-center gap-3 rounded-lg border p-3">
              <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {(selectedContact.name || selectedContact.phone)
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {selectedContact.name || 'Cliente sem nome'}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {selectedContact.phone}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setContactId('')}
                aria-label="Remover cliente da venda"
              >
                <X />
              </Button>
            </div>
          ) : null}
          {contactId ? (
            <div className="border-border bg-muted/40 flex items-center justify-between rounded-md border px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Cartão-saldo disponível
              </span>
              <span className="font-semibold">
                {money(clientWalletBalance, defaultCurrency)}
              </span>
            </div>
          ) : null}
        </div>
        <div className="min-h-40 flex-1 space-y-2 overflow-y-auto px-4">
          {cart.length === 0 ? (
            <div className="text-muted-foreground flex h-44 flex-col items-center justify-center rounded-lg border border-dashed text-center text-sm">
              <span className="bg-muted mb-3 flex size-10 items-center justify-center rounded-full">
                <ShoppingCart className="size-5" />
              </span>
              <span className="text-foreground font-medium">
                A venda está vazia
              </span>
              <span className="mt-1 text-xs">Selecione itens no catálogo</span>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.key}
                className="border-border bg-background rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {money(item.unitPrice, defaultCurrency)} cada
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeCart(item.key)}
                  >
                    <X />
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[112px_1fr_1fr]">
                  <div>
                    <span className="text-muted-foreground mb-1 block text-[11px] font-medium uppercase">
                      Quantidade
                    </span>
                    <div className="flex items-center">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Diminuir quantidade de ${item.name}`}
                        onClick={() =>
                          updateCart(item.key, {
                            quantity: Math.max(1, item.quantity - 1),
                          })
                        }
                      >
                        <Minus />
                      </Button>
                      <span className="w-8 text-center text-xs font-semibold">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Aumentar quantidade de ${item.name}`}
                        onClick={() =>
                          updateCart(item.key, { quantity: item.quantity + 1 })
                        }
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                  <label className="text-muted-foreground grid gap-1 text-[11px] font-medium uppercase">
                    Desconto (€)
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.discountAmount}
                      onChange={(event) =>
                        updateCart(item.key, {
                          discountAmount: Number(event.target.value),
                        })
                      }
                      aria-label={`Desconto em euros para ${item.name}`}
                      className="h-9 text-sm normal-case"
                    />
                  </label>
                  <label className="text-muted-foreground grid gap-1 text-[11px] font-medium uppercase">
                    IVA (%)
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.taxRate}
                      onChange={(event) =>
                        updateCart(item.key, {
                          taxRate: Number(event.target.value),
                        })
                      }
                      aria-label={`IVA em percentagem para ${item.name}`}
                      className="h-9 text-sm normal-case"
                    />
                  </label>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-dashed pt-2 text-xs">
                  <span className="text-muted-foreground">
                    Total deste item
                  </span>
                  <strong>
                    {money(
                      Math.max(
                        item.quantity * item.unitPrice - item.discountAmount,
                        0
                      ) *
                        (1 + item.taxRate / 100),
                      defaultCurrency
                    )}
                  </strong>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-border bg-card mt-3 space-y-3 border-t p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-right">
              {money(subtotal, defaultCurrency)}
            </span>
            <span className="text-muted-foreground">Descontos dos itens</span>
            <span className="text-right">
              -{money(itemDiscount, defaultCurrency)}
            </span>
            <span className="text-muted-foreground">
              Desconto adicional da venda
            </span>
            <Input
              type="number"
              min="0"
              max={subtotal - itemDiscount}
              step="0.01"
              value={saleDiscount}
              onChange={(event) => setSaleDiscount(Number(event.target.value))}
              aria-label="Desconto adicional da venda em euros"
              className="h-8 text-right"
            />
            <span className="text-muted-foreground">IVA</span>
            <span className="text-right">{money(tax, defaultCurrency)}</span>
            <span className="border-border mt-1 border-t pt-2 font-semibold">
              Total
            </span>
            <span className="border-border mt-1 border-t pt-2 text-right text-lg font-semibold">
              {money(total, defaultCurrency)}
            </span>
          </div>
          <label className="flex cursor-pointer gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <input
              type="checkbox"
              checked={alreadyPaidElsewhere}
              onChange={(event) => {
                setAlreadyPaidElsewhere(event.target.checked);
                if (event.target.checked) setPayments([]);
              }}
            />
            <span>
              <strong>Já faturado anteriormente</strong>
              <span className="mt-0.5 block text-xs text-amber-800">
                Importa voucher/pack de outra plataforma como ativo, sem criar
                pagamento nem movimento de caixa.
              </span>
            </span>
          </label>
          <div
            className={
              alreadyPaidElsewhere
                ? 'pointer-events-none space-y-2 opacity-45'
                : 'space-y-2'
            }
          >
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="grid grid-cols-[1fr_110px_32px] gap-2"
              >
                <NativeSelect
                  value={payment.method}
                  onChange={(value) =>
                    setPayments((current) =>
                      current.map((row) =>
                        row.id === payment.id
                          ? { ...row, method: value as FinancePaymentMethod }
                          : row
                      )
                    )
                  }
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option
                      key={method.value}
                      value={method.value}
                      disabled={
                        method.value === 'client_credit' &&
                        (!contactId || clientWalletBalance <= 0)
                      }
                    >
                      {method.label}
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payment.amount}
                  onChange={(event) =>
                    setPayments((current) =>
                      current.map((row) =>
                        row.id === payment.id
                          ? { ...row, amount: Number(event.target.value) }
                          : row
                      )
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    setPayments((current) =>
                      current.filter((row) => row.id !== payment.id)
                    )
                  }
                >
                  <X />
                </Button>
                {payment.method === 'voucher' && (
                  <div className="col-span-3 grid gap-2 sm:grid-cols-[1fr_120px]">
                    <Input
                      placeholder="Código do voucher"
                      value={payment.referenceCode}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((row) =>
                            row.id === payment.id
                              ? { ...row, referenceCode: event.target.value }
                              : row
                          )
                        )
                      }
                    />
                    <Input
                      placeholder="PIN"
                      inputMode="numeric"
                      type="password"
                      value={payment.pinCode}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((row) =>
                            row.id === payment.id
                              ? { ...row, pinCode: event.target.value }
                              : row
                          )
                        )
                      }
                    />
                  </div>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addPayment}
              disabled={remaining <= 0}
            >
              <Plus /> Adicionar pagamento
            </Button>
          </div>
          <div className="bg-muted/70 grid grid-cols-2 rounded-lg p-3 text-xs">
            <span>
              Pago agora: <strong>{money(paidNow, defaultCurrency)}</strong>
            </span>
            <span className="text-right">
              Fica pendente:{' '}
              <strong>{money(remaining, defaultCurrency)}</strong>
            </span>
          </div>
          <Textarea
            value={saleNotes}
            onChange={(event) => setSaleNotes(event.target.value)}
            placeholder="Observações da venda"
            className="min-h-16"
          />
          <Button
            className="w-full shadow-sm"
            size="lg"
            onClick={finishSale}
            disabled={!canOperate || saving || cart.length === 0}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Check />}{' '}
            {remaining > 0 ? 'Registar venda parcial' : 'Concluir venda'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setOnlinePaymentOpen(true)}
            disabled={
              !canOperate ||
              saving ||
              cart.length === 0 ||
              paidNow > 0 ||
              alreadyPaidElsewhere
            }
          >
            <Link2 /> Pagamento online SumUp
          </Button>
        </div>
      </section>
      <Dialog open={onlinePaymentOpen} onOpenChange={setOnlinePaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar pagamento online SumUp</DialogTitle>
            <DialogDescription>
              A venda será guardada como pendente e o checkout seguro da SumUp
              abrirá numa nova aba para enviar ao cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg p-3 text-sm">
            Total a cobrar: <strong>{money(total, defaultCurrency)}</strong>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOnlinePaymentOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setOnlinePaymentOpen(false);
                finishSaleOnline();
              }}
            >
              Criar checkout SumUp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
