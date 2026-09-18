'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  Copy,
  CircleDollarSign,
  Clock3,
  History,
  Gift,
  HeartHandshake,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  PackageCheck,
  RefreshCw,
  ReceiptText,
  Save,
  StickyNote,
  Tag,
  Trash2,
  UserRound,
  WalletCards,
  ExternalLink,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { formatCurrency } from '@/lib/currency';
import {
  findExistingContact,
  isUniqueViolation,
  type ExistingContact,
} from '@/lib/contacts/dedupe';
import { createMysqlBrowserClient } from '@/lib/mysql/browser-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import type {
  Contact,
  ContactCustomValue,
  ContactNote,
  CustomField,
  Deal,
  FinanceClientPack,
  FinanceClientWallet,
  FinanceAppointmentBenefit,
  FinanceSale,
  FinanceVoucher,
  FinanceWalletTransaction,
  Message,
  Tag as ContactTag,
} from '@/types';

type Appointment = {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  source?: string | null;
  price: number;
  original_price?: number | null;
  referral_id?: string | null;
  referral_discount_amount?: number | null;
  currency: string;
  confirmation_status?: string | null;
  service?: { name?: string | null; color?: string | null } | null;
  room?: { name?: string | null } | null;
  professional?: { full_name?: string | null; email?: string | null } | null;
  benefits?: Array<
    FinanceAppointmentBenefit & {
      voucher?: FinanceVoucher | null;
      client_pack?: FinanceClientPack | null;
      client_pack_balance?: {
        total_sessions: number;
        used_sessions: number;
        remaining_sessions: number;
      } | null;
    }
  >;
  sales?: FinanceSale[];
};

type Conversation = {
  id: string;
  status: string;
  unread_count: number;
  last_message_text?: string | null;
  last_message_at?: string | null;
  created_at: string;
};

type PortalAccess = {
  id: string;
  last_login_at: string | null;
  requires_password_change: boolean | null;
  created_at: string;
};

type PortalSettings = {
  slug: string;
  enabled: boolean;
};

type DealRow = Deal & {
  stage?: { name?: string | null; color?: string | null } | null;
};

type TimelineEvent = {
  id: string;
  title: string;
  detail: string;
  at: string;
  tone:
    | 'message'
    | 'appointment'
    | 'deal'
    | 'note'
    | 'tag'
    | 'task'
    | 'campaign'
    | 'referral'
    | 'finance';
  href?: string;
};

type ClientTask = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  completed_at: string | null;
  created_at: string;
};

type ScheduledWhatsAppMessage = {
  id: string;
  content_text: string;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  created_at: string;
};

type BroadcastRecipientEvent = {
  id: string;
  status: string;
  created_at: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  broadcast?: {
    id?: string;
    name?: string | null;
    status?: string | null;
    scheduled_at?: string | null;
    sent_at?: string | null;
    created_at?: string | null;
  } | null;
};

type ClientDraft = {
  name: string;
  phone: string;
  email: string;
  company: string;
  clientReference: string;
  birthDate: string;
  taxId: string;
  gender: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  source: string;
  preferredContact: string;
  marketingConsent: boolean;
  whatsappConsent: boolean;
};

type Client360Summary = {
  appointments_total: number;
  appointments_completed: number;
  appointments_no_show: number;
  appointments_upcoming: number;
  next_appointment_at: string | null;
  last_completed_at: string | null;
  sales_count: number;
  total_purchased: number;
  total_received: number;
  total_due: number;
  average_ticket: number;
  conversations_total: number;
  unread_total: number;
  active_deals: number;
  active_deal_value: number;
  wallet_balance: number;
  active_vouchers: number;
  active_packs: number;
  pack_sessions_remaining: number;
};

type ClientActivityEvent = {
  id: string;
  event_type: string;
  title: string;
  detail?: string | null;
  created_at: string;
};

const CLIENT_TABS = [
  'overview',
  'profile',
  'appointments',
  'commercial',
  'benefits',
  'finance',
  'referrals',
  'history',
] as const;

type ClientTab = (typeof CLIENT_TABS)[number];

type ClientReferral = {
  id: string;
  status: string;
  friend_name: string;
  friend_phone: string;
  created_at: string;
  qualified_at?: string | null;
  friend?: { id?: string; name?: string | null; phone?: string | null } | null;
  referrer?: {
    id?: string;
    name?: string | null;
    phone?: string | null;
  } | null;
  rewards?: Array<{
    id: string;
    beneficiary_type: 'referrer' | 'friend';
    reward_code: string;
    status: string;
    reward_type: string;
    reward_value: number;
    credited_amount?: number;
    available_amount?: number;
    reversed_amount?: number;
    issued_wallet_id?: string | null;
    reversal_reason?: string | null;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Faltou',
  open: 'Aberta',
  pending: 'Pendente',
  closed: 'Fechada',
  won: 'Ganho',
  lost: 'Perdido',
  partially_paid: 'Pagamento parcial',
  paid: 'Pago',
  voided: 'Anulado',
  refunded: 'Reembolsado',
  reserved: 'Reservado',
  consumed: 'Consumido',
  released: 'Devolvido',
  active: 'Ativo',
  expired: 'Expirado',
  invited: 'Convidado',
  registered: 'Cadastrado',
  contacted: 'Contactado',
  qualified: 'Qualificado',
  rewarded: 'Premiado',
  rejected: 'Não qualificado',
};

function labelFor(status?: string | null) {
  return STATUS_LABELS[status ?? ''] ?? status ?? 'Sem estado';
}

function initials(value?: string | null) {
  return (value || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function safeDate(value?: string | null, formatValue = 'dd/MM/yyyy HH:mm') {
  if (!value) return 'Sem registo';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sem registo'
    : format(date, formatValue);
}

// MySQL DATE values may arrive through JSON either as YYYY-MM-DD or as an
// ISO timestamp. HTML date inputs accept only the first shape.
function dateInputValue(value?: string | null) {
  if (!value) return '';
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? '';
}

function eventDot(tone: TimelineEvent['tone']) {
  return {
    message: 'bg-sky-500',
    appointment: 'bg-emerald-500',
    deal: 'bg-violet-500',
    note: 'bg-amber-500',
    tag: 'bg-pink-500',
    task: 'bg-orange-500',
    campaign: 'bg-blue-500',
    referral: 'bg-cyan-500',
    finance: 'bg-emerald-500',
  }[tone];
}

export function Client360Page({
  contactId,
  initialTab = 'overview',
}: {
  contactId: string;
  initialTab?: ClientTab;
}) {
  const router = useRouter();
  const { accountId, account, defaultCurrency, user } = useAuth();
  const canOperate = useCan('send-messages');
  // Client 360 talks directly to the CRM MySQL API; no Supabase client or
  // storage service is involved in this dashboard.
  const supabase = useMemo(
    () => createMysqlBrowserClient() as unknown as SupabaseClient,
    []
  );
  const [contact, setContact] = useState<Contact | null>(null);
  const [tags, setTags] = useState<ContactTag[]>([]);
  const [allTags, setAllTags] = useState<ContactTag[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [sales, setSales] = useState<FinanceSale[]>([]);
  const [vouchers, setVouchers] = useState<FinanceVoucher[]>([]);
  const [wallets, setWallets] = useState<FinanceClientWallet[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<
    FinanceWalletTransaction[]
  >([]);
  const [clientPacks, setClientPacks] = useState<FinanceClientPack[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [clientReferrals, setClientReferrals] = useState<ClientReferral[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Client360Summary | null>(null);
  const [clientEvents, setClientEvents] = useState<ClientActivityEvent[]>([]);
  const [clientTasks, setClientTasks] = useState<ClientTask[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<
    ScheduledWhatsAppMessage[]
  >([]);
  const [broadcastEvents, setBroadcastEvents] = useState<
    BroadcastRecipientEvent[]
  >([]);
  const [portalAccess, setPortalAccess] = useState<PortalAccess | null>(null);
  const [portalSettings, setPortalSettings] = useState<PortalSettings | null>(null);
  const [sendingPortalInvite, setSendingPortalInvite] = useState<
    'email' | 'whatsapp' | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [savingClient, setSavingClient] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [mergeCandidate, setMergeCandidate] = useState<ExistingContact | null>(
    null
  );
  const [mergingContact, setMergingContact] = useState(false);
  const [savingCustomFields, setSavingCustomFields] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState('all');
  const [createConversationOpen, setCreateConversationOpen] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [activeTab, setActiveTab] = useState<ClientTab>(initialTab);
  const [draft, setDraft] = useState<ClientDraft>({
    name: '',
    phone: '',
    email: '',
    company: '',
    clientReference: '',
    birthDate: '',
    taxId: '',
    gender: '',
    addressLine: '',
    postalCode: '',
    city: '',
    country: 'Portugal',
    source: '',
    preferredContact: 'whatsapp',
    marketingConsent: false,
    whatsappConsent: true,
  });

  const loadClient = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [
      contactRes,
      tagsRes,
      allTagsRes,
      notesRes,
      dealsRes,
      appointmentsRes,
      conversationsRes,
      salesRes,
      vouchersRes,
      clientPacksRes,
      referralCodeRes,
      referralsRes,
      customFieldsRes,
      customValuesRes,
      walletsRes,
      walletTransactionsRes,
      summaryRes,
      clientEventsRes,
      tasksRes,
      scheduledMessagesRes,
      broadcastEventsRes,
      portalAccessRes,
      portalSettingsRes,
    ] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', contactId).single(),
      supabase
        .from('contact_tags')
        .select('tags(*)')
        .eq('contact_id', contactId),
      supabase
        .from('tags')
        .select('*')
        .eq('account_id', accountId)
        .order('name'),
      supabase
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false }),
      supabase
        .from('deals')
        .select('*, stage:pipeline_stages(name, color)')
        .eq('contact_id', contactId)
        .order('updated_at', { ascending: false })
        .limit(12),
      supabase
        .from('clinic_appointments')
        .select(
          'id, scheduled_start, scheduled_end, status, source, price, original_price, referral_id, referral_discount_amount, currency, confirmation_status, service:clinic_services(name, color), room:clinic_rooms(name), professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name, email), benefits:finance_appointment_benefits(*, voucher:finance_vouchers(*), client_pack:finance_client_packs(*), client_pack_balance:finance_client_pack_balances(total_sessions, used_sessions, remaining_sessions)), sales:finance_sales(*, payments:finance_payments(*))'
        )
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('scheduled_start', { ascending: false })
        .limit(20),
      supabase
        .from('conversations')
        .select(
          'id, status, unread_count, last_message_text, last_message_at, created_at'
        )
        .eq('contact_id', contactId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(12),
      supabase
        .from('finance_sales')
        .select('*, items:finance_sale_items(*), payments:finance_payments(*)')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('finance_vouchers')
        .select('*')
        .eq('account_id', accountId)
        .eq('owner_contact_id', contactId)
        .order('created_at', { ascending: false }),
      supabase
        .from('finance_client_packs')
        .select(
          '*, pack:finance_pack_catalog(*), balances:finance_client_pack_balances(*, service:clinic_services(*))'
        )
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('purchased_at', { ascending: false }),
      supabase
        .from('referral_codes')
        .select('code')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('referrals')
        .select(
          'id, status, friend_name, friend_phone, created_at, qualified_at, referrer:contacts!referrals_referrer_contact_id_fkey(id, name, phone), friend:contacts!referrals_friend_contact_id_fkey(id, name, phone), rewards:referral_rewards(id, beneficiary_type, reward_code, status, reward_type, reward_value, credited_amount, available_amount, reversed_amount, issued_wallet_id, reversal_reason)'
        )
        .eq('account_id', accountId)
        .or(
          `referrer_contact_id.eq.${contactId},friend_contact_id.eq.${contactId}`
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('custom_fields')
        .select('*')
        .eq('account_id', accountId)
        .order('field_name'),
      supabase
        .from('contact_custom_values')
        .select('*')
        .eq('contact_id', contactId),
      supabase
        .from('finance_client_wallets')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('currency'),
      supabase
        .from('finance_wallet_transactions')
        .select('*, wallet:finance_client_wallets!inner(contact_id)')
        .eq('account_id', accountId)
        .eq('wallet.contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.rpc('get_client_360_summary', { p_contact_id: contactId }),
      supabase
        .from('client_activity_events')
        .select('id, event_type, title, detail, created_at')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('crm_tasks')
        .select(
          'id, title, description, due_at, priority, status, completed_at, created_at'
        )
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('scheduled_whatsapp_messages')
        .select('id, content_text, scheduled_at, status, sent_at, created_at')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('scheduled_at', { ascending: false })
        .limit(25),
      supabase
        .from('broadcast_recipients')
        .select(
          'id, status, created_at, sent_at, delivered_at, read_at, broadcast:broadcasts(id, name, status, scheduled_at, sent_at, created_at)'
        )
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('client_portal_access')
        .select('id,last_login_at,requires_password_change,created_at')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .maybeSingle(),
      supabase
        .from('client_portal_settings')
        .select('slug,enabled')
        .eq('account_id', accountId)
        .eq('enabled', true)
        .maybeSingle(),
    ]);

    if (contactRes.error) {
      setLoadError(contactRes.error.message);
      setContact(null);
      setLoading(false);
      return;
    }
    setLoadError(null);

    const nextContact = (contactRes.data as Contact | null) ?? null;
    setContact(nextContact);
    setDraft({
      name: nextContact?.name ?? '',
      phone: nextContact?.phone ?? '',
      email: nextContact?.email ?? '',
      company: nextContact?.company ?? '',
      clientReference: nextContact?.client_reference ?? '',
      birthDate: dateInputValue(nextContact?.birth_date),
      taxId: nextContact?.tax_id ?? '',
      gender: nextContact?.gender ?? '',
      addressLine: nextContact?.address_line ?? '',
      postalCode: nextContact?.postal_code ?? '',
      city: nextContact?.city ?? '',
      country: nextContact?.country ?? 'Portugal',
      source: nextContact?.source ?? '',
      preferredContact: nextContact?.preferred_contact ?? 'whatsapp',
      marketingConsent: Boolean(nextContact?.marketing_consent),
      whatsappConsent: nextContact?.whatsapp_consent !== false,
    });
    setTags(
      ((tagsRes.data ?? [])
        .map((item) => (item as unknown as { tags?: ContactTag | null }).tags)
        .filter(Boolean) as ContactTag[]) ?? []
    );
    setAllTags((allTagsRes.data as ContactTag[] | null) ?? []);
    setNotes((notesRes.data as ContactNote[] | null) ?? []);
    setDeals((dealsRes.data as DealRow[] | null) ?? []);
    setAppointments((appointmentsRes.data as Appointment[] | null) ?? []);
    setSales((salesRes.data as FinanceSale[] | null) ?? []);
    setVouchers((vouchersRes.data as FinanceVoucher[] | null) ?? []);
    setClientPacks((clientPacksRes.data as FinanceClientPack[] | null) ?? []);
    setReferralCode(referralCodeRes.data?.code ?? null);
    setClientReferrals(
      referralsRes.error
        ? []
        : ((referralsRes.data as ClientReferral[] | null) ?? [])
    );
    setCustomFields((customFieldsRes.data as CustomField[] | null) ?? []);
    setCustomValues(
      ((customValuesRes.data as ContactCustomValue[] | null) ?? []).reduce<
        Record<string, string>
      >((result, item) => {
        result[item.custom_field_id] = item.value ?? '';
        return result;
      }, {})
    );
    setWallets(
      walletsRes.error
        ? []
        : ((walletsRes.data as FinanceClientWallet[] | null) ?? [])
    );
    setWalletTransactions(
      walletTransactionsRes.error
        ? []
        : ((walletTransactionsRes.data as FinanceWalletTransaction[] | null) ??
            [])
    );
    setSummary(
      summaryRes.error ? null : (summaryRes.data as Client360Summary | null)
    );
    setClientEvents(
      clientEventsRes.error
        ? []
        : ((clientEventsRes.data as ClientActivityEvent[] | null) ?? [])
    );
    setClientTasks(
      tasksRes.error ? [] : ((tasksRes.data as ClientTask[] | null) ?? [])
    );
    setScheduledMessages(
      scheduledMessagesRes.error
        ? []
        : ((scheduledMessagesRes.data as ScheduledWhatsAppMessage[] | null) ??
            [])
    );
    setBroadcastEvents(
      broadcastEventsRes.error
        ? []
        : ((broadcastEventsRes.data as BroadcastRecipientEvent[] | null) ?? [])
    );
    setPortalAccess(
      portalAccessRes.error
        ? null
        : ((portalAccessRes.data as PortalAccess | null) ?? null)
    );
    setPortalSettings(
      portalSettingsRes.error
        ? null
        : ((portalSettingsRes.data as PortalSettings | null) ?? null)
    );

    const nextConversations =
      (conversationsRes.data as Conversation[] | null) ?? [];
    setConversations(nextConversations);
    if (nextConversations.length) {
      const messageRes = await supabase
        .from('messages')
        .select('*')
        .in(
          'conversation_id',
          nextConversations.map((conversation) => conversation.id)
        )
        .order('created_at', { ascending: false })
        .limit(12);
      setMessages((messageRes.data as Message[] | null) ?? []);
    } else {
      setMessages([]);
    }
    setLoading(false);
  }, [accountId, contactId, supabase]);

  async function sendPortalInvite(
    delivery: 'email' | 'whatsapp',
    purpose: 'invite' | 'reset' = 'invite'
  ) {
    if (!contact || !portalSettings?.slug) {
      toast.error('O Portal 360 não está publicado para esta conta.');
      return;
    }
    if (!contact.email) {
      toast.error('Adicione primeiro o email do cliente para criar o acesso seguro.');
      return;
    }
    if (delivery === 'whatsapp' && !contact.phone) {
      toast.error('Adicione primeiro o telefone do cliente.');
      return;
    }
    setSendingPortalInvite(delivery);
    try {
      const response = await fetch(
        `/api/portal/${encodeURIComponent(portalSettings.slug)}/password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: contact.email, delivery }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error || 'Não foi possível enviar o convite.');
      toast.success(
        delivery === 'email' && purpose === 'reset'
          ? 'Novo link para definir a palavra-passe enviado por email.'
          : delivery === 'email'
          ? 'Convite do Portal 360 enviado por email.'
          : 'Convite do Portal 360 enviado por WhatsApp.'
      );
      await loadClient();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível enviar o convite.'
      );
    } finally {
      setSendingPortalInvite(null);
    }
  }

  useEffect(() => {
    // Fetch the complete client record when its route identity changes.
    loadClient();
  }, [loadClient]);

  useEffect(() => {
    // Keep browser back/forward navigation aligned with the visible tab.
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function saveClient() {
    if (!canOperate) {
      toast.error('O seu cargo possui acesso apenas de leitura.');
      return;
    }
    if (!draft.phone.trim()) {
      toast.error('O telefone do cliente é obrigatório.');
      return;
    }
    if (
      (!contact?.marketing_consent && draft.marketingConsent) ||
      (!contact?.whatsapp_consent && draft.whatsappConsent)
    ) {
      toast.error(
        'Uma nova autorização deve ser confirmada pelo próprio cliente no Portal 360 para ficar acompanhada de prova.'
      );
      return;
    }

    if (draft.birthDate) {
      const parsedBirthDate = new Date(`${draft.birthDate}T00:00:00Z`);
      const today = new Date();
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(draft.birthDate) ||
        Number.isNaN(parsedBirthDate.getTime()) ||
        parsedBirthDate > today ||
        parsedBirthDate.getUTCFullYear() < today.getUTCFullYear() - 125
      ) {
        toast.error('Informe uma data de nascimento valida.');
        return;
      }
    }

    setSavingClient(true);
    const { data, error } = await supabase
      .from('contacts')
      .update({
        name: draft.name.trim() || null,
        phone: draft.phone.trim(),
        email: draft.email.trim() || null,
        company: draft.company.trim() || null,
        client_reference: draft.clientReference.trim() || null,
        birth_date: dateInputValue(draft.birthDate) || null,
        tax_id: draft.taxId.trim() || null,
        gender: draft.gender || null,
        address_line: draft.addressLine.trim() || null,
        postal_code: draft.postalCode.trim() || null,
        city: draft.city.trim() || null,
        country: draft.country.trim() || null,
        source: draft.source.trim() || null,
        preferred_contact: draft.preferredContact || null,
        marketing_consent: draft.marketingConsent,
        whatsapp_consent: draft.whatsappConsent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .select('*')
      .single();

    setSavingClient(false);
    if (error || !data) {
      if (error && isUniqueViolation(error) && accountId) {
        const existing = await findExistingContact(
          supabase,
          accountId,
          draft.phone.trim()
        );
        if (existing && existing.id !== contactId) {
          setMergeCandidate(existing);
          toast.error(
            'Este telefone ja pertence a outro cliente. Pode abrir ou juntar os cadastros.'
          );
          return;
        }
      }
      toast.error(error?.message ?? 'Não foi possível guardar o cliente.');
      return;
    }

    setContact(data as Contact);
    toast.success('Dados do cliente guardados.');
  }

  async function uploadAvatar(file?: File) {
    if (!file || !contact || !canOperate) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      toast.error('Use uma imagem JPG, PNG, WebP ou GIF com ate 2 MB.');
      return;
    }

    setUploadingAvatar(true);
    try {
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/gif' ? 'gif' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `contacts/${contact.id}/avatar-${Date.now()}.${extension}`;
      const payload = new FormData();
      payload.set('file', file);
      payload.set('path', path);
      payload.set('upsert', 'true');
      const uploadResponse = await fetch('/api/storage/avatars', {
        method: 'POST',
        body: payload,
      });
      const upload = await uploadResponse.json().catch(() => null) as { error?: { message?: string } | null } | null;
      if (!uploadResponse.ok || upload?.error) {
        throw new Error(upload?.error?.message || 'Nao foi possivel guardar a fotografia.');
      }
      const avatarUrl = `/uploads/avatars/${path.split('/').map(encodeURIComponent).join('/')}`;
      const { data, error } = await supabase
        .from('contacts')
        .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq('id', contact.id)
        .select('*')
        .single();
      if (error || !data) throw new Error(error?.message || 'Nao foi possivel associar a fotografia ao cliente.');
      setContact(data as Contact);
      toast.success('Fotografia do cliente atualizada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao atualizar a fotografia.');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  async function mergeIntoExistingContact() {
    if (!mergeCandidate || !contactId) return;
    if (!canOperate) {
      toast.error('O seu cargo possui acesso apenas de leitura.');
      return;
    }

    setMergingContact(true);
    const targetId = mergeCandidate.id;
    const { error } = await supabase.rpc('merge_contacts', {
      p_source_contact_id: contactId,
      p_target_contact_id: targetId,
    });
    setMergingContact(false);

    if (error) {
      toast.error(error.message || 'Nao foi possivel juntar os cadastros.');
      return;
    }

    toast.success('Cadastros unidos com sucesso.');
    setMergeCandidate(null);
    router.replace(`/contacts/${targetId}`);
  }

  async function toggleTag(tagId: string) {
    if (!canOperate) return;
    const isLinked = tags.some((tag) => tag.id === tagId);
    const action = isLinked
      ? supabase
          .from('contact_tags')
          .delete()
          .eq('contact_id', contactId)
          .eq('tag_id', tagId)
      : supabase
          .from('contact_tags')
          .insert({ contact_id: contactId, tag_id: tagId });
    const { error } = await action;
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadClient();
  }

  async function saveCustomFields() {
    if (!canOperate || !contactId) return;
    setSavingCustomFields(true);
    const operations = customFields.map(async (field) => {
      const value = customValues[field.id]?.trim() ?? '';
      if (!value) {
        return supabase
          .from('contact_custom_values')
          .delete()
          .eq('contact_id', contactId)
          .eq('custom_field_id', field.id);
      }
      return supabase.from('contact_custom_values').upsert(
        {
          contact_id: contactId,
          custom_field_id: field.id,
          value,
        },
        { onConflict: 'contact_id,custom_field_id' }
      );
    });
    const results = await Promise.all(operations);
    setSavingCustomFields(false);
    const error = results.find((result) => result.error)?.error;
    if (error) {
      toast.error(`Não foi possível guardar os campos: ${error.message}`);
      return;
    }
    toast.success('Campos personalizados guardados.');
    void loadClient();
  }

  async function addNote() {
    if (!canOperate || !user?.id || !newNote.trim()) return;
    setSavingNote(true);
    const { error } = await supabase.from('contact_notes').insert({
      contact_id: contactId,
      user_id: user.id,
      note_text: newNote.trim(),
    });
    setSavingNote(false);
    if (error) {
      toast.error(`Não foi possível criar a nota: ${error.message}`);
      return;
    }
    setNewNote('');
    toast.success('Nota adicionada à ficha.');
    void loadClient();
  }

  async function deleteNote(noteId: string) {
    if (!canOperate) return;
    const { error } = await supabase
      .from('contact_notes')
      .delete()
      .eq('id', noteId)
      .eq('contact_id', contactId);
    if (error) {
      toast.error(`Não foi possível remover a nota: ${error.message}`);
      return;
    }
    setNotes((current) => current.filter((note) => note.id !== noteId));
    toast.success('Nota removida.');
  }

  function changeTab(value: string) {
    if (!CLIENT_TABS.includes(value as ClientTab)) return;
    const nextTab = value as ClientTab;
    setActiveTab(nextTab);
    router.replace(`/contacts/${contactId}?tab=${nextTab}`, { scroll: false });
  }

  const nextAppointment = useMemo(
    () =>
      appointments
        .filter(
          (appointment) =>
            new Date(appointment.scheduled_start).getTime() >= currentTime &&
            !['cancelled', 'no_show'].includes(appointment.status)
        )
        .sort(
          (a, b) =>
            new Date(a.scheduled_start).getTime() -
            new Date(b.scheduled_start).getTime()
        )[0],
    [appointments, currentTime]
  );

  const activeDeals = deals.filter(
    (deal) => (deal.status ?? 'open') === 'open'
  );
  const dealValue = activeDeals.reduce(
    (sum, deal) => sum + Number(deal.value ?? 0),
    0
  );
  const latestConversation = conversations[0];

  const openInbox = () => {
    if (latestConversation) {
      router.push(`/inbox?c=${latestConversation.id}`);
      return;
    }
    setCreateConversationOpen(true);
  };

  const createConversation = async () => {
    if (!canOperate || !accountId || !user || !contact) return;
    setCreatingConversation(true);
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        account_id: accountId,
        user_id: user.id,
        contact_id: contact.id,
        status: 'open',
        unread_count: 0,
      })
      .select('id, status, unread_count, created_at')
      .single();

    setCreatingConversation(false);
    if (error) {
      toast.error(`Não foi possível iniciar a conversa: ${error.message}`);
      return;
    }

    setCreateConversationOpen(false);
    router.push(`/inbox?c=${data.id}`);
  };
  const listedPurchased = sales.reduce(
    (sum, sale) => sum + Number(sale.total_amount ?? 0),
    0
  );
  const listedDue = sales.reduce(
    (sum, sale) => sum + Number(sale.balance_due ?? 0),
    0
  );
  const totalPurchased = Number(summary?.total_purchased ?? listedPurchased);
  const totalDue = Number(summary?.total_due ?? listedDue);
  const walletBalance = Number(
    summary?.wallet_balance ??
      wallets.reduce((sum, wallet) => sum + Number(wallet.balance), 0)
  );
  const regularVouchers = vouchers.filter(
    (voucher) =>
      voucher.message !== 'Migrado para o cartão-saldo do cliente' &&
      !voucher.message?.includes(
        'Crédito acumulado do programa Indique & Ganhe'
      )
  );
  const referralUrl = referralCode
    ? `${account?.public_url?.replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '')}/refer/${referralCode}`
    : null;
  const completedAppointments = Number(
    summary?.appointments_completed ??
      appointments.filter((item) => item.status === 'completed').length
  );
  const noShowAppointments = Number(
    summary?.appointments_no_show ??
      appointments.filter((item) => item.status === 'no_show').length
  );
  const attendanceBase = completedAppointments + noShowAppointments;
  const noShowRate = attendanceBase
    ? Math.round((noShowAppointments / attendanceBase) * 100)
    : 0;
  const profileFields = [
    contact?.name,
    contact?.phone,
    contact?.email,
    contact?.company,
    contact?.client_reference,
    contact?.birth_date,
    contact?.tax_id,
    contact?.address_line,
    contact?.postal_code,
    contact?.city,
    contact?.country,
    contact?.source,
    ...customFields.map((field) => customValues[field.id]),
  ];
  const profileCompleteness = profileFields.length
    ? Math.round(
        (profileFields.filter((value) => String(value ?? '').trim()).length /
          profileFields.length) *
          100
      )
    : 0;

  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [
      ...messages.map((message) => ({
        id: `message-${message.id}`,
        title:
          message.sender_type === 'customer'
            ? 'Mensagem recebida'
            : 'Mensagem enviada',
        detail: message.content_text || 'Mensagem com anexo',
        at: message.created_at,
        tone: 'message' as const,
        href: `/inbox?c=${message.conversation_id}`,
      })),
      ...appointments.map((appointment) => ({
        id: `appointment-${appointment.id}`,
        title: `Marcação ${labelFor(appointment.status).toLowerCase()}`,
        detail: `${appointment.service?.name ?? 'Procedimento'} · ${safeDate(appointment.scheduled_start)}`,
        at: appointment.scheduled_start,
        tone: 'appointment' as const,
        href: `/agenda?appointment=${appointment.id}`,
      })),
      ...deals.map((deal) => ({
        id: `deal-${deal.id}`,
        title: `Negócio ${labelFor(deal.status ?? 'open').toLowerCase()}`,
        detail: `${deal.title} · ${formatCurrency(Number(deal.value ?? 0), deal.currency ?? defaultCurrency)}`,
        at: deal.updated_at ?? deal.created_at,
        tone: 'deal' as const,
        href: `/pipelines?deal=${deal.id}`,
      })),
      ...clientEvents.map((event) => ({
        id: `client-${event.id}`,
        title: event.title,
        detail: event.detail || 'Evento registado na ficha do cliente',
        at: event.created_at,
        tone: event.event_type.startsWith('tag')
          ? ('tag' as const)
          : ('note' as const),
      })),
      ...clientTasks.map((task) => ({
        id: `task-${task.id}`,
        title:
          task.status === 'completed'
            ? `Tarefa concluída: ${task.title}`
            : `Tarefa criada: ${task.title}`,
        detail:
          task.description ||
          `${labelFor(task.priority)} · ${task.due_at ? safeDate(task.due_at) : 'Sem prazo'}`,
        at: task.completed_at || task.due_at || task.created_at,
        tone: 'task' as const,
        href: `/tasks?contact=${contactId}`,
      })),
      ...scheduledMessages.map((message) => ({
        id: `scheduled-message-${message.id}`,
        title: `Mensagem ${labelFor(message.status).toLowerCase()}`,
        detail: message.content_text || 'Mensagem automática/agendada',
        at: message.sent_at || message.scheduled_at || message.created_at,
        tone: 'campaign' as const,
        href: '/scheduled-messages',
      })),
      ...broadcastEvents.map((recipient) => ({
        id: `broadcast-${recipient.id}`,
        title: `Campanha ${labelFor(recipient.status).toLowerCase()}`,
        detail: recipient.broadcast?.name || 'Envio de campanha',
        at:
          recipient.read_at ||
          recipient.delivered_at ||
          recipient.sent_at ||
          recipient.broadcast?.sent_at ||
          recipient.broadcast?.scheduled_at ||
          recipient.created_at,
        tone: 'campaign' as const,
        href: recipient.broadcast?.id
          ? `/broadcasts/${recipient.broadcast.id}`
          : '/broadcasts',
      })),
      ...clientReferrals.map((referral) => ({
        id: `referral-${referral.id}`,
        title:
          referral.friend?.id === contactId
            ? 'Cliente indicado por alguém'
            : 'Amigo indicado',
        detail:
          referral.friend?.id === contactId
            ? `${referral.referrer?.name || referral.referrer?.phone || 'Cliente'} · ${labelFor(referral.status)}`
            : `${referral.friend?.name || referral.friend_name} · ${labelFor(referral.status)}`,
        at: referral.qualified_at || referral.created_at,
        tone: 'referral' as const,
        href: '/referrals',
      })),
      ...sales.map((sale) => ({
        id: `sale-${sale.id}`,
        title: `Venda ${labelFor(sale.status).toLowerCase()}`,
        detail: `#${sale.sale_number} · ${formatCurrency(Number(sale.total_amount), sale.currency)}`,
        at: sale.created_at,
        tone: 'finance' as const,
        href: `/finance?tab=sales#sale-${sale.id}`,
      })),
      ...walletTransactions.map((transaction) => ({
        id: `wallet-${transaction.id}`,
        title:
          Number(transaction.amount) >= 0
            ? 'Crédito no cartão-saldo'
            : 'Utilização do cartão-saldo',
        detail: `${transaction.description || 'Movimento de carteira'} · ${formatCurrency(Number(transaction.amount), wallets.find((wallet) => wallet.id === transaction.wallet_id)?.currency || defaultCurrency)}`,
        at: transaction.created_at,
        tone: 'finance' as const,
        href: `/contacts/${contactId}?tab=finance`,
      })),
    ];

    return events
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 30);
  }, [
    appointments,
    clientEvents,
    clientTasks,
    clientReferrals,
    broadcastEvents,
    deals,
    defaultCurrency,
    messages,
    sales,
    scheduledMessages,
    walletTransactions,
    wallets,
    contactId,
  ]);
  const visibleTimeline = timeline.filter(
    (event) => timelineFilter === 'all' || event.tone === timelineFilter
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">Cliente não encontrado</h1>
        {loadError ? (
          <p className="text-destructive text-sm">{loadError}</p>
        ) : null}
        <Button variant="outline" onClick={() => router.push('/contacts')}>
          <ArrowLeft /> Voltar para Clientes
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      {!canOperate ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
          <UserRound className="size-4" />
          Modo de leitura: o seu cargo pode consultar a ficha, mas não alterar
          dados operacionais.
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/contacts')}
        >
          <ArrowLeft /> Clientes
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadClient}>
            <RefreshCw /> Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => changeTab('profile')}
            disabled={!canOperate}
          >
            <Pencil /> Editar cliente
          </Button>
          <Button variant="outline" size="sm" onClick={openInbox}>
            <MessageCircle />
            {latestConversation ? 'Abrir Inbox' : 'Iniciar conversa'}
          </Button>
          <span className="bg-border hidden h-8 w-px sm:block" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/finance?contact=${contact.id}`)}
          >
            <ReceiptText /> Financeiro
          </Button>
          <Button
            size="sm"
            disabled={!canOperate}
            onClick={() => router.push(`/agenda?contact=${contact.id}`)}
          >
            <CalendarClock /> Nova marcação
          </Button>
        </div>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              <Avatar className="h-14 w-14 border">
                <AvatarImage
                  src={contact.avatar_url || undefined}
                  alt={contact.name || contact.phone || 'Cliente'}
                />
              <AvatarFallback className="bg-primary/10 text-primary text-base font-semibold">
                {initials(contact.name || contact.phone)}
              </AvatarFallback>
              </Avatar>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => void uploadAvatar(event.target.files?.[0])}
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute -right-2 -bottom-2 size-7 rounded-full shadow-sm"
                disabled={!canOperate || uploadingAvatar}
                title="Alterar fotografia"
                onClick={() => avatarInputRef.current?.click()}
              >
                {uploadingAvatar ? <RefreshCw className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
              </Button>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold">
                  {contact.name || contact.phone}
                </h1>
                {contact.client_reference && (
                  <Badge variant="secondary">
                    Ref. {contact.client_reference}
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {contact.phone}
                </span>
                {contact.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {contact.email}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.length ? (
                  tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: `${tag.color}22`,
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Sem etiquetas
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="border-border grid grid-cols-2 gap-x-6 gap-y-2 border-l-0 pl-0 text-sm md:border-l md:pl-6">
            <div>
              <p className="text-muted-foreground text-xs">Cliente desde</p>
              <p className="font-medium">
                {safeDate(contact.created_at, 'dd/MM/yyyy')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Última atividade</p>
              <p className="font-medium">
                {safeDate(
                  latestConversation?.last_message_at ?? contact.updated_at,
                  'dd/MM HH:mm'
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          icon={CalendarClock}
          label="Próxima marcação"
          value={
            nextAppointment
              ? safeDate(nextAppointment.scheduled_start, 'dd/MM HH:mm')
              : 'Sem marcação'
          }
          detail={
            nextAppointment?.service?.name ?? 'Agende o próximo atendimento'
          }
        />
        <Metric
          icon={MessageCircle}
          label="Conversas"
          value={String(summary?.conversations_total ?? conversations.length)}
          detail={`${Number(summary?.unread_total ?? conversations.reduce((sum, item) => sum + Number(item.unread_count ?? 0), 0))} não lidas`}
        />
        <Metric
          icon={BriefcaseBusiness}
          label="Negócios ativos"
          value={String(summary?.active_deals ?? activeDeals.length)}
          detail={formatCurrency(
            Number(summary?.active_deal_value ?? dealValue),
            defaultCurrency
          )}
        />
        <Metric
          icon={CircleDollarSign}
          label="Atendimentos"
          value={String(summary?.appointments_total ?? appointments.length)}
          detail={`${completedAppointments} concluídos`}
        />
        <Metric
          icon={ReceiptText}
          label="Financeiro"
          value={formatCurrency(totalPurchased, defaultCurrency)}
          detail={
            totalDue > 0
              ? `${formatCurrency(totalDue, defaultCurrency)} por receber`
              : 'Sem saldo pendente'
          }
        />
      </div>

      <Tabs value={activeTab} onValueChange={changeTab} className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="profile">Ficha</TabsTrigger>
          <TabsTrigger value="appointments">Agenda</TabsTrigger>
          <TabsTrigger value="commercial">Comercial</TabsTrigger>
          <TabsTrigger value="benefits">Packs e vouchers</TabsTrigger>
          <TabsTrigger value="finance">Financeiro</TabsTrigger>
          <TabsTrigger value="referrals">Indicações</TabsTrigger>
          <TabsTrigger value="history">Linha do tempo</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Próximo atendimento</CardTitle>
                <CardDescription>
                  Informação operacional para a equipa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {nextAppointment ? (
                  <AppointmentRow
                    appointment={nextAppointment}
                    onOpen={() =>
                      router.push(`/agenda?appointment=${nextAppointment.id}`)
                    }
                  />
                ) : (
                  <Empty
                    icon={CalendarClock}
                    text="Este cliente ainda não tem marcações futuras."
                    action={canOperate ? 'Criar marcação' : undefined}
                    onClick={() => router.push(`/agenda?contact=${contact.id}`)}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Cliente em contexto</CardTitle>
                <CardDescription>
                  Dados que ajudam a atender melhor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Info
                  icon={UserRound}
                  label="Empresa"
                  value={contact.company || 'Não informada'}
                />
                <Info
                  icon={Tag}
                  label="Etiquetas"
                  value={
                    tags.length
                      ? tags.map((tag) => tag.name).join(', ')
                      : 'Sem etiquetas'
                  }
                />
                <Info
                  icon={StickyNote}
                  label="Notas"
                  value={`${notes.length} registadas`}
                />
                <Info
                  icon={Clock3}
                  label="Última conversa"
                  value={safeDate(
                    latestConversation?.last_message_at,
                    'dd/MM/yyyy HH:mm'
                  )}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Portal 360</CardTitle>
                <CardDescription>
                  Acesso privado a marcações, benefícios e dados pessoais.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {portalAccess ? (
                  <>
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                      {portalAccess.last_login_at ? 'Acesso ativo' : 'Convite criado'}
                    </Badge>
                    <p className="text-muted-foreground">
                      {portalAccess.last_login_at
                        ? `Último acesso: ${safeDate(portalAccess.last_login_at, 'dd/MM/yyyy HH:mm')}`
                        : 'O cliente ainda não entrou no Portal 360.'}
                    </p>
                    {portalAccess.requires_password_change ? (
                      <p className="text-amber-700">Aguarda a definição da palavra-passe pelo cliente.</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canOperate || sendingPortalInvite !== null || !contact?.email}
                        onClick={() => sendPortalInvite('email', 'reset')}
                      >
                        <Mail />
                        {sendingPortalInvite === 'email'
                          ? 'A enviar…'
                          : portalAccess.requires_password_change
                            ? 'Reenviar acesso por email'
                            : 'Enviar link para nova palavra-passe'}
                      </Button>
                    </div>
                    {!contact?.email ? (
                      <p className="text-destructive text-xs">
                        Adicione um email ao cliente para reenviar o acesso.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Badge variant="secondary">Sem acesso criado</Badge>
                    <p className="text-muted-foreground">
                      Envie uma breve apresentação com um link pessoal para o cliente criar o acesso.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={!canOperate || sendingPortalInvite !== null} onClick={() => sendPortalInvite('email')}>
                        <Mail /> {sendingPortalInvite === 'email' ? 'A enviar…' : 'Enviar por email'}
                      </Button>
                      <Button size="sm" disabled={!canOperate || sendingPortalInvite !== null} onClick={() => sendPortalInvite('whatsapp')}>
                        <MessageCircle /> {sendingPortalInvite === 'whatsapp' ? 'A enviar…' : 'Enviar por WhatsApp'}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Saúde do relacionamento</CardTitle>
                <CardDescription>
                  Indicadores de valor, frequência e risco calculados sobre todo
                  o histórico.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <RelationshipMetric
                  label="Lifetime value"
                  value={formatCurrency(totalPurchased, defaultCurrency)}
                />
                <RelationshipMetric
                  label="Ticket médio"
                  value={formatCurrency(
                    Number(summary?.average_ticket ?? 0),
                    defaultCurrency
                  )}
                />
                <RelationshipMetric
                  label="Última visita"
                  value={safeDate(summary?.last_completed_at, 'dd/MM/yyyy')}
                />
                <RelationshipMetric
                  label="Taxa de faltas"
                  value={`${noShowRate}%`}
                />
                <RelationshipMetric
                  label="Cartão-saldo"
                  value={formatCurrency(walletBalance, defaultCurrency)}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="profile">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Dados do cliente</CardTitle>
                <CardDescription>
                  A identificação central usada pela agenda, Inbox e CRM.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="bg-muted/40 rounded-md border p-3 sm:col-span-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">Completude da ficha</span>
                    <span className="font-semibold">
                      {profileCompleteness}%
                    </span>
                  </div>
                  <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${profileCompleteness}%` }}
                    />
                  </div>
                </div>
                <EditField
                  label="Nome"
                  value={draft.name}
                  disabled={!canOperate}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, name: value }))
                  }
                />
                <EditField
                  label="Referência do cliente"
                  value={draft.clientReference}
                  disabled={!canOperate}
                  placeholder="Ex.: 000096"
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      clientReference: value,
                    }))
                  }
                />
                <EditField
                  label="Telefone"
                  value={draft.phone}
                  disabled={!canOperate}
                  required
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, phone: value }))
                  }
                />
                <EditField
                  label="E-mail"
                  value={draft.email}
                  disabled={!canOperate}
                  type="email"
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, email: value }))
                  }
                />
                <div className="sm:col-span-2">
                  <EditField
                    label="Empresa"
                    value={draft.company}
                    disabled={!canOperate}
                    onChange={(value) =>
                      setDraft((current) => ({ ...current, company: value }))
                    }
                  />
                </div>
                <EditField
                  label="Data de nascimento"
                  type="date"
                  value={draft.birthDate}
                  disabled={!canOperate}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, birthDate: value }))
                  }
                />
                <EditField
                  label="NIF"
                  value={draft.taxId}
                  disabled={!canOperate}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, taxId: value }))
                  }
                />
                <label className="grid gap-1.5 text-sm font-medium">
                  Género
                  <select
                    value={draft.gender}
                    disabled={!canOperate}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        gender: event.target.value,
                      }))
                    }
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm disabled:opacity-50"
                  >
                    <option value="">Não informado</option>
                    <option value="male">Masculino</option>
                    <option value="female">Feminino</option>
                    <option value="non_binary">Não binário</option>
                    <option value="not_informed">Prefere não informar</option>
                  </select>
                </label>
                <EditField
                  label="Origem do cliente"
                  value={draft.source}
                  placeholder="Ex.: indicação, Instagram, Google"
                  disabled={!canOperate}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, source: value }))
                  }
                />
                <div className="sm:col-span-2">
                  <EditField
                    label="Morada"
                    value={draft.addressLine}
                    disabled={!canOperate}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        addressLine: value,
                      }))
                    }
                  />
                </div>
                <EditField
                  label="Código postal"
                  value={draft.postalCode}
                  disabled={!canOperate}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, postalCode: value }))
                  }
                />
                <EditField
                  label="Localidade"
                  value={draft.city}
                  disabled={!canOperate}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, city: value }))
                  }
                />
                <EditField
                  label="País"
                  value={draft.country}
                  disabled={!canOperate}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, country: value }))
                  }
                />
                <label className="grid gap-1.5 text-sm font-medium">
                  Canal preferido
                  <select
                    value={draft.preferredContact}
                    disabled={!canOperate}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        preferredContact: event.target.value,
                      }))
                    }
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm disabled:opacity-50"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="phone">Telefone</option>
                    <option value="email">E-mail</option>
                  </select>
                </label>
                <div className="bg-muted/40 grid gap-3 rounded-md border p-3 sm:col-span-2 sm:grid-cols-2">
                  {contact?.privacy_review_status === 'legacy_unverified' && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 sm:col-span-2">
                      <strong>Consentimentos antigos por confirmar.</strong>{' '}
                      Peça ao cliente para rever estas escolhas no Portal 360.
                      Até lá, campanhas permanecem bloqueadas.
                    </div>
                  )}
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={draft.whatsappConsent}
                      disabled={!canOperate}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          whatsappConsent: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <span className="block font-medium">WhatsApp</span>
                      <span className="text-muted-foreground text-xs">
                        Autoriza comunicações operacionais.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={draft.marketingConsent}
                      disabled={!canOperate}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          marketingConsent: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <span className="block font-medium">Marketing</span>
                      <span className="text-muted-foreground text-xs">
                        Autoriza campanhas e promoções.
                      </span>
                    </span>
                  </label>
                </div>
                <div className="flex justify-end sm:col-span-2">
                  <Button
                    onClick={saveClient}
                    disabled={savingClient || !canOperate}
                  >
                    <Save />{' '}
                    {savingClient ? 'A guardar...' : 'Guardar dados do cliente'}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Etiquetas</CardTitle>
                <CardDescription>
                  Use etiquetas para segmentar e acionar automações.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {allTags.length ? (
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => {
                      const linked = tags.some((item) => item.id === tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          disabled={!canOperate}
                          onClick={() => void toggleTag(tag.id)}
                          className="rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: linked
                              ? `${tag.color}28`
                              : `${tag.color}12`,
                            color: tag.color,
                            boxShadow: linked
                              ? `inset 0 0 0 1px ${tag.color}`
                              : undefined,
                          }}
                        >
                          {linked ? '✓ ' : ''}
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Ainda não existem etiquetas configuradas.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Campos personalizados</CardTitle>
                <CardDescription>
                  Informações específicas configuradas para este CRM.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {customFields.length ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {customFields.map((field) => (
                        <CustomFieldEditor
                          key={field.id}
                          field={field}
                          value={customValues[field.id] ?? ''}
                          disabled={!canOperate}
                          onChange={(value) =>
                            setCustomValues((current) => ({
                              ...current,
                              [field.id]: value,
                            }))
                          }
                        />
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={() => void saveCustomFields()}
                        disabled={savingCustomFields || !canOperate}
                      >
                        <Save />
                        {savingCustomFields ? 'A guardar...' : 'Guardar campos'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Empty
                    icon={StickyNote}
                    text="Não existem campos personalizados configurados."
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Notas internas</CardTitle>
                <CardDescription>
                  Contexto privado para continuidade do atendimento.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={newNote}
                    disabled={!canOperate}
                    onChange={(event) => setNewNote(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void addNote();
                      }
                    }}
                    placeholder="Adicionar uma nota interna..."
                  />
                  <Button
                    size="icon"
                    title="Adicionar nota"
                    disabled={!canOperate || savingNote || !newNote.trim()}
                    onClick={() => void addNote()}
                  >
                    <Plus />
                  </Button>
                </div>
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {notes.length ? (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        className="border-border group rounded-md border p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm whitespace-pre-wrap">
                            {note.note_text}
                          </p>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Remover nota"
                            disabled={!canOperate}
                            onClick={() => void deleteNote(note.id)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        <p className="text-muted-foreground mt-2 text-xs">
                          {safeDate(note.created_at)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Nenhuma nota registada.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="appointments">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Agenda do cliente</CardTitle>
                <CardDescription>
                  Marcações recentes; os indicadores consideram todo o
                  histórico.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/agenda?contact=${contact.id}`)}
              >
                <CalendarClock /> Ver agenda
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {appointments.length ? (
                appointments.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    onOpen={() =>
                      router.push(`/agenda?appointment=${appointment.id}`)
                    }
                  />
                ))
              ) : (
                <Empty
                  icon={CalendarClock}
                  text="Ainda não existem marcações vinculadas."
                  action={canOperate ? 'Nova marcação' : undefined}
                  onClick={() => router.push(`/agenda?contact=${contact.id}`)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commercial">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Conversas</CardTitle>
                <CardDescription>
                  Histórico recente do WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {conversations.length ? (
                  conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => router.push(`/inbox?c=${conversation.id}`)}
                      className="border-border hover:bg-muted flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          Conversa {labelFor(conversation.status).toLowerCase()}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {conversation.last_message_text ||
                            'Sem mensagem de texto'}
                        </p>
                      </div>
                      <div className="text-muted-foreground shrink-0 text-right text-xs">
                        {safeDate(conversation.last_message_at, 'dd/MM HH:mm')}
                        {conversation.unread_count > 0 && (
                          <Badge className="ml-2">
                            {conversation.unread_count}
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <Empty
                    icon={MessageCircle}
                    text="Não há conversas no Inbox para este cliente."
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Negócios</CardTitle>
                  <CardDescription>
                    Oportunidades comerciais vinculadas.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  disabled={!canOperate}
                  onClick={() =>
                    router.push(`/pipelines?contact=${contact.id}`)
                  }
                >
                  <Plus /> Criar negócio
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {deals.length ? (
                  deals.map((deal) => (
                    <button
                      key={deal.id}
                      type="button"
                      onClick={() => router.push(`/pipelines?deal=${deal.id}`)}
                      className="border-border hover:bg-muted flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{deal.title}</p>
                        <p className="text-muted-foreground text-xs">
                          {deal.stage?.name || labelFor(deal.status)}
                        </p>
                      </div>
                      <p className="shrink-0 font-medium">
                        {formatCurrency(
                          Number(deal.value ?? 0),
                          deal.currency ?? defaultCurrency
                        )}
                      </p>
                    </button>
                  ))
                ) : (
                  <Empty
                    icon={BriefcaseBusiness}
                    text="Não existem negócios vinculados."
                    action="Ver pipelines"
                    onClick={() => router.push('/pipelines')}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="benefits">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><PackageCheck /> Packs do cliente</CardTitle>
                <CardDescription>Sessoes disponiveis, utilizadas e validade de cada pack.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {clientPacks.length ? clientPacks.map((clientPack) => (
                  <div key={clientPack.id} className="border-border rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{clientPack.pack?.name ?? 'Pack de servicos'}</p><p className="text-muted-foreground mt-1 text-xs">Codigo: {clientPack.code || '—'} {clientPack.expires_at ? `· Valido ate ${safeDate(clientPack.expires_at, 'dd/MM/yyyy')}` : ''}</p></div><Badge variant="outline">{labelFor(clientPack.status)}</Badge></div>
                    <div className="mt-3 grid gap-2">{(clientPack.balances ?? []).map((balance) => <div key={balance.id} className="bg-muted/50 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm"><span className="truncate">{balance.service?.name ?? 'Procedimento'}</span><strong className="shrink-0">{balance.remaining_sessions}/{balance.total_sessions} sessoes</strong></div>)}</div>
                  </div>
                )) : <Empty icon={PackageCheck} text="Este cliente ainda nao possui packs." />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Gift /> Vouchers do cliente</CardTitle>
                <CardDescription>Codigos, saldo ou sessoes e respetiva validade.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {regularVouchers.length ? regularVouchers.map((voucher) => (
                  <div key={voucher.id} className="border-border rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono font-semibold">{voucher.code}</p><p className="text-muted-foreground mt-1 text-xs">{voucher.voucher_type === 'service' ? `${Number(voucher.remaining_uses ?? 0)} sessao disponivel` : `Saldo ${formatCurrency(Number(voucher.current_balance), voucher.currency)}`}{voucher.expires_at ? ` · Valido ate ${safeDate(voucher.expires_at, 'dd/MM/yyyy')}` : ''}</p></div><Badge variant="outline">{labelFor(voucher.status)}</Badge></div></div>
                )) : <Empty icon={Gift} text="Este cliente ainda nao possui vouchers." />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="finance">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>Compras e pagamentos</CardTitle>
                  <CardDescription>
                    Últimas vendas; os totais consideram toda a vida do cliente.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  disabled={!canOperate}
                  onClick={() => router.push(`/finance?contact=${contact.id}`)}
                >
                  <ReceiptText /> Nova venda
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {sales.length ? (
                  sales.map((sale) => (
                    <button
                      key={sale.id}
                      type="button"
                      onClick={() =>
                        router.push(`/finance?tab=sales#sale-${sale.id}`)
                      }
                      className="border-border hover:bg-muted flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            Venda #{sale.sale_number}
                          </p>
                          <Badge variant="secondary">
                            {labelFor(sale.status)}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 truncate text-xs">
                          {sale.items
                            ?.map((item) => item.name_snapshot)
                            .join(', ') || safeDate(sale.created_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold">
                          {formatCurrency(
                            Number(sale.total_amount),
                            sale.currency
                          )}
                        </p>
                        {Number(sale.balance_due) > 0 && (
                          <p className="text-destructive text-xs">
                            Falta{' '}
                            {formatCurrency(
                              Number(sale.balance_due),
                              sale.currency
                            )}
                          </p>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <Empty
                    icon={ReceiptText}
                    text="Este cliente ainda não possui vendas registadas."
                    action="Abrir POS"
                    onClick={() =>
                      router.push(`/finance?contact=${contact.id}`)
                    }
                  />
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <WalletCards /> Cartão-saldo
                    </CardTitle>
                    <CardDescription>
                      Cashback e crédito próprio do cliente.
                    </CardDescription>
                  </div>
                  <Badge variant={walletBalance > 0 ? 'default' : 'outline'}>
                    {formatCurrency(walletBalance, defaultCurrency)}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {wallets.length ? (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {wallets.map((wallet) => (
                          <div
                            key={wallet.id}
                            className="border-border rounded-md border p-3"
                          >
                            <p className="text-muted-foreground text-xs">
                              Saldo em {wallet.currency}
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                              {formatCurrency(
                                Number(wallet.balance),
                                wallet.currency
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-muted-foreground text-xs font-semibold uppercase">
                          Últimos movimentos
                        </p>
                        {walletTransactions.slice(0, 6).map((transaction) => (
                          <div
                            key={transaction.id}
                            className="bg-muted/40 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {transaction.description ||
                                  'Movimento de saldo'}
                              </p>
                              <p className="text-muted-foreground">
                                {safeDate(
                                  transaction.created_at,
                                  'dd/MM HH:mm'
                                )}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'shrink-0 font-semibold',
                                Number(transaction.amount) >= 0
                                  ? 'text-emerald-700'
                                  : 'text-foreground'
                              )}
                            >
                              {Number(transaction.amount) >= 0 ? '+' : ''}
                              {formatCurrency(
                                Number(transaction.amount),
                                wallets.find(
                                  (wallet) =>
                                    wallet.id === transaction.wallet_id
                                )?.currency || defaultCurrency
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Este cliente ainda não possui cartão-saldo.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PackageCheck /> Packs
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {clientPacks.length ? (
                    clientPacks.map((clientPack) => (
                      <div
                        key={clientPack.id}
                        className="border-border rounded-md border p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">
                            {clientPack.pack?.name ?? 'Pack de serviços'}
                          </p>
                          <Badge variant="outline">
                            {labelFor(clientPack.status)}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {clientPack.expires_at
                            ? `Válido até ${safeDate(clientPack.expires_at, 'dd/MM/yyyy')}`
                            : 'Sem data de validade'}
                        </p>
                        {(clientPack.balances ?? []).map((balance) => (
                          <div
                            key={balance.id}
                            className="bg-muted/40 mt-2 rounded px-2.5 py-2 text-xs"
                          >
                            <div className="flex justify-between gap-2">
                              <span className="truncate font-medium">
                                {balance.service?.name ?? 'Procedimento'}
                              </span>
                              <span className="shrink-0 font-semibold">
                                {balance.remaining_sessions}/
                                {balance.total_sessions} disponíveis
                              </span>
                            </div>
                            <p className="text-muted-foreground mt-0.5">
                              {balance.used_sessions} utilizadas
                            </p>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Sem packs adquiridos.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift /> Vouchers
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {regularVouchers.length ? (
                    regularVouchers.map((voucher) => (
                      <div
                        key={voucher.id}
                        className="border-border rounded-md border p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-mono text-sm font-semibold">
                              {voucher.code}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {labelFor(voucher.status)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-medium">
                          Saldo{' '}
                          {formatCurrency(
                            Number(voucher.current_balance),
                            voucher.currency
                          )}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Sem vouchers associados.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="referrals">
          <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HeartHandshake /> Link deste cliente
                </CardTitle>
                <CardDescription>
                  Cada cliente possui um código individual para atribuir as
                  conversões corretamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {referralUrl ? (
                  <>
                    <div className="bg-muted/40 rounded-md border p-3">
                      <p className="text-muted-foreground text-xs">Código</p>
                      <p className="mt-1 font-mono font-semibold">
                        {referralCode}
                      </p>
                      <p className="text-muted-foreground mt-2 text-xs break-all">
                        {referralUrl}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => {
                          void navigator.clipboard.writeText(referralUrl);
                          toast.success('Link de indicação copiado.');
                        }}
                      >
                        <Copy /> Copiar link
                      </Button>
                      <a
                        href={referralUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: 'outline' })}
                      >
                        <ExternalLink /> Abrir página
                      </a>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        router.push(
                          `/inbox?contact=${contact.id}&draft=${encodeURIComponent(`Olá ${contact.name || ''}! Este é o seu link para convidar amigos: ${referralUrl}`)}`
                        )
                      }
                    >
                      <MessageCircle /> Partilhar pelo WhatsApp
                    </Button>
                  </>
                ) : (
                  <div className="bg-muted/40 rounded-md p-4 text-sm">
                    O código ficará disponível depois da migration 055 e da
                    ativação do programa em Configurações.
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <RelationshipMetric
                    label="Indicou"
                    value={
                      clientReferrals.filter(
                        (item) => item.friend?.id !== contactId
                      ).length
                    }
                  />
                  <RelationshipMetric
                    label="Foi indicado"
                    value={
                      clientReferrals.filter(
                        (item) => item.friend?.id === contactId
                      ).length
                    }
                  />
                  <RelationshipMetric
                    label="Convertidos"
                    value={
                      clientReferrals.filter((item) =>
                        ['qualified', 'rewarded'].includes(item.status)
                      ).length
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>Relações de indicação</CardTitle>
                  <CardDescription>
                    Conversão e recompensas geradas por este cliente.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/referrals')}
                >
                  Ver central
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {clientReferrals.length ? (
                  clientReferrals.map((referral) => {
                    const isReferredClient = referral.friend?.id === contactId;
                    const relatedContact = isReferredClient
                      ? referral.referrer
                      : referral.friend;
                    const relatedName = isReferredClient
                      ? referral.referrer?.name || referral.referrer?.phone
                      : referral.friend?.name || referral.friend_name;
                    return (
                      <div
                        key={referral.id}
                        className="border-border rounded-md border p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                              {isReferredClient
                                ? 'Indicado por'
                                : 'Cliente indicado'}
                            </p>
                            {relatedContact?.id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(`/contacts/${relatedContact.id}`)
                                }
                                className="hover:text-primary font-semibold"
                              >
                                {relatedName}
                              </button>
                            ) : (
                              <p className="font-semibold">{relatedName}</p>
                            )}
                            <p className="text-muted-foreground text-xs">
                              {relatedContact?.phone || referral.friend_phone} ·{' '}
                              {safeDate(referral.created_at, 'dd/MM/yyyy')}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {labelFor(referral.status)}
                          </Badge>
                        </div>
                        {(referral.rewards ?? []).length ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {referral.rewards?.map((reward) => (
                              <div
                                key={reward.id}
                                className="bg-muted/50 rounded-md border px-3 py-2 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold">
                                    {reward.beneficiary_type === 'referrer'
                                      ? 'Quem indicou'
                                      : 'Novo cliente'}
                                  </span>
                                  <Badge variant="outline">
                                    {labelFor(reward.status)}
                                  </Badge>
                                </div>
                                <p className="text-muted-foreground mt-1">
                                  {reward.reward_type === 'percentage'
                                    ? `${Number(reward.reward_value)}% de desconto`
                                    : reward.reward_type === 'service'
                                      ? 'Voucher de procedimento'
                                      : reward.beneficiary_type === 'friend' &&
                                          !reward.issued_wallet_id
                                        ? `${formatCurrency(Number(reward.reward_value), defaultCurrency)} de desconto na primeira marcação`
                                        : `${formatCurrency(Number(reward.credited_amount ?? reward.reward_value), defaultCurrency)} creditado · ${formatCurrency(Number(reward.available_amount ?? 0), defaultCurrency)} disponível`}
                                </p>
                                {reward.reward_type === 'fixed_credit' &&
                                reward.status === 'issued' &&
                                !reward.issued_wallet_id ? (
                                  <p className="text-destructive mt-1 font-medium">
                                    Crédito antigo aguardando conciliação
                                  </p>
                                ) : null}
                                {reward.reversal_reason ? (
                                  <p className="text-muted-foreground mt-1">
                                    Anulado: {reward.reversal_reason}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <Empty
                    icon={HeartHandshake}
                    text="Este cliente ainda não indicou amigos."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Linha do tempo unificada</CardTitle>
                <CardDescription>
                  Mensagens, marcações, negócios, ficha e financeiro num
                  histórico auditável.
                </CardDescription>
              </div>
              <select
                value={timelineFilter}
                onChange={(event) => setTimelineFilter(event.target.value)}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                <option value="all">Todos os eventos</option>
                <option value="message">Mensagens</option>
                <option value="appointment">Agenda</option>
                <option value="deal">Comercial</option>
                <option value="campaign">Campanhas</option>
                <option value="task">Tarefas</option>
                <option value="finance">Financeiro</option>
                <option value="referral">Indicações</option>
                <option value="note">Ficha e notas</option>
                <option value="tag">Etiquetas</option>
              </select>
            </CardHeader>
            <CardContent>
              {visibleTimeline.length ? (
                <div className="space-y-0">
                  {visibleTimeline.map((event, index) => (
                    <button
                      key={event.id}
                      type="button"
                      disabled={!event.href}
                      onClick={() => event.href && router.push(event.href)}
                      className="group flex w-full gap-3 text-left disabled:cursor-default"
                    >
                      <div className="flex flex-col items-center">
                        <span
                          className={`mt-1.5 h-2.5 w-2.5 rounded-full ${eventDot(event.tone)}`}
                        />
                        {index < visibleTimeline.length - 1 && (
                          <span className="bg-border my-1 w-px flex-1" />
                        )}
                      </div>
                      <div className="group-enabled:hover:bg-muted min-w-0 flex-1 rounded-md px-2 py-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{event.title}</p>
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {safeDate(event.at, 'dd/MM HH:mm')}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5 truncate text-sm">
                          {event.detail}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={History}
                  text="O histórico deste cliente aparecerá aqui conforme o CRM for usado."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!mergeCandidate}
        onOpenChange={(open) => {
          if (!open && !mergingContact) setMergeCandidate(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Telefone ja usado em outro cliente
            </DialogTitle>
            <DialogDescription>
              O telefone informado pertence a outro cadastro. Para evitar dados
              duplicados, pode abrir o cadastro existente ou juntar este cliente
              ao cadastro que ja possui o numero.
            </DialogDescription>
          </DialogHeader>
          {mergeCandidate ? (
            <div className="bg-muted/40 rounded-md border p-3 text-sm">
              <p className="font-semibold">
                {mergeCandidate.name || mergeCandidate.phone || 'Cliente'}
              </p>
              <p className="text-muted-foreground mt-1">
                Telefone: {mergeCandidate.phone}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                Ao juntar, agenda, Inbox, financeiro, tags, notas, vouchers,
                packs, indicacoes e historico passam para este cadastro. Campos
                vazios no destino sao preenchidos com dados deste cliente.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMergeCandidate(null)}
              disabled={mergingContact}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (mergeCandidate)
                  router.push(`/contacts/${mergeCandidate.id}`);
              }}
              disabled={!mergeCandidate || mergingContact}
            >
              Abrir existente
            </Button>
            <Button
              onClick={() => void mergeIntoExistingContact()}
              disabled={!mergeCandidate || mergingContact || !canOperate}
            >
              {mergingContact ? (
                <RefreshCw className="animate-spin" />
              ) : (
                <UserRound />
              )}
              Juntar cadastros
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createConversationOpen}
        onOpenChange={setCreateConversationOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Iniciar conversa no Inbox?</DialogTitle>
            <DialogDescription>
              Este cliente ainda não possui uma conversa. O CRM criará um
              atendimento associado a {contact.name || contact.phone} e abrirá o
              Inbox para enviar a primeira mensagem.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/40 rounded-md border p-3 text-sm">
            <p className="font-medium">{contact.name || 'Cliente sem nome'}</p>
            <p className="text-muted-foreground mt-0.5">
              {contact.phone || 'Sem telefone registado'}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateConversationOpen(false)}
              disabled={creatingConversation}
            >
              Cancelar
            </Button>
            <Button
              onClick={createConversation}
              disabled={creatingConversation || !contact.phone || !canOperate}
            >
              {creatingConversation ? (
                <RefreshCw className="animate-spin" />
              ) : (
                <MessageCircle />
              )}
              Criar e abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'number' | 'date';
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {required ? <span className="text-destructive"> *</span> : null}
      <Input
        type={type}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function CustomFieldEditor({
  field,
  value,
  disabled,
  onChange,
}: {
  field: CustomField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const configuredOptions = field.field_options?.options;
  const options = Array.isArray(configuredOptions)
    ? configuredOptions.map(String)
    : [];

  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {field.field_name}
      {field.field_type === 'select' && options.length ? (
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm disabled:opacity-50"
        >
          <option value="">Sem valor</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.field_type === 'textarea' ? (
        <Textarea
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.field_type === 'boolean' ? (
        <span className="border-input flex h-9 items-center gap-2 rounded-md border px-3 font-normal">
          <input
            type="checkbox"
            checked={value === 'true'}
            disabled={disabled}
            onChange={(event) => onChange(String(event.target.checked))}
          />
          {value === 'true' ? 'Sim' : 'Não'}
        </span>
      ) : (
        <Input
          type={
            field.field_type === 'number'
              ? 'number'
              : field.field_type === 'date'
                ? 'date'
                : 'text'
          }
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card size="sm" className="gap-2">
      <CardContent className="p-3">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>{label}</span>
          <Icon className="h-4 w-4" />
        </div>
        <p className="mt-2 text-lg font-semibold">{value}</p>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}

function RelationshipMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-muted/40 min-w-0 rounded-md border px-3 py-2.5">
      <p className="text-muted-foreground truncate text-[11px]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold" title={String(value)}>
        {value}
      </p>
    </div>
  );
}

function AppointmentRow({
  appointment,
  onOpen,
}: {
  appointment: Appointment;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="border-border hover:bg-muted flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">
            {appointment.service?.name ?? 'Procedimento'}
          </p>
          <Badge variant="secondary">{labelFor(appointment.status)}</Badge>
          {appointment.referral_id ? (
            <Badge className="bg-emerald-600 text-white">
              <HeartHandshake /> Indicação · -
              {formatCurrency(
                Number(appointment.referral_discount_amount ?? 0),
                appointment.currency
              )}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {safeDate(appointment.scheduled_start)} ·{' '}
          {appointment.professional?.full_name ||
            appointment.professional?.email ||
            'Sem profissional'}
          {appointment.room?.name ? ` · ${appointment.room.name}` : ''}
        </p>
        <p className="mt-1 text-xs font-medium">
          {appointment.original_price && appointment.referral_id ? (
            <>
              <span className="text-muted-foreground line-through">
                {formatCurrency(
                  Number(appointment.original_price),
                  appointment.currency
                )}
              </span>{' '}
              <span className="text-emerald-700">
                {formatCurrency(
                  Number(appointment.price),
                  appointment.currency
                )}
              </span>
            </>
          ) : (
            formatCurrency(Number(appointment.price), appointment.currency)
          )}
        </p>
      </div>
      <ArrowUpRight className="text-muted-foreground h-4 w-4 shrink-0" />
    </button>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-2">
      <Icon className="text-muted-foreground mt-0.5 h-4 w-4" />
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate font-medium">{value}</p>
      </div>
    </div>
  );
}

function Empty({
  icon: Icon,
  text,
  action,
  onClick,
}: {
  icon: typeof CalendarClock;
  text: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="bg-muted/40 flex min-h-32 flex-col items-center justify-center rounded-lg p-5 text-center">
      <Icon className="text-muted-foreground h-5 w-5" />
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">{text}</p>
      {action && onClick && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onClick}>
          {action}
        </Button>
      )}
    </div>
  );
}
