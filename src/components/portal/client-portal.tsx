'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeEuro,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Copy,
  Download,
  FileCheck2,
  FileClock,
  Clock3,
  Gift,
  Home,
  ImagePlus,
  LifeBuoy,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  PackageCheck,
  Pencil,
  ReceiptText,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  UserRound,
  WalletCards,
  Megaphone,
  Moon,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';

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
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/currency';
import { downloadReceiptPdf } from '@/lib/finance/receipt-pdf';
import { cn } from '@/lib/utils';
import { PortalSupport } from '@/components/portal/portal-support';
import { PortalNotifications } from '@/components/portal/portal-notifications';
import { PortalHelp } from '@/components/portal/portal-help';
import { PortalHelpLauncher } from '@/components/portal/portal-help-launcher';
import { PushNotifications } from '@/components/notifications/push-notifications';

type PortalTab =
  | 'home'
  | 'appointments'
  | 'anamnesis'
  | 'benefits'
  | 'campaigns'
  | 'referrals'
  | 'finance'
  | 'support'
  | 'notifications'
  | 'help'
  | 'profile';

type PublicPortal = {
  slug: string;
  business: { name: string; logo_url: string | null; default_currency: string };
  welcomeTitle: string;
  welcomeMessage: string | null;
  features: {
    booking: boolean;
    benefits: boolean;
    financial: boolean;
    profile: boolean;
    referrals: boolean;
    whatsappRecovery: boolean;
  };
};

type PortalData = {
  settings: {
    slug: string;
    welcomeTitle: string;
    welcomeMessage: string | null;
    bookingEnabled: boolean;
    benefitsEnabled: boolean;
    financialEnabled: boolean;
    profileEditEnabled: boolean;
    requiresPasswordChange: boolean;
    referralsEnabled: boolean;
    cancellationHours: number;
    bookingAdvanceDays: number;
    anamnesisPublicSlug: string | null;
  };
  business: {
    name: string;
    logo_url: string | null;
    default_currency: string;
    timezone: string;
    public_url: string | null;
  };
  client: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string;
    company: string | null;
    avatar_url: string | null;
    client_reference: string | null;
    birth_date: string | null;
    tax_id: string | null;
    gender: string | null;
    address_line: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    source: string | null;
    preferred_contact: string | null;
    marketing_consent: boolean;
    marketing_whatsapp_consent: boolean;
    whatsapp_consent: boolean;
    privacy_review_status: 'current' | 'legacy_unverified' | 'withdrawn';
    consent_reviewed_at: string | null;
    consent_review_source: string | null;
    created_at: string;
    updated_at: string;
  };
  appointments: Array<{
    id: string;
    scheduled_start: string;
    scheduled_end: string;
    status: string;
    source: string;
    price: number;
    currency: string;
    confirmation_status: string | null;
    paid_at: string | null;
    service: Relation<{ id: string; name: string; duration_minutes: number }>;
    professional: Relation<{
      id: string;
      full_name: string;
      professional_title: string | null;
    }>;
    benefits: Array<{
      id: string;
      benefit_type: string;
      status: string;
      reserved_amount: number;
      reserved_sessions: number;
      voucher_id: string | null;
      client_pack_id: string | null;
    }>;
  }>;
  anamnesis: Array<{
    id: string;
    status: 'pending' | 'submitted' | 'reviewed' | 'expired' | 'revoked';
    public_token: string;
    selected_modalities: string[];
    answers: Record<string, unknown>;
    signature_name: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    created_at: string;
    service?: { name?: string | null; category?: string | null } | null;
    appointment?: { scheduled_start?: string | null } | null;
  }>;
  catalog: {
    services: Array<{
      id: string;
      name: string;
      description: string | null;
      duration_minutes: number;
      price: number;
      currency: string;
      color: string;
    }>;
    professionals: Array<{
      id: string;
      full_name: string;
      professional_title: string | null;
      professional_bio: string | null;
      professional_color: string | null;
      working_hours: Record<string, unknown> | null;
    }>;
  };
  availability: {
    busy: Array<{
      professional_profile_id: string;
      scheduled_start: string;
      scheduled_end: string;
    }>;
    blocks: Array<{
      professional_profile_id: string | null;
      starts_at: string;
      ends_at: string;
    }>;
  };
  benefits: {
    vouchers: Array<{
      id: string;
      code: string;
      pin_code: string | null;
      voucher_type: string;
      initial_balance: number;
      current_balance: number;
      currency: string;
      status: string;
      remaining_uses: number | null;
      expires_at: string | null;
      created_at: string;
      service: Relation<{ id: string; name: string }>;
    }>;
    packs: Array<{
      id: string;
      code: string;
      pin_code: string | null;
      status: string;
      purchased_at: string;
      expires_at: string | null;
      pack: Relation<{ id: string; name: string }>;
      balances: Array<{
        id: string;
        total_sessions: number;
        used_sessions: number;
        remaining_sessions: number;
        service: Relation<{ id: string; name: string }>;
      }>;
    }>;
    wallet: {
      id: string;
      currency: string;
      balance: number;
      created_at: string;
      updated_at: string;
    } | null;
    logs: Array<{
      id: string;
      voucher_id: string | null;
      client_pack_id: string | null;
      appointment_id: string | null;
      action: string;
      amount: number;
      sessions: number;
      performed_by_name: string | null;
      approved_by_name: string | null;
      notes: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
    }>;
    walletTransactions: Array<{
      id: string;
      transaction_type: string;
      amount: number;
      balance_after: number;
      referral_reward_id: string | null;
      sale_id: string | null;
      description: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
    }>;
  };
  finance: {
    sales: Array<{
      id: string;
      sale_number: number;
      status: string;
      currency: string;
      subtotal: number;
      discount_amount: number;
      tax_amount: number;
      total_amount: number;
      paid_amount: number;
      balance_due: number;
      completed_at: string | null;
      created_at: string;
      items: Array<{
        id: string;
        name_snapshot: string;
        quantity: number;
        unit_price: number;
        discount_amount: number;
        tax_rate: number;
        tax_amount: number;
        line_total: number;
      }>;
      payments: Array<{
        id: string;
        method: string;
        status: string;
        amount: number;
        reference_code: string | null;
        paid_at: string;
      }>;
    }>;
    paymentLinks: Array<{
      id: string;
      sale_id: string | null;
      status: string;
      amount: number;
      currency: string;
      description: string | null;
      payment_url: string | null;
      provider: string;
      paid_at: string | null;
      created_at: string;
    }>;
    invoiceRequests: Array<{
      id: string;
      sale_id: string;
      status: 'pending' | 'processing' | 'issued' | 'rejected' | 'cancelled';
      fiscal_name: string;
      tax_id: string;
      email: string;
      address_line: string | null;
      postal_code: string | null;
      city: string | null;
      country: string;
      client_notes: string | null;
      invoice_number: string | null;
      invoice_document_url: string | null;
      admin_notes: string | null;
      has_document: boolean;
      requested_at: string;
      processing_at: string | null;
      completed_at: string | null;
    }>;
  };
  referrals: {
    program: null | {
      headline: string;
      description: string;
      terms: string | null;
      qualification_event: string;
      referrer_reward_type: string;
      referrer_reward_value: number;
      friend_reward_type: string;
      friend_reward_value: number;
      reward_validity_days: number;
      require_consent: boolean;
      campaign_ends_at: string | null;
      public_privacy_text: string | null;
    };
    code: null | {
      id: string;
      code: string;
      is_active: boolean;
      created_at: string;
    };
    items: Array<{
      id: string;
      friend_name: string;
      friend_phone: string;
      friend_email: string | null;
      status: string;
      registered_at: string | null;
      contacted_at: string | null;
      scheduled_at: string | null;
      qualified_at: string | null;
      rewarded_at: string | null;
      rejected_at: string | null;
      rejection_reason: string | null;
      lost_at: string | null;
      lost_reason: string | null;
      created_at: string;
      rewards: Array<{
        id: string;
        beneficiary_type: string;
        reward_type: string;
        reward_value: number;
        status: string;
        reward_code: string;
        expires_at: string | null;
        issued_at: string | null;
        redeemed_at: string | null;
        credited_amount: number | null;
        available_amount: number | null;
        reversed_amount: number | null;
      }>;
      events: Array<{
        id: string;
        action: string;
        reason: string | null;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
    }>;
  };
  campaigns: Array<{
    id: string;
    title: string;
    summary: string;
    description: string;
    commerce_enabled?: boolean;
    commerce_price?: number | null;
    commerce_currency?: string | null;
    image_url: string | null;
    badge_text: string | null;
    benefit_text: string | null;
    terms: string | null;
    starts_at: string;
    ends_at: string | null;
    capacity: number | null;
    enrollmentCount: number;
    enrollment: null | { status: string; joined_at: string; sale_id?: string | null };
  }>;
  privacy: {
    policyVersion: string;
    policyUrl: string;
    controllerName: string | null;
    controllerEmail: string | null;
    noticeAccepted: boolean;
  };
};

type Relation<T> = T | T[] | null;

function one<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function packIsAvailable(pack: PortalData['benefits']['packs'][number]) {
  if (pack.status !== 'active') return false;
  if (pack.expires_at && new Date(pack.expires_at).getTime() <= Date.now())
    return false;
  return (pack.balances ?? []).some(
    (balance) => Number(balance.remaining_sessions) > 0
  );
}

const STATUS: Record<string, string> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  no_show: 'Falta',
  paid: 'Pago',
  partially_paid: 'Pagamento parcial',
  open: 'Em aberto',
  refunded: 'Reembolsado',
  active: 'Ativo',
  used: 'Utilizado',
  expired: 'Expirado',
  invited: 'Convidado',
  registered: 'Registado',
  contacted: 'Contactado',
  qualified: 'Qualificado',
  rewarded: 'Recompensado',
  rejected: 'Não qualificado',
  issued: 'Emitida',
  redeemed: 'Utilizada',
  pending: 'Pendente',
};

export function ClientPortal({ slug }: { slug: string }) {
  const [publicPortal, setPublicPortal] = useState<PublicPortal | null>(null);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordSent, setPasswordSent] = useState(false);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const [tab, setTab] = useState<PortalTab>('home');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [supportRequestKey, setSupportRequestKey] = useState(0);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingBenefitCode, setBookingBenefitCode] = useState('');
  const [bookingBenefitPin, setBookingBenefitPin] = useState('');
  const [bookingServiceId, setBookingServiceId] = useState('');
  const [bookingProfessionalId, setBookingProfessionalId] = useState('');
  const [guestBookingOpen, setGuestBookingOpen] = useState(false);
  const [guestBookingServiceId, setGuestBookingServiceId] = useState('');
  const [guestBookingProfessionalId, setGuestBookingProfessionalId] = useState('');
  const [privacyUnderstood, setPrivacyUnderstood] = useState(false);
  const [savingPrivacyNotice, setSavingPrivacyNotice] = useState(false);
  const [portalTheme, setPortalTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const root = document.documentElement;
    const previousDark = root.classList.contains('dark');
    const previousColorScheme = root.style.colorScheme;
    root.classList.toggle('dark', portalTheme === 'dark');
    root.style.colorScheme = portalTheme;
    return () => {
      root.classList.toggle('dark', previousDark);
      root.style.colorScheme = previousColorScheme;
    };
  }, [portalTheme]);

  const loadPortal = useCallback(async () => {
    if (!slug.trim()) {
      throw new Error('O Portal do Cliente ainda não está configurado.');
    }
    const publicResponse = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/public`,
      { cache: 'no-store' }
    );
    // The hosting provider may temporarily return an HTML error page. Keep
    // that implementation detail out of the client-facing error message.
    const publicPayload = await publicResponse.json().catch(() => ({}));
    if (!publicResponse.ok)
      throw new Error(publicPayload.error || 'Portal indisponível.');
    setPublicPortal(publicPayload as PublicPortal);

    const dataResponse = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/data`,
      { cache: 'no-store' }
    );
    if ([401, 403].includes(dataResponse.status)) {
      setData(null);
      return;
    }
    const dataPayload = await dataResponse.json().catch(() => ({}));
    if (!dataResponse.ok)
      throw new Error(
        dataPayload.error || 'Não foi possível carregar o portal.'
      );
    setData(dataPayload as PortalData);
    const notificationsResponse = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/notifications`,
      { cache: 'no-store' }
    );
    if (notificationsResponse.ok) {
      const notificationsPayload = await notificationsResponse.json();
      setUnreadNotifications(
        (notificationsPayload.notifications ?? []).filter(
          (item: { read_at: string | null }) => !item.read_at
        ).length
      );
    }
  }, [slug]);

  useEffect(() => {
    if (!data) return;
    const refreshUnread = async () => {
      const response = await fetch(
        `/api/portal/${encodeURIComponent(slug)}/notifications`,
        { cache: 'no-store' }
      );
      if (!response.ok) return;
      const payload = await response.json();
      setUnreadNotifications(
        (payload.notifications ?? []).filter(
          (item: { read_at: string | null }) => !item.read_at
        ).length
      );
    };
    const timer = window.setInterval(() => void refreshUnread(), 30_000);
    return () => window.clearInterval(timer);
  }, [data, slug]);

  useEffect(() => {
    async function bootstrapPortal() {
      if (!slug.trim()) return;
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('portal_token');
      if (tokenHash) {
        const response = await fetch(
          `/api/portal/${encodeURIComponent(slug)}/session`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenHash }),
          }
        );
        const payload = await response.json().catch(() => ({}));
        window.history.replaceState({}, '', window.location.pathname);
        if (!response.ok) {
          throw new Error(payload.error || 'Não foi possível validar o link.');
        }
        params.delete('portal_token');
        setPasswordChangeRequired(payload.requiresPasswordChange === true);
        toast.success('Acesso confirmado. Bem-vindo ao Portal 360.');
      }
      await loadPortal();
      if (params.get('tab') === 'finance') {
        setTab('finance');
        params.delete('tab');
        const search = params.toString();
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${search ? `?${search}` : ''}`
        );
      }
      if (params.get('book') === '1') {
        const serviceId = params.get('service') || '';
        const professionalId = params.get('professional') || '';
        setBookingServiceId(serviceId);
        setBookingProfessionalId(professionalId);
        setGuestBookingServiceId(serviceId);
        setGuestBookingProfessionalId(professionalId);
        setBookingOpen(true);
        setGuestBookingOpen(true);
        params.delete('book');
        const search = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
      }
    }

    bootstrapPortal()
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : 'Portal indisponível.'
        )
      )
      .finally(() => {
        setLoading(false);
        setClaiming(false);
      });
  }, [loadPortal, slug]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setClaiming(true);
    const response = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/session`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setClaiming(false);
      if (payload.code === 'PORTAL_SETUP_REQUIRED') {
        toast.info('Vamos preparar o seu acesso exclusivo ao Portal 360.');
        await requestPassword();
        return;
      }
      return toast.error(payload.error || 'Email ou palavra-passe incorretos.');
    }
    setPasswordChangeRequired(payload.requiresPasswordChange === true);
    try {
      await loadPortal();
    } catch (loadError) {
      toast.error(
        loadError instanceof Error
          ? loadError.message
          : 'Não foi possível abrir o portal.'
      );
    } finally {
      setClaiming(false);
    }
  }

  async function requestPassword(delivery: 'email' | 'whatsapp' = 'email') {
    if (!email.trim()) return toast.error('Informe primeiro o seu email.');
    setClaiming(true);
    const response = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/password`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), delivery }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    setClaiming(false);
    if (!response.ok)
      return toast.error(payload.error || 'Não foi possível enviar a senha.');
    setPasswordSent(true);
    toast.success(payload.message || 'Consulte o seu email.');
  }

  async function signOut() {
    await fetch(`/api/portal/${encodeURIComponent(slug)}/session`, {
      method: 'DELETE',
    });
    setData(null);
    setPassword('');
    setPasswordSent(false);
  }

  async function refreshData() {
    const response = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/data`,
      { cache: 'no-store' }
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    setData(payload as PortalData);
  }

  if (loading) return <PortalLoading />;
  if (!publicPortal) return <PortalUnavailable />;
  if (!data) {
    return (
      <>
        <PortalLogin
          portal={publicPortal}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          passwordSent={passwordSent}
          loading={claiming}
          onSubmit={signIn}
          onRequestPassword={requestPassword}
          onGuestBooking={() => setGuestBookingOpen(true)}
        />
        <GuestBookingDialog
          open={guestBookingOpen}
          onOpenChange={setGuestBookingOpen}
          slug={slug}
          businessName={publicPortal.business.name}
          preferredServiceId={guestBookingServiceId}
          preferredProfessionalId={guestBookingProfessionalId}
        />
        <PortalPasswordChangeDialog
          open={passwordChangeRequired}
          slug={slug}
          onChanged={async () => {
            setPasswordChangeRequired(false);
            await loadPortal();
          }}
        />
      </>
    );
  }

  const upcoming = data.appointments
    .filter(
      (item) =>
        new Date(item.scheduled_start) >= new Date() &&
        !['cancelled', 'no_show'].includes(item.status)
    )
    .sort(
      (a, b) => +new Date(a.scheduled_start) - +new Date(b.scheduled_start)
    );
  const walletBalance = Number(data.benefits.wallet?.balance ?? 0);
  const voucherBalance = data.benefits.vouchers
    .filter((item) => item.status === 'active')
    .reduce((sum, item) => sum + Number(item.current_balance), 0);
  const packSessions = data.benefits.packs
    .filter(packIsAvailable)
    .flatMap((item) => item.balances ?? [])
    .reduce((sum, item) => sum + Number(item.remaining_sessions), 0);

  function openBooking(benefitCode = '', serviceId = '', benefitPin = '') {
    setBookingBenefitCode(benefitCode);
    setBookingBenefitPin(benefitPin);
    setBookingServiceId(serviceId);
    setBookingOpen(true);
  }

  async function acknowledgePrivacyNotice() {
    if (!privacyUnderstood) return;
    setSavingPrivacyNotice(true);
    const response = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/privacy-notice`,
      { method: 'POST' }
    );
    const payload = await response.json().catch(() => ({}));
    setSavingPrivacyNotice(false);
    if (!response.ok) {
      toast.error(
        payload.error || 'Não foi possível registar a confirmação.'
      );
      return;
    }
    setData((current) =>
      current
        ? {
            ...current,
            privacy: { ...current.privacy, noticeAccepted: true },
          }
        : current
    );
    toast.success('Informação de privacidade confirmada.');
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9] pb-20 text-[#17191c] [--background:#ffffff] [--border:#dde1e7] [--card:#ffffff] [--foreground:#17191c] [--input:#d0d5dd] [--muted-foreground:#667085] [--muted:#f1f3f5] [--popover-foreground:#17191c] [--popover:#ffffff] lg:pb-0">
      <Dialog open={!data.privacy.noticeAccepted}>
        <DialogContent
          className="overflow-hidden border-0 p-0 sm:max-w-xl"
          showCloseButton={false}
        >
          <div className="bg-gradient-to-br from-violet-700 via-purple-700 to-indigo-800 px-6 py-7 text-white">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <ShieldCheck className="size-6" />
            </div>
            <DialogTitle className="text-2xl text-white">
              A sua privacidade, sem letras pequenas
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-violet-100">
              Antes de entrar, queremos explicar de forma clara como a{' '}
              {data.privacy.controllerName || data.business.name} protege e
              utiliza os seus dados.
            </DialogDescription>
          </div>
          <div className="space-y-4 px-6 py-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Só o necessário', 'Usamos os dados para gerir os seus serviços.'],
                ['Sob o seu controlo', 'Pode consultar, corrigir ou pedir a eliminação.'],
                ['Marketing opcional', 'As campanhas dependem da sua escolha.'],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-xl border bg-slate-50 p-3">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">{detail}</p>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-xs leading-5">
              Esta confirmação apenas regista que recebeu a informação de
              privacidade, versão {data.privacy.policyVersion}. Não ativa
              marketing nem substitui consentimentos específicos.
            </p>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-violet-700"
                checked={privacyUnderstood}
                onChange={(event) => setPrivacyUnderstood(event.target.checked)}
              />
              <span>Li e compreendi a informação sobre o tratamento dos meus dados.</span>
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" render={<a href={data.privacy.policyUrl} target="_blank" rel="noreferrer" />}>
                <BookOpen /> Ler política completa
              </Button>
              <Button
                disabled={!privacyUnderstood || savingPrivacyNotice}
                onClick={() => void acknowledgePrivacyNotice()}
              >
                {savingPrivacyNotice ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                Confirmar e entrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <aside className="border-border bg-background fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r lg:flex">
        <div className="border-border flex h-20 items-center border-b px-5">
          <Brand business={data.business} />
        </div>
        <div className="px-4 py-5">
          <div className="flex items-center gap-3">
            {data.client.avatar_url ? (
              <img
                src={data.client.avatar_url}
                alt=""
                className="size-11 rounded-full object-cover"
              />
            ) : (
              <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-full font-semibold">
                {(data.client.name || 'C').slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {data.client.name || 'Cliente'}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {data.client.client_reference
                  ? `Cliente ${data.client.client_reference}`
                  : data.client.email}
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3">
          <PortalNav tab={tab} setTab={setTab} features={data.settings} />
        </nav>
        <div className="border-border space-y-3 border-t p-4">
          <div className="bg-muted/60 flex items-start gap-2.5 rounded-md p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <p className="text-muted-foreground text-[11px] leading-4">
              Área privada e protegida. Os seus dados permanecem ligados à sua
              ficha de cliente.
            </p>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => void signOut()}
          >
            <LogOut /> Terminar sessão
          </Button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="border-border bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 md:px-7">
            <div className="lg:hidden">
              <Brand business={data.business} />
            </div>
            <div className="hidden lg:block">
              <p className="text-muted-foreground text-xs">Portal 360</p>
              <p className="text-sm font-semibold">{portalTabLabel(tab)}</p>
            </div>
            <div className="ml-auto hidden items-center gap-2 sm:flex">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setPortalTheme((current) =>
                    current === 'dark' ? 'light' : 'dark'
                  )
                }
                title={
                  portalTheme === 'dark'
                    ? 'Usar tema claro'
                    : 'Usar tema escuro'
                }
              >
                {portalTheme === 'dark' ? <Sun /> : <Moon />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => setTab('notifications')}
                title="Notificações"
              >
                <Bell />
                {unreadNotifications > 0 && (
                  <span className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </Button>
              <span className="border-border bg-background flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
                <LockKeyhole className="size-3.5 text-emerald-600" /> Sessão
                segura
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setPortalTheme((current) =>
                  current === 'dark' ? 'light' : 'dark'
                )
              }
              title={
                portalTheme === 'dark'
                  ? 'Usar tema claro'
                  : 'Usar tema escuro'
              }
              className="sm:hidden"
            >
              {portalTheme === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void signOut()}
              title="Sair"
              className="lg:hidden"
            >
              <LogOut />
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-7 md:py-8">
          {tab === 'home' && (
            <HomeView
              data={data}
              upcoming={upcoming}
              walletBalance={walletBalance}
              voucherBalance={voucherBalance}
              packSessions={packSessions}
              onBook={() => openBooking()}
              onNavigate={setTab}
            />
          )}
          {tab === 'appointments' && (
            <AppointmentsView
              data={data}
              onBook={() => openBooking()}
              onRefresh={refreshData}
            />
          )}
          {tab === 'anamnesis' && <AnamnesisView data={data} />}
          {tab === 'benefits' && (
            <BenefitsView
              data={data}
              walletBalance={walletBalance}
              voucherBalance={voucherBalance}
              packSessions={packSessions}
              onUse={openBooking}
            />
          )}
          {tab === 'referrals' && (
            <ReferralsView data={data} onRefresh={refreshData} />
          )}
          {tab === 'campaigns' && (
            <CampaignsView data={data} onRefresh={refreshData} />
          )}
          {tab === 'finance' && (
            <FinanceView data={data} onRefresh={refreshData} />
          )}
          {tab === 'profile' && (
            <ProfileView data={data} onRefresh={refreshData} />
          )}
          {tab === 'support' && (
            <PortalSupport
              key={supportRequestKey}
              slug={slug}
              createInitially={supportRequestKey > 0}
            />
          )}
          {tab === 'notifications' && (
            <PortalNotifications
              slug={slug}
              onNavigate={(next) => setTab(next as PortalTab)}
              onUnreadChange={setUnreadNotifications}
            />
          )}
          {tab === 'help' && <PortalHelp />}
        </main>
      </div>

      <nav className="border-border bg-background fixed right-0 bottom-0 left-0 z-30 flex overflow-x-auto border-t lg:hidden">
        <MobileNav
          icon={Home}
          label="Início"
          active={tab === 'home'}
          onClick={() => setTab('home')}
        />
        <MobileNav
          icon={CalendarDays}
          label="Agenda"
          active={tab === 'appointments'}
          onClick={() => setTab('appointments')}
        />
        <MobileNav
          icon={ClipboardList}
          label="Anamnese"
          active={tab === 'anamnesis'}
          onClick={() => setTab('anamnesis')}
        />
        {data.settings.benefitsEnabled && (
          <MobileNav
            icon={Gift}
            label="Benefícios"
            active={tab === 'benefits'}
            onClick={() => setTab('benefits')}
          />
        )}
        {data.settings.referralsEnabled && (
          <MobileNav
            icon={Share2}
            label="Indicar"
            active={tab === 'referrals'}
            onClick={() => setTab('referrals')}
          />
        )}
        <MobileNav
          icon={Megaphone}
          label="Campanhas"
          active={tab === 'campaigns'}
          onClick={() => setTab('campaigns')}
        />
        {data.settings.financialEnabled && (
          <MobileNav
            icon={ReceiptText}
            label="Financeiro"
            active={tab === 'finance'}
            onClick={() => setTab('finance')}
          />
        )}
        <MobileNav
          icon={Bell}
          label={
            unreadNotifications ? `Avisos (${unreadNotifications})` : 'Avisos'
          }
          active={tab === 'notifications'}
          onClick={() => setTab('notifications')}
        />
        <MobileNav
          icon={BookOpen}
          label="Ajuda"
          active={tab === 'help'}
          onClick={() => setTab('help')}
        />
        <MobileNav
          icon={LifeBuoy}
          label="Suporte"
          active={tab === 'support'}
          onClick={() => setTab('support')}
        />
        <MobileNav
          icon={UserRound}
          label="Perfil"
          active={tab === 'profile'}
          onClick={() => setTab('profile')}
        />
      </nav>

      <BookingDialog
        key={bookingBenefitCode || 'standard-booking'}
        open={bookingOpen}
        onOpenChange={(nextOpen) => {
          setBookingOpen(nextOpen);
          if (!nextOpen) {
            setBookingBenefitCode('');
            setBookingBenefitPin('');
            setBookingServiceId('');
          }
        }}
        data={data}
        slug={slug}
        preferredBenefitCode={bookingBenefitCode}
        preferredBenefitPin={bookingBenefitPin}
        preferredServiceId={bookingServiceId}
        preferredProfessionalId={bookingProfessionalId}
        onCreated={refreshData}
      />
      <PortalPasswordChangeDialog
        open={passwordChangeRequired || data.settings.requiresPasswordChange}
        slug={slug}
        onChanged={async () => {
          setPasswordChangeRequired(false);
          await refreshData();
        }}
      />
      <PortalHelpLauncher
        onLearn={() => setTab('help')}
        onContact={() => {
          setSupportRequestKey((value) => value + 1);
          setTab('support');
        }}
      />
      <PushNotifications
        endpoint={`/api/portal/${encodeURIComponent(slug)}/push`}
      />
    </div>
  );
}

function PortalLogin({
  portal,
  email,
  setEmail,
  password,
  setPassword,
  passwordSent,
  loading,
  onSubmit,
  onRequestPassword,
  onGuestBooking,
}: {
  portal: PublicPortal;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  passwordSent: boolean;
  loading: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onRequestPassword: (delivery?: 'email' | 'whatsapp') => void;
  onGuestBooking: () => void;
}) {
  return (
    <main className="grid min-h-screen bg-[#f6f7f9] text-[#17191c] [--background:#ffffff] [--border:#dde1e7] [--card:#ffffff] [--foreground:#17191c] [--input:#d0d5dd] [--muted-foreground:#667085] [--muted:#f1f3f5] [--popover-foreground:#17191c] [--popover:#ffffff] lg:grid-cols-[minmax(340px,0.82fr)_minmax(520px,1.18fr)]">
      <section className="hidden min-h-screen flex-col justify-between bg-[#16251c] p-10 text-white lg:flex xl:p-14">
        <Brand business={portal.business} inverse />
        <div className="max-w-md">
          <span className="bg-background/10 flex size-12 items-center justify-center rounded-md">
            <Sparkles className="size-5" />
          </span>
          <h1 className="mt-6 text-4xl leading-tight font-semibold">
            {portal.welcomeTitle}
          </h1>
          <p className="text-background/70 mt-4 text-base leading-7">
            {portal.welcomeMessage ||
              'As suas marcações, benefícios, indicações e documentos num único espaço.'}
          </p>
          <div className="mt-10 grid gap-4 text-sm">
            <LoginFeature
              icon={CalendarCheck}
              text="Marque e acompanhe as suas sessões"
            />
            <LoginFeature
              icon={WalletCards}
              text="Consulte saldo, vouchers e packs"
            />
            <LoginFeature
              icon={ReceiptText}
              text="Descarregue recibos e faturas privadas"
            />
          </div>
        </div>
        <p className="text-background/50 text-xs">
          Portal privado do cliente · Ligação protegida
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <Brand business={portal.business} />
          </div>
          <div className="flex size-11 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <KeyRound className="size-5" />
          </div>
          <h2 className="mt-5 text-3xl font-semibold">
            Bem-vindo ao Portal 360
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Entre com o email da sua ficha de cliente e a sua palavra-passe.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="portal-email">Email</Label>
              <Input
                id="portal-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@exemplo.pt"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-password">Palavra-passe</Label>
              <Input
                id="portal-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="A sua palavra-passe"
              />
            </div>
            {passwordSent && (
              <div className="flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <Check className="mt-0.5 size-4 shrink-0" />
                Se o email estiver registado, enviámos um link de entrada direta
                e uma palavra-passe temporária pelo meio escolhido.
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
              Entrar no portal
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={loading}
              onClick={() => onRequestPassword('email')}
            >
              <Send /> Recuperar acesso por email
            </Button>
            {portal.features.whatsappRecovery ? (
              <Button
                type="button"
                variant="link"
                className="w-full"
                disabled={loading}
                onClick={() => onRequestPassword('whatsapp')}
              >
                Receber pelo WhatsApp
              </Button>
            ) : null}
            {portal.features.booking ? (
              <div className="border-border mt-5 border-t pt-5">
                <p className="text-muted-foreground mb-3 text-center text-sm">
                  Ainda não é cliente?
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={onGuestBooking}
                >
                  <CalendarDays /> Agendar como convidado
                </Button>
              </div>
            ) : null}
          </form>
          <div className="border-border mt-8 flex items-start gap-3 border-t pt-5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <p className="text-muted-foreground text-xs leading-5">
              O acesso só é enviado para o email ou WhatsApp confirmado na sua
              ficha. O link é pessoal, de utilização única, e a equipa nunca
              solicitará estes dados.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

type GuestCatalog = {
  services: Array<{
    id: string;
    name: string;
    duration_minutes: number;
    price: number;
    currency: string;
  }>;
  professionals: Array<{
    id: string;
    full_name: string | null;
    professional_title: string | null;
  }>;
  bookingAdvanceDays: number;
};

function GuestBookingDialog({
  open,
  onOpenChange,
  slug,
  businessName,
  preferredServiceId,
  preferredProfessionalId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  businessName: string;
  preferredServiceId: string;
  preferredProfessionalId: string;
}) {
  const [catalog, setCatalog] = useState<GuestCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!open || catalog) return;
    setLoading(true);
    fetch(`/api/portal/${encodeURIComponent(slug)}/guest-booking`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setCatalog(payload as GuestCatalog);
        setServiceId(payload.services?.some((service: { id: string }) => service.id === preferredServiceId) ? preferredServiceId : payload.services?.[0]?.id || '');
        setProfessionalId(payload.professionals?.some((professional: { id: string }) => professional.id === preferredProfessionalId) ? preferredProfessionalId : payload.professionals?.[0]?.id || '');
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : 'Agendamento indisponível.'
        )
      )
      .finally(() => setLoading(false));
  }, [catalog, open, preferredProfessionalId, preferredServiceId, slug]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!consent)
      return toast.error('Confirme o consentimento para criar a ficha.');
    setLoading(true);
    try {
      const response = await fetch(
        `/api/portal/${encodeURIComponent(slug)}/guest-booking`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            phone,
            serviceId,
            professionalId,
            scheduledStart: new Date(`${date}T${time}:00`).toISOString(),
            notes,
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error || 'Não foi possível agendar.');
      toast.success('Sessão agendada. A sua ficha de cliente foi criada.');
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível agendar.'
      );
    } finally {
      setLoading(false);
    }
  }

  const minDate = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(
    Date.now() + Number(catalog?.bookingAdvanceDays ?? 90) * 86_400_000
  )
    .toISOString()
    .slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agendar como convidado</DialogTitle>
          <DialogDescription>
            Crie a sua ficha na {businessName} e marque a primeira sessão. Não
            precisa de palavra-passe para concluir este agendamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="guest-name">Nome completo</Label>
            <Input
              id="guest-name"
              required
              minLength={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-email">Email</Label>
            <Input
              id="guest-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-phone">Telemóvel</Label>
            <Input
              id="guest-phone"
              type="tel"
              required
              placeholder="+351 912 345 678"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-service">Serviço</Label>
            <select
              id="guest-service"
              required
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {(catalog?.services ?? []).map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.duration_minutes} min ·{' '}
                  {formatCurrency(Number(service.price), service.currency)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-professional">Profissional</Label>
            <select
              id="guest-professional"
              required
              value={professionalId}
              onChange={(event) => setProfessionalId(event.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {(catalog?.professionals ?? []).map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.full_name ||
                    professional.professional_title ||
                    'Profissional'}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-date">Data</Label>
            <Input
              id="guest-date"
              type="date"
              required
              min={minDate}
              max={maxDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-time">Hora</Label>
            <Input
              id="guest-time"
              type="time"
              required
              step={900}
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="guest-notes">Observações (opcional)</Label>
            <Input
              id="guest-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Indique alguma preferência ou necessidade."
            />
          </div>
          <label className="text-muted-foreground flex items-start gap-3 text-xs leading-5 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            Autorizo a criação da minha ficha de cliente e o tratamento destes
            dados para gerir o agendamento e respetivas comunicações.
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                !catalog?.services.length ||
                !catalog?.professionals.length
              }
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CalendarCheck />
              )}
              Confirmar agendamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LoginFeature({
  icon: Icon,
  text,
}: {
  icon: typeof CalendarCheck;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-background/10 flex size-9 items-center justify-center rounded-md">
        <Icon className="size-4" />
      </span>
      <span>{text}</span>
    </div>
  );
}

function PortalPasswordChangeDialog({
  open,
  slug,
  onChanged,
}: {
  open: boolean;
  slug: string;
  onChanged: () => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (
      password.length < 10 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    )
      return toast.error(
        'Use pelo menos 10 caracteres, incluindo letras e números.'
      );
    if (password !== confirmation)
      return toast.error('As palavras-passe não coincidem.');
    setSaving(true);
    const response = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/password`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok)
      return toast.error(payload.error || 'Não foi possível alterar a senha.');
    toast.success('A sua palavra-passe foi definida com segurança.');
    setPassword('');
    setConfirmation('');
    await onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <span className="mb-2 flex size-11 items-center justify-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            <KeyRound className="size-5" />
          </span>
          <DialogTitle>Crie a sua palavra-passe</DialogTitle>
          <DialogDescription>
            A palavra-passe recebida por email ou WhatsApp é temporária. Defina
            agora uma palavra-passe pessoal antes de continuar no Portal 360.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-portal-password">Nova palavra-passe</Label>
            <Input
              id="new-portal-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Mínimo de 10 caracteres, com letras e números.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-portal-password">
              Confirmar palavra-passe
            </Label>
            <Input
              id="confirm-portal-password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            className="w-full"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Guardar e continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Brand({
  business,
  inverse = false,
}: {
  business: { name: string; logo_url: string | null };
  inverse?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {business.logo_url ? (
        <img
          src={business.logo_url}
          alt={business.name}
          className="size-9 rounded-md object-cover"
        />
      ) : (
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-md font-semibold">
          {business.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className={cn('font-semibold', inverse && 'text-white')}>
        {business.name}
      </span>
    </div>
  );
}

function PortalNav({
  tab,
  setTab,
  features,
}: {
  tab: PortalTab;
  setTab: (tab: PortalTab) => void;
  features: PortalData['settings'];
}) {
  const items: Array<{ id: PortalTab; label: string; icon: typeof Home }> = [
    { id: 'home', label: 'Visão geral', icon: Home },
    { id: 'appointments', label: 'As minhas marcações', icon: CalendarDays },
    { id: 'anamnesis', label: 'Fichas de anamnese', icon: ClipboardList },
    { id: 'benefits', label: 'Benefícios e saldo', icon: Gift },
    { id: 'campaigns', label: 'Campanhas exclusivas', icon: Megaphone },
    { id: 'referrals', label: 'Indique um amigo', icon: Share2 },
    { id: 'finance', label: 'Pagamentos e faturas', icon: ReceiptText },
    { id: 'support', label: 'Meus pedidos', icon: LifeBuoy },
    { id: 'help', label: 'Central de ajuda', icon: BookOpen },
    { id: 'notifications', label: 'Notificações', icon: Bell },
    { id: 'profile', label: 'Perfil e privacidade', icon: UserRound },
  ];
  return (
    <div className="space-y-1">
      {items
        .filter(
          ({ id }) =>
            (id !== 'benefits' || features.benefitsEnabled) &&
            (id !== 'referrals' || features.referralsEnabled) &&
            (id !== 'finance' || features.financialEnabled)
        )
        .map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            className={cn(
              'w-full justify-start font-normal',
              tab === id &&
                'bg-primary/10 text-primary hover:bg-primary/15 font-medium'
            )}
            onClick={() => setTab(id)}
          >
            <Icon />
            {label}
          </Button>
        ))}
    </div>
  );
}

function portalTabLabel(tab: PortalTab) {
  return {
    home: 'Visão geral',
    appointments: 'As minhas marcações',
    anamnesis: 'Fichas de anamnese',
    benefits: 'Benefícios e saldo',
    campaigns: 'Campanhas exclusivas',
    referrals: 'Indique um amigo',
    finance: 'Pagamentos e faturas',
    support: 'Meus pedidos',
    help: 'Central de ajuda',
    notifications: 'Notificações',
    profile: 'Perfil e privacidade',
  }[tab];
}

function HomeView({
  data,
  upcoming,
  walletBalance,
  voucherBalance,
  packSessions,
  onBook,
  onNavigate,
}: {
  data: PortalData;
  upcoming: PortalData['appointments'];
  walletBalance: number;
  voucherBalance: number;
  packSessions: number;
  onBook: () => void;
  onNavigate: (tab: PortalTab) => void;
}) {
  const next = upcoming[0];
  const completedProfileFields = [
    data.client.name,
    data.client.email,
    data.client.phone,
    data.client.birth_date,
    data.client.tax_id,
    data.client.city,
  ].filter(Boolean).length;
  const profileProgress = Math.round((completedProfileFields / 6) * 100);
  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            Olá, {data.client.name?.split(' ')[0] || 'cliente'}
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            O seu espaço de bem-estar
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tudo o que precisa para acompanhar a sua relação com{' '}
            {data.business.name}.
          </p>
        </div>
        {data.settings.bookingEnabled && (
          <Button onClick={onBook}>
            <CalendarCheck /> Nova marcação
          </Button>
        )}
      </section>
      {data.settings.referralsEnabled && data.referrals.program && (
        <section className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-50 via-orange-50 to-emerald-50 p-6 ring-1 ring-amber-200/80 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-emerald-950/20 dark:ring-amber-800/50">
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-3xl items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                <UserPlus className="size-6" />
              </span>
              <div>
                <span className="text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">
                  Campanha promocional
                </span>
                <h2 className="mt-1 text-xl font-semibold">
                  {data.referrals.program.headline}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  {data.referrals.program.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded-full bg-white/80 px-3 py-1.5 text-amber-800 ring-1 ring-amber-200 dark:bg-black/20 dark:text-amber-200 dark:ring-amber-800">
                    Ganha{' '}
                    {referralRewardLabel(
                      data.referrals.program.referrer_reward_type,
                      Number(data.referrals.program.referrer_reward_value),
                      data.business.default_currency
                    )}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 text-emerald-800 ring-1 ring-emerald-200 dark:bg-black/20 dark:text-emerald-200 dark:ring-emerald-800">
                    O amigo recebe{' '}
                    {referralRewardLabel(
                      data.referrals.program.friend_reward_type,
                      Number(data.referrals.program.friend_reward_value),
                      data.business.default_currency
                    )}
                  </span>
                </div>
              </div>
            </div>
            <Button
              size="lg"
              className="shrink-0 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => onNavigate('referrals')}
            >
              <Share2 /> Começar a indicar
            </Button>
          </div>
          <Gift className="absolute -right-8 -bottom-10 size-40 rotate-12 text-amber-500/10" />
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PortalMetric
          icon={CalendarDays}
          label="Próximas sessões"
          value={String(upcoming.length)}
          detail={
            next
              ? formatPortalDate(next.scheduled_start)
              : 'Sem marcações futuras'
          }
        />
        <PortalMetric
          icon={WalletCards}
          label="Cartão-saldo"
          value={formatCurrency(walletBalance, data.business.default_currency)}
          detail="Saldo disponível"
        />
        <PortalMetric
          icon={Gift}
          label="Vouchers ativos"
          value={formatCurrency(voucherBalance, data.business.default_currency)}
          detail={`${data.benefits.vouchers.filter((item) => item.status === 'active').length} ativos`}
        />
        <PortalMetric
          icon={PackageCheck}
          label="Packs"
          value={`${packSessions} sessões`}
          detail="Sessões disponíveis"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        {next ? (
          <section className="overflow-hidden rounded-lg bg-[#16251c] text-white">
            <div className="grid min-h-64 gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-7">
              <div className="flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-emerald-300 uppercase">
                    Próxima sessão
                  </span>
                  <h2 className="mt-3 text-2xl font-semibold">
                    {one(next.service)?.name || 'Sessão'}
                  </h2>
                  <p className="mt-2 text-sm text-white/65">
                    {one(next.professional)?.full_name ||
                      'Profissional a confirmar'}
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <div className="rounded-md bg-white/10 px-4 py-3">
                    <p className="text-xs text-white/55">Data e hora</p>
                    <p className="mt-1 font-medium">
                      {formatPortalDate(next.scheduled_start)}
                    </p>
                  </div>
                  <Status status={next.status} />
                </div>
              </div>
              <span className="flex size-14 items-center justify-center rounded-md bg-emerald-300 text-[#16251c]">
                <CalendarCheck className="size-6" />
              </span>
            </div>
          </section>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Ainda não há sessões futuras"
            detail="Escolha o serviço, profissional e horário que melhor se adaptam a si."
            action="Agendar sessão"
            onAction={onBook}
          />
        )}

        <section className="border-border bg-background rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <span className="flex size-10 items-center justify-center rounded-md bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
              <CircleUserRound className="size-5" />
            </span>
            <strong className="text-sm">{profileProgress}%</strong>
          </div>
          <h2 className="mt-5 font-semibold">A sua ficha de cliente</h2>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Mantenha os dados pessoais e fiscais atualizados para agilizar
            marcações e faturas.
          </p>
          <div className="bg-muted mt-4 h-2 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${profileProgress}%` }}
            />
          </div>
          <Button
            variant="outline"
            className="mt-5 w-full"
            onClick={() => onNavigate('profile')}
          >
            Atualizar perfil <ChevronRight />
          </Button>
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Acesso rápido</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLink
            icon={CalendarDays}
            label="As minhas marcações"
            detail="Próximas e anteriores"
            onClick={() => onNavigate('appointments')}
          />
          <QuickLink
            icon={Gift}
            label="Benefícios"
            detail="Vouchers, packs e saldo"
            onClick={() => onNavigate('benefits')}
          />
          <QuickLink
            icon={ReceiptText}
            label="Financeiro"
            detail="Compras e pagamentos"
            onClick={() => onNavigate('finance')}
          />
          {data.settings.referralsEnabled && (
            <QuickLink
              icon={Share2}
              label="Indique e ganhe"
              detail="Partilhe o seu código e acompanhe"
              onClick={() => onNavigate('referrals')}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function AppointmentsView({
  data,
  onBook,
  onRefresh,
}: {
  data: PortalData;
  onBook: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [rescheduleTarget, setRescheduleTarget] = useState<PortalData['appointments'][number] | null>(null);
  const [requestedStart, setRequestedStart] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const rescheduleSuggestions = useMemo(() => {
    if (!rescheduleTarget) return [];
    const professionalId = one(rescheduleTarget.professional)?.id;
    const professional = data.catalog.professionals.find(
      (item) => item.id === professionalId
    );
    if (!professional) return [];

    const serviceDuration = one(rescheduleTarget.service)?.duration_minutes;
    const appointmentDuration = Math.round(
      (new Date(rescheduleTarget.scheduled_end).getTime() -
        new Date(rescheduleTarget.scheduled_start).getTime()) /
        60_000
    );
    const duration = Math.max(15, appointmentDuration || serviceDuration || 60);
    const suggestions: Array<{ date: string; time: string }> = [];
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    const maxDays = Math.min(Math.max(data.settings.bookingAdvanceDays, 1), 30);

    for (let offset = 1; offset <= maxDays && suggestions.length < 6; offset += 1) {
      const candidate = new Date(cursor);
      candidate.setDate(cursor.getDate() + offset);
      const date = portalDateInput(candidate);
      const slots = buildSlots(date, professional, duration, data.availability);
      if (!slots.length) continue;

      // Show a few varied options instead of filling the dialog with the
      // first hours from a single day.
      const time = slots[Math.floor(slots.length / 2)] ?? slots[0];
      suggestions.push({ date, time });
    }
    return suggestions;
  }, [data.availability, data.catalog.professionals, data.settings.bookingAdvanceDays, rescheduleTarget]);
  const future = data.appointments
    .filter(
      (item) =>
        new Date(item.scheduled_start) >= new Date() &&
        !['cancelled', 'no_show'].includes(item.status)
    )
    .sort(
      (a, b) => +new Date(a.scheduled_start) - +new Date(b.scheduled_start)
    );
  const past = data.appointments
    .filter(
      (item) =>
        new Date(item.scheduled_start) < new Date() ||
        ['cancelled', 'no_show'].includes(item.status)
    )
    .slice(0, 30);
  async function cancel(id: string) {
    if (
      !window.confirm(
        'Deseja cancelar esta marcação? O benefício reservado será libertado.'
      )
    )
      return;
    const response = await fetch(
      `/api/portal/${data.settings.slug || ''}/appointments`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: id }),
      }
    );
    const payload = await response.json();
    if (!response.ok) return toast.error(payload.error);
    toast.success('Marcação cancelada.');
    await onRefresh();
  }
  function openReschedule(item: PortalData['appointments'][number]) {
    setRescheduleTarget(item);
    setRequestedStart('');
    setRequestReason('');
  }
  async function requestReschedule() {
    if (!rescheduleTarget || !requestedStart) {
      toast.error('Escolha a data e hora pretendidas.');
      return;
    }
    setRequesting(true);
    try {
      const response = await fetch(`/api/portal/${data.settings.slug || ''}/appointments`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: rescheduleTarget.id, action: 'reschedule', requestedStart: new Date(requestedStart).toISOString(), reason: requestReason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar o pedido.');
      toast.success('Pedido enviado. A alteração aguarda aprovação do profissional.');
      setRescheduleTarget(null);
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o pedido.');
    } finally { setRequesting(false); }
  }
  return (
    <div className="space-y-6">
      <PageHeading
        title="As minhas marcações"
        detail={`Pode cancelar até ${data.settings.cancellationHours} horas antes.`}
        action={
          data.settings.bookingEnabled ? (
            <Button onClick={onBook}>
              <CalendarCheck /> Nova marcação
            </Button>
          ) : null
        }
      />
      <AppointmentList
        title="Próximas"
        appointments={future}
        onCancel={cancel}
        onReschedule={openReschedule}
      />
      <AppointmentList title="Histórico" appointments={past} />
      <Dialog open={Boolean(rescheduleTarget)} onOpenChange={(open) => !open && setRescheduleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir alteração de horário</DialogTitle>
            <DialogDescription>A marcação mantém-se como está até o profissional aprovar o pedido.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <strong>{one(rescheduleTarget?.service)?.name || 'Sessão'}</strong>
              <p className="text-muted-foreground mt-1">Atual: {rescheduleTarget ? formatPortalDate(rescheduleTarget.scheduled_start) : ''}</p>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium">Sugestões com disponibilidade</p>
                <p className="text-muted-foreground text-xs">Escolha uma opção livre ou indique abaixo outra data e hora.</p>
              </div>
              {rescheduleSuggestions.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {rescheduleSuggestions.map((suggestion) => {
                    const value = `${suggestion.date}T${suggestion.time}`;
                    const selected = requestedStart === value;
                    return (
                      <Button
                        key={value}
                        type="button"
                        variant={selected ? 'default' : 'outline'}
                        className="h-auto justify-start whitespace-normal px-3 py-2 text-left text-sm"
                        onClick={() => setRequestedStart(value)}
                      >
                        <CalendarDays className="size-4 shrink-0" />
                        {new Date(`${value}:00`).toLocaleString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground rounded-md bg-muted/50 p-3 text-xs">Não encontrámos sugestões livres nos próximos dias. Pode indicar a data e hora que prefere.</p>
              )}
            </div>
            <label className="grid gap-1.5 text-sm font-medium">Data e hora pretendidas
              <Input type="datetime-local" value={requestedStart} min={portalDateTimeInput(new Date())} max={`${maxBookingDate(data.settings.bookingAdvanceDays)}T23:59`} onChange={(event) => setRequestedStart(event.target.value)} />
              <span className="text-muted-foreground text-xs font-normal">Também pode propor outro horário; a alteração só será aplicada após aprovação.</span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
              <Input value={requestReason} maxLength={500} onChange={(event) => setRequestReason(event.target.value)} placeholder="Ex.: indisponibilidade no horário atual" />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleTarget(null)} disabled={requesting}>Voltar</Button>
            <Button onClick={() => void requestReschedule()} disabled={requesting}>{requesting && <Loader2 className="animate-spin" />} Enviar pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AppointmentList({
  title,
  appointments,
  onCancel,
  onReschedule,
}: {
  title: string;
  appointments: PortalData['appointments'];
  onCancel?: (id: string) => void;
  onReschedule?: (item: PortalData['appointments'][number]) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {appointments.length ? (
        <div className="grid gap-3">
          {appointments.map((item) => (
            <article
              key={item.id}
              className="border-border bg-background rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {one(item.service)?.name || 'Sessão'}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {formatPortalDate(item.scheduled_start)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {one(item.professional)?.full_name ||
                      'Profissional a confirmar'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Status status={item.status} />
                  {onCancel &&
                    ['scheduled', 'confirmed'].includes(item.status) && (
                      <>
                      {onReschedule && <Button variant="secondary" size="sm" onClick={() => onReschedule(item)}><Pencil /> Alterar horário</Button>}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onCancel(item.id)}
                      >
                        Cancelar
                      </Button>
                      </>
                    )}
                </div>
              </div>
              {item.benefits?.some(
                (benefit) => benefit.status === 'reserved'
              ) && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                  <Gift className="size-4" /> Benefício reservado para esta
                  sessão
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed p-8 text-center text-sm">
          Sem registos.
        </p>
      )}
    </section>
  );
}

function AnamnesisView({ data }: { data: PortalData }) {
  const statusLabel = {
    pending: 'A preencher',
    submitted: 'Enviada',
    reviewed: 'Revista pela equipa',
    expired: 'Expirada',
    revoked: 'Revogada',
  };
  return (
    <div className="space-y-6">
      <PageHeading
        title="Fichas de anamnese"
        detail="Consulte as fichas clínicas associadas às suas sessões e complete as que estão pendentes."
        action={
          data.settings.anamnesisPublicSlug ? (
            <Button
              variant="outline"
              onClick={() =>
                window.open('/anamnese', '_blank', 'noopener,noreferrer')
              }
            >
              <ClipboardList /> Preencher ficha geral
            </Button>
          ) : undefined
        }
      />
      {data.anamnesis.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.anamnesis.map((form) => {
            const service = Array.isArray(form.service)
              ? form.service[0]
              : form.service;
            const appointment = Array.isArray(form.appointment)
              ? form.appointment[0]
              : form.appointment;
            const answers = Object.entries(form.answers || {}).filter(
              ([, value]) => value !== '' && value !== false
            );
            return (
              <article
                key={form.id}
                className="border-border bg-background overflow-hidden rounded-lg border"
              >
                <div className="border-border flex items-start gap-3 border-b p-5">
                  <span className="flex size-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                    <ClipboardList className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">
                      {service?.name || 'Ficha clínica'}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {appointment?.scheduled_start
                        ? formatPortalDate(appointment.scheduled_start)
                        : new Date(form.created_at).toLocaleDateString('pt-PT')}
                    </p>
                  </div>
                  <Badge
                    variant={
                      form.status === 'pending' ? 'secondary' : 'default'
                    }
                  >
                    {statusLabel[form.status]}
                  </Badge>
                </div>
                <div className="space-y-4 p-5">
                  {form.selected_modalities?.length > 0 && (
                    <div>
                      <p className="text-muted-foreground text-xs">
                        Modalidades
                      </p>
                      <p className="mt-1 text-sm">
                        {form.selected_modalities.join(' · ')}
                      </p>
                    </div>
                  )}
                  {answers.length > 0 && form.status !== 'pending' && (
                    <details className="border-border rounded-md border">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                        Ver cópia das respostas ({answers.length})
                      </summary>
                      <div className="border-border space-y-2 border-t p-3">
                        {answers.map(([key, value]) => (
                          <div key={key} className="text-xs">
                            <span className="text-muted-foreground">
                              {anamnesisAnswerLabel(key)}
                            </span>
                            <p className="mt-0.5">
                              {Array.isArray(value)
                                ? value.join(', ')
                                : String(value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {form.status === 'pending' && (
                    <Button
                      className="w-full"
                      onClick={() =>
                        window.open(
                          `/anamnese/${form.public_token}`,
                          '_blank',
                          'noopener,noreferrer'
                        )
                      }
                    >
                      <Pencil /> Preencher agora
                    </Button>
                  )}
                  {form.submitted_at && (
                    <p className="text-muted-foreground text-xs">
                      Assinada por {form.signature_name || 'cliente'} em{' '}
                      {new Date(form.submitted_at).toLocaleString('pt-PT')}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="Ainda não existem fichas clínicas"
          detail="Quando uma sessão exigir anamnese, a ficha ficará disponível aqui e no link enviado pelo WhatsApp."
        />
      )}
    </div>
  );
}

function anamnesisAnswerLabel(key: string) {
  const labels: Record<string, string> = {
    goals: 'Objetivo principal',
    allergies: 'Alergias ou sensibilidades',
    medication: 'Medicação atual',
    recent_history: 'Histórico recente',
    conditions: 'Condições relevantes',
    pain_detail: 'Dor e intensidade',
    mobility: 'Mobilidade e diagnóstico',
    pressure: 'Pressão preferida',
    avoid_areas: 'Zonas a evitar',
    heat_notes: 'Sensibilidade ao calor',
    skin_profile: 'Perfil da pele',
    skin_treatments: 'Tratamentos de pele',
    other_notes: 'Outras informações',
  };
  return labels[key] || key.replaceAll('_', ' ');
}

function BenefitsView({
  data,
  walletBalance,
  voucherBalance,
  packSessions,
  onUse,
}: {
  data: PortalData;
  walletBalance: number;
  voucherBalance: number;
  packSessions: number;
  onUse: (benefitCode?: string, serviceId?: string, benefitPin?: string) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const activeVouchers = data.benefits.vouchers.filter(
    (item) => item.status === 'active'
  );
  const archivedVouchers = data.benefits.vouchers.filter(
    (item) => item.status !== 'active'
  );
  const activePacks = data.benefits.packs.filter(packIsAvailable);
  const archivedPacks = data.benefits.packs.filter(
    (item) => !packIsAvailable(item)
  );
  return (
    <div className="space-y-6">
      <PageHeading
        title="Benefícios"
        detail="Consulte e utilize os benefícios associados à sua ficha."
        action={
          <Button onClick={() => onUse()}>
            <Sparkles /> Usar numa marcação
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <PortalMetric
          icon={WalletCards}
          label="Cartão-saldo"
          value={formatCurrency(walletBalance, data.business.default_currency)}
          detail="Disponível para pagamentos"
        />
        <PortalMetric
          icon={Gift}
          label="Vouchers"
          value={formatCurrency(voucherBalance, data.business.default_currency)}
          detail="Saldo total ativo"
        />
        <PortalMetric
          icon={PackageCheck}
          label="Packs"
          value={`${packSessions} sessões`}
          detail="Disponíveis"
        />
      </div>
      <section className="border-border bg-background overflow-hidden rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Movimentos do cartão-saldo</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Créditos de indicações, utilizações, estornos e ajustes.
            </p>
          </div>
          <strong>
            {formatCurrency(walletBalance, data.business.default_currency)}
          </strong>
        </div>
        <div className="divide-border divide-y">
          {data.benefits.walletTransactions.length ? (
            data.benefits.walletTransactions.slice(0, 20).map((item) => {
              const incoming = ['credit', 'refund'].includes(
                item.transaction_type
              );
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span
                    className={cn(
                      'flex size-9 items-center justify-center rounded-md',
                      incoming
                        ? 'bg-emerald-500/10 text-emerald-700'
                        : 'bg-amber-500/10 text-amber-700'
                    )}
                  >
                    {incoming ? (
                      <ArrowDownLeft className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.description ||
                        walletTransactionLabel(item.transaction_type)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatPortalDate(item.created_at)} · saldo após o
                      movimento{' '}
                      {formatCurrency(
                        Number(item.balance_after),
                        data.benefits.wallet?.currency ||
                          data.business.default_currency
                      )}
                    </p>
                  </div>
                  <strong
                    className={cn(
                      'text-sm',
                      incoming ? 'text-emerald-700' : 'text-amber-700'
                    )}
                  >
                    {incoming ? '+' : '-'}
                    {formatCurrency(
                      Math.abs(Number(item.amount)),
                      data.benefits.wallet?.currency ||
                        data.business.default_currency
                    )}
                  </strong>
                </div>
              );
            })
          ) : (
            <p className="text-muted-foreground p-5 text-sm">
              Ainda não existem movimentos no cartão-saldo.
            </p>
          )}
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Disponíveis para utilizar</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Apresente o código ou selecione o benefício durante a marcação.
            </p>
          </div>
          <Badge variant="secondary">
            {activeVouchers.length + activePacks.length} ativos
          </Badge>
        </div>
        {activeVouchers.length + activePacks.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeVouchers.map((item) => (
              <VoucherPortalCard
                key={item.id}
                item={item}
                data={data}
                onUse={onUse}
              />
            ))}
            {activePacks.map((pack) => (
              <PackPortalCard
                key={pack.id}
                pack={pack}
                data={data}
                onUse={onUse}
              />
            ))}
          </div>
        ) : (
          <div className="border-border bg-background rounded-lg border p-8 text-center">
            <Gift className="text-muted-foreground mx-auto size-6" />
            <p className="mt-3 font-medium">Sem benefícios ativos</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Novos vouchers, packs e créditos aparecerão aqui.
            </p>
          </div>
        )}
      </section>

      {(archivedVouchers.length > 0 || archivedPacks.length > 0) && (
        <section className="border-border bg-background overflow-hidden rounded-lg border">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            onClick={() => setShowArchived((current) => !current)}
          >
            <span>
              <strong className="block text-sm">Histórico de benefícios</strong>
              <span className="text-muted-foreground text-xs">
                Utilizados, expirados e cancelados
              </span>
            </span>
            <span className="flex items-center gap-2 text-xs">
              {archivedVouchers.length + archivedPacks.length} registos
              <ChevronDown
                className={cn(
                  'size-4 transition-transform',
                  showArchived && 'rotate-180'
                )}
              />
            </span>
          </button>
          {showArchived && (
            <div className="border-border bg-muted/20 grid gap-3 border-t p-4 md:grid-cols-2 xl:grid-cols-3">
              {archivedVouchers.map((item) => (
                <VoucherPortalCard key={item.id} item={item} data={data} />
              ))}
              {archivedPacks.map((pack) => (
                <PackPortalCard key={pack.id} pack={pack} data={data} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function VoucherPortalCard({
  item,
  data,
  onUse,
}: {
  item: PortalData['benefits']['vouchers'][number];
  data: PortalData;
  onUse?: (benefitCode: string, serviceId?: string, benefitPin?: string) => void;
}) {
  const monetary = item.voucher_type !== 'service';
  const initial = monetary
    ? Number(item.initial_balance || 0)
    : Number(item.remaining_uses || 0);
  const current = monetary
    ? Number(item.current_balance || 0)
    : Number(item.remaining_uses || 0);
  const percentage = initial > 0 ? Math.min(100, (current / initial) * 100) : 0;
  return (
    <article className="border-border bg-background flex min-h-60 flex-col rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md">
          <Gift className="size-4" />
        </span>
        <Status status={item.status} />
      </div>
      <h3 className="mt-3 font-semibold">
        {monetary
          ? 'Cartão-presente'
          : one(item.service)?.name || 'Voucher de serviço'}
      </h3>
      <p className="text-muted-foreground mt-1 font-mono text-xs">
        {item.code}
      </p>
      <strong className="mt-4 block text-2xl">
        {monetary
          ? formatCurrency(current, item.currency)
          : `${current} utilização${current === 1 ? '' : 'ões'}`}
      </strong>
      <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        {item.expires_at
          ? `Válido até ${new Date(item.expires_at).toLocaleDateString('pt-PT')}`
          : 'Sem data de expiração'}
      </p>
      <div className="mt-auto pt-3">
        {onUse && item.status === 'active' && (
          <Button
            className="w-full"
            size="sm"
            onClick={() =>
              onUse(
                item.code,
                item.voucher_type === 'service'
                  ? one(item.service)?.id
                  : undefined,
                item.pin_code ?? undefined
              )
            }
          >
            <CalendarCheck /> Usar numa marcação
          </Button>
        )}
        <BenefitHistory
          data={data}
          logs={data.benefits.logs.filter((log) => log.voucher_id === item.id)}
        />
      </div>
    </article>
  );
}

function PackPortalCard({
  pack,
  data,
  onUse,
}: {
  pack: PortalData['benefits']['packs'][number];
  data: PortalData;
  onUse?: (benefitCode: string, serviceId?: string, benefitPin?: string) => void;
}) {
  const total = (pack.balances || []).reduce(
    (sum, balance) => sum + Number(balance.total_sessions || 0),
    0
  );
  const remaining = (pack.balances || []).reduce(
    (sum, balance) => sum + Number(balance.remaining_sessions || 0),
    0
  );
  const percentage = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
  return (
    <article className="border-border bg-background flex min-h-60 flex-col rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700">
          <PackageCheck className="size-4" />
        </span>
        <Status status={pack.status} />
      </div>
      <h3 className="mt-3 font-semibold">{one(pack.pack)?.name || 'Pack'}</h3>
      <p className="text-muted-foreground mt-1 font-mono text-xs">
        {pack.code}
      </p>
      <div className="mt-2 flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800">
        <span className="text-muted-foreground">PIN para reservar</span>
        <strong className="font-mono tracking-[0.2em]">
          {pack.pin_code || 'Não definido'}
        </strong>
      </div>
      <strong className="mt-4 block text-2xl">
        {remaining}/{total} sessões
      </strong>
      <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-emerald-600"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-3 space-y-1 text-xs">
        {pack.balances?.map((balance) => (
          <div key={balance.id} className="flex justify-between gap-3">
            <span className="text-muted-foreground truncate">
              {one(balance.service)?.name || 'Serviço'}
            </span>
            <span className="shrink-0 font-medium">
              {balance.remaining_sessions}/{balance.total_sessions}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-3">
        {onUse && pack.status === 'active' && (
          <Button
            className="w-full"
            size="sm"
            onClick={() => {
              const availableServices = (pack.balances ?? []).filter(
                (balance) => Number(balance.remaining_sessions) > 0
              );
              onUse(
                pack.code,
                availableServices.length === 1
                  ? one(availableServices[0].service)?.id
                  : undefined,
                pack.pin_code ?? undefined
              );
            }}
          >
            <CalendarCheck /> Usar numa marcação
          </Button>
        )}
        <BenefitHistory
          data={data}
          logs={data.benefits.logs.filter(
            (log) => log.client_pack_id === pack.id
          )}
        />
      </div>
    </article>
  );
}

function BenefitHistory({
  data,
  logs,
}: {
  data: PortalData;
  logs: PortalData['benefits']['logs'];
}) {
  return (
    <details className="border-border mt-4 border-t pt-3">
      <summary className="text-primary cursor-pointer text-sm font-medium">
        Ver onde e quando foi utilizado ({logs.length})
      </summary>
      <div className="mt-3 space-y-2">
        {logs.length ? (
          logs.map((log) => {
            const appointment = data.appointments.find(
              (item) => item.id === log.appointment_id
            );
            return (
              <div key={log.id} className="bg-muted/40 rounded-md p-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <strong>{benefitActionLabel(log.action)}</strong>
                  <time className="text-muted-foreground shrink-0">
                    {formatPortalDate(log.created_at)}
                  </time>
                </div>
                {appointment && (
                  <p className="mt-1">
                    {one(appointment.service)?.name || 'Sessão'} ·{' '}
                    {formatPortalDate(appointment.scheduled_start)} ·{' '}
                    {one(appointment.professional)?.full_name || 'Clínica'}
                  </p>
                )}
                {(Number(log.amount) !== 0 || Number(log.sessions) !== 0) && (
                  <p className="text-muted-foreground mt-1">
                    {Number(log.sessions) !== 0
                      ? `${Math.abs(Number(log.sessions))} sessão(ões)`
                      : formatCurrency(
                          Math.abs(Number(log.amount)),
                          data.business.default_currency
                        )}
                  </p>
                )}
                {(log.performed_by_name || log.approved_by_name) && (
                  <p className="text-muted-foreground mt-1">
                    Registado por {log.performed_by_name || 'equipa'}
                    {log.approved_by_name
                      ? ` · aprovado por ${log.approved_by_name}`
                      : ''}
                  </p>
                )}
                {log.notes && <p className="mt-1">{log.notes}</p>}
              </div>
            );
          })
        ) : (
          <p className="text-muted-foreground text-xs">
            Ainda não existem movimentos para este benefício.
          </p>
        )}
      </div>
    </details>
  );
}

function benefitActionLabel(action: string) {
  return (
    {
      issued: 'Benefício emitido',
      reserved: 'Reservado numa marcação',
      used: 'Benefício utilizado',
      released: 'Reserva libertada',
      cancelled: 'Benefício cancelado',
      adjusted: 'Saldo ajustado',
    }[action] || action
  );
}

function walletTransactionLabel(type: string) {
  return (
    {
      credit: 'Crédito adicionado',
      debit: 'Saldo utilizado',
      refund: 'Valor devolvido',
      adjustment: 'Ajuste de saldo',
    }[type] || type
  );
}

function FinanceView({
  data,
  onRefresh,
}: {
  data: PortalData;
  onRefresh: () => Promise<void>;
}) {
  const [invoiceSale, setInvoiceSale] = useState<
    PortalData['finance']['sales'][number] | null
  >(null);
  const total = data.finance.sales
    .filter((item) => !['voided', 'refunded'].includes(item.status))
    .reduce((sum, item) => sum + Number(item.total_amount), 0);
  const paid = data.finance.sales.reduce(
    (sum, item) => sum + Number(item.paid_amount),
    0
  );
  const due = data.finance.sales.reduce(
    (sum, item) => sum + Number(item.balance_due),
    0
  );
  return (
    <div className="space-y-6">
      <PageHeading
        title="Financeiro"
        detail="Histórico das suas compras, pagamentos e valores pendentes."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PortalMetric
          icon={BadgeEuro}
          label="Total adquirido"
          value={formatCurrency(total, data.business.default_currency)}
          detail={`${data.finance.sales.length} compras`}
        />
        <PortalMetric
          icon={Check}
          label="Pago"
          value={formatCurrency(paid, data.business.default_currency)}
          detail="Pagamentos registados"
        />
        <PortalMetric
          icon={Clock3}
          label="Pendente"
          value={formatCurrency(due, data.business.default_currency)}
          detail="Saldo por liquidar"
        />
        <PortalMetric
          icon={FileClock}
          label="Faturas solicitadas"
          value={String(data.finance.invoiceRequests.length)}
          detail={`${data.finance.invoiceRequests.filter((item) => ['pending', 'processing'].includes(item.status)).length} em tratamento`}
        />
      </div>
      <section className="border-border bg-background overflow-hidden rounded-lg border">
        <div className="border-border border-b px-4 py-3">
          <h2 className="font-semibold">Compras</h2>
        </div>
        <div className="divide-border divide-y">
          {data.finance.sales.map((sale) => {
            const invoice = data.finance.invoiceRequests.find(
              (item) => item.sale_id === sale.id
            );
            const paymentLink = data.finance.paymentLinks.find(
              (item) =>
                item.sale_id === sale.id &&
                ['pending', 'open', 'created'].includes(item.status) &&
                Boolean(item.payment_url)
            );
            return (
              <details key={sale.id} className="group">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <ReceiptText className="text-muted-foreground size-4" />
                  <div className="min-w-0 flex-1">
                    <strong className="block text-sm">
                      Venda #{sale.sale_number}
                    </strong>
                    <span className="text-muted-foreground text-xs">
                      {new Date(sale.created_at).toLocaleDateString('pt-PT')}
                    </span>
                  </div>
                  <strong>
                    {formatCurrency(Number(sale.total_amount), sale.currency)}
                  </strong>
                  <Status status={sale.status} />
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                </summary>
                <div className="bg-muted/20 border-border border-t px-5 py-4 text-sm">
                  <div className="space-y-2">
                    {sale.items?.map((item) => (
                      <div key={item.id} className="flex justify-between gap-3">
                        <span>
                          {item.name_snapshot} × {item.quantity}
                        </span>
                        <span>
                          {formatCurrency(
                            Number(item.line_total),
                            sale.currency
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="border-border mt-3 flex justify-between border-t pt-3">
                    <span>Pago</span>
                    <strong>
                      {formatCurrency(Number(sale.paid_amount), sale.currency)}
                    </strong>
                  </div>
                  {Number(sale.balance_due) > 0 && (
                    <div className="mt-1 flex justify-between text-amber-700">
                      <span>Pendente</span>
                      <strong>
                        {formatCurrency(
                          Number(sale.balance_due),
                          sale.currency
                        )}
                      </strong>
                    </div>
                  )}
                  {paymentLink?.payment_url && Number(sale.balance_due) > 0 && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <div>
                        <p className="font-semibold text-emerald-900">Pagamento online disponível</p>
                        <p className="mt-1 text-xs text-emerald-800">
                          Pague {formatCurrency(Number(paymentLink.amount), paymentLink.currency)} em segurança através da {paymentLink.provider === 'sumup' ? 'SumUp' : 'plataforma de pagamentos'}.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          window.open(
                            paymentLink.payment_url!,
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                      >
                        <WalletCards /> Pagar online
                      </Button>
                    </div>
                  )}
                  {(sale.payments ?? []).length > 0 && (
                    <div className="border-border mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void downloadPortalReceipt(data, sale)}
                      >
                        <Download /> Recibo PDF
                      </Button>
                      {!invoice ||
                      ['rejected', 'cancelled'].includes(invoice.status) ? (
                        <Button size="sm" onClick={() => setInvoiceSale(sale)}>
                          <ReceiptText /> Solicitar fatura
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Status status={invoice.status} />
                          <span className="text-muted-foreground text-xs">
                            Pedido em{' '}
                            {new Date(invoice.requested_at).toLocaleDateString(
                              'pt-PT'
                            )}
                          </span>
                        </div>
                      )}
                      {invoice?.status === 'issued' &&
                        invoice.invoice_number && (
                          <span className="text-sm font-medium">
                            Fatura {invoice.invoice_number}
                          </span>
                        )}
                      {invoice?.status === 'issued' && invoice.has_document && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.open(
                              `/api/portal/${data.settings.slug}/invoice-requests/${invoice.id}/document`,
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                        >
                          <FileCheck2 /> Abrir fatura
                        </Button>
                      )}
                      {invoice?.admin_notes && (
                        <p className="text-muted-foreground basis-full text-xs">
                          Resposta da clínica: {invoice.admin_notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>
      {invoiceSale && (
        <InvoiceRequestDialog
          key={invoiceSale.id}
          data={data}
          sale={invoiceSale}
          onClose={() => setInvoiceSale(null)}
          onCreated={onRefresh}
        />
      )}
    </div>
  );
}

async function downloadPortalReceipt(
  data: PortalData,
  sale: PortalData['finance']['sales'][number]
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
    business: {
      name: data.business.name,
      logoUrl: data.business.logo_url,
      publicUrl: data.business.public_url,
    },
    client: {
      name: data.client.name,
      email: data.client.email,
      taxId: data.client.tax_id,
      reference: data.client.client_reference,
    },
    items: sale.items.map((item) => ({
      name: item.name_snapshot,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      discount: Number(item.discount_amount),
      taxRate: Number(item.tax_rate),
      taxAmount: Number(item.tax_amount),
      total: Number(item.line_total),
    })),
    payments: sale.payments.map((payment) => ({
      method: payment.method,
      amount: Number(payment.amount),
      paidAt: payment.paid_at,
      status: payment.status,
      reference: payment.reference_code,
    })),
  });
}

function InvoiceRequestDialog({
  data,
  sale,
  onClose,
  onCreated,
}: {
  data: PortalData;
  sale: PortalData['finance']['sales'][number];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    fiscalName: data.client.name || '',
    taxId: data.client.tax_id || '',
    email: data.client.email || '',
    addressLine: data.client.address_line || '',
    postalCode: data.client.postal_code || '',
    city: data.client.city || '',
    country: data.client.country || 'Portugal',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  function patch(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit() {
    if (!form.fiscalName.trim() || !form.taxId.trim() || !form.email.trim())
      return toast.error('Preencha nome fiscal, NIF e email.');
    setSaving(true);
    const response = await fetch(
      `/api/portal/${data.settings.slug}/invoice-requests`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: sale.id, ...form }),
      }
    );
    const payload = await response.json();
    setSaving(false);
    if (!response.ok)
      return toast.error(
        payload.error || 'Não foi possível solicitar a fatura.'
      );
    toast.success('Pedido de fatura enviado à clínica.');
    onClose();
    await onCreated();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Solicitar fatura da venda #{sale.sale_number}
          </DialogTitle>
          <DialogDescription>
            Confirme os dados fiscais. A equipa administrativa receberá o pedido
            e o estado ficará disponível no portal.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Nome fiscal">
            <Input
              value={form.fiscalName}
              onChange={(e) => patch('fiscalName', e.target.value)}
            />
          </Field>
          <Field label="NIF">
            <Input
              value={form.taxId}
              onChange={(e) => patch('taxId', e.target.value)}
            />
          </Field>
          <Field label="Email para envio">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => patch('email', e.target.value)}
            />
          </Field>
          <Field label="País">
            <Input
              value={form.country}
              onChange={(e) => patch('country', e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Morada fiscal">
              <Input
                value={form.addressLine}
                onChange={(e) => patch('addressLine', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Código postal">
            <Input
              value={form.postalCode}
              onChange={(e) => patch('postalCode', e.target.value)}
            />
          </Field>
          <Field label="Localidade">
            <Input
              value={form.city}
              onChange={(e) => patch('city', e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Observação (opcional)">
              <textarea
                className="border-input bg-background min-h-20 w-full rounded-md border p-3 text-sm"
                value={form.notes}
                onChange={(e) => patch('notes', e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="bg-muted/40 rounded-md p-3 text-xs">
          <strong>Resumo:</strong>{' '}
          {formatCurrency(
            Number(sale.total_amount || 0),
            sale.currency || data.business.default_currency
          )}{' '}
          · pago{' '}
          {formatCurrency(
            Number(sale.paid_amount || 0),
            sale.currency || data.business.default_currency
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Send />} Enviar
            pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignsView({
  data,
  onRefresh,
}: {
  data: PortalData;
  onRefresh: () => Promise<void>;
}) {
  const [joining, setJoining] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  async function join(campaignId: string) {
    setJoining(campaignId);
    const response = await fetch(
      `/api/portal/${encodeURIComponent(data.settings.slug)}/campaigns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      }
    );
    const payload = await response.json().catch(() => null);
    setJoining(null);
    if (!response.ok)
      return toast.error(payload?.error || 'Não foi possível aderir.');
    if (payload?.checkoutUrl) {
      window.location.assign(payload.checkoutUrl);
      return;
    }
    toast.success('Adesão registada. Entraremos em contacto consigo.');
    await onRefresh();
  }

  if (!data.campaigns.length)
    return (
      <EmptyState
        icon={Megaphone}
        title="Sem campanhas neste momento"
        detail="As campanhas exclusivas publicadas para clientes aparecerão aqui."
      />
    );

  return (
    <div className="space-y-6">
      <PageHeading
        title="Campanhas exclusivas"
        detail="Condições especiais reservadas aos clientes do Portal 360."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {data.campaigns.map((campaign) => {
          const joined =
            campaign.enrollment && campaign.enrollment.status !== 'cancelled';
          const full =
            campaign.capacity !== null &&
            campaign.enrollmentCount >= campaign.capacity;
          return (
            <article
              key={campaign.id}
              className="group overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-[0_18px_60px_-30px_rgba(109,40,217,.45)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_-28px_rgba(109,40,217,.55)]"
            >
              {campaign.image_url && (
                <button
                  type="button"
                  className="block w-full overflow-hidden"
                  onClick={() =>
                    setSelectedImage({
                      url: campaign.image_url!,
                      title: campaign.title,
                    })
                  }
                  aria-label={`Abrir imagem completa da campanha ${campaign.title}`}
                >
                  <img
                    src={campaign.image_url}
                    alt={`Imagem da campanha ${campaign.title}`}
                    className="aspect-[3/1] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                </button>
              )}
              {!campaign.image_url && (
                <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-violet-700 via-fuchsia-600 to-amber-400 text-white">
                  <div className="absolute -top-16 -right-12 size-44 rounded-full bg-white/15 blur-2xl" />
                  <Sparkles className="size-14 drop-shadow-lg" />
                </div>
              )}
              <div className="space-y-5 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {campaign.badge_text && (
                      <Badge className="mb-2">{campaign.badge_text}</Badge>
                    )}
                    <h2 className="text-2xl font-bold tracking-tight">{campaign.title}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {campaign.summary}
                    </p>
                  </div>
                  <Megaphone className="text-primary size-6 shrink-0" />
                </div>
                {campaign.benefit_text && (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 text-emerald-900">
                    <Gift className="size-5 shrink-0" />
                    <strong className="text-base">{campaign.benefit_text}</strong>
                  </div>
                )}
                <p className="text-sm leading-6 whitespace-pre-line">
                  {campaign.description}
                </p>
                <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {campaign.ends_at && (
                    <span>Válida até {formatPortalDate(campaign.ends_at)}</span>
                  )}
                  {campaign.capacity && (
                    <span>
                      {Math.max(
                        0,
                        campaign.capacity - campaign.enrollmentCount
                      )}{' '}
                      vaga(s) disponível(is)
                    </span>
                  )}
                </div>
                {campaign.terms && (
                  <details className="text-muted-foreground text-xs">
                    <summary className="cursor-pointer font-medium">
                      Termos e condições
                    </summary>
                    <p className="mt-2 whitespace-pre-line">{campaign.terms}</p>
                  </details>
                )}
                <Button
                  className="h-12 w-full rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 text-base font-semibold shadow-lg shadow-violet-200 hover:from-violet-800 hover:to-fuchsia-700"
                  disabled={Boolean(joined || full || joining)}
                  onClick={() => void join(campaign.id)}
                >
                  {joining === campaign.id ? (
                    <Loader2 className="animate-spin" />
                  ) : joined ? (
                    <Check />
                  ) : (
                    <Sparkles />
                  )}
                  {joined
                    ? 'Já aderiu'
                    : full
                      ? 'Campanha esgotada'
                      : campaign.commerce_enabled
                        ? `Comprar por ${formatCurrency(Number(campaign.commerce_price), campaign.commerce_currency || data.business.default_currency)}`
                        : 'Quero aderir'}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      <Dialog
        open={Boolean(selectedImage)}
        onOpenChange={(open) => !open && setSelectedImage(null)}
      >
        <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none">
          {selectedImage && (
            <img
              src={selectedImage.url}
              alt={`Imagem completa da campanha ${selectedImage.title}`}
              className="max-h-[85vh] w-full rounded-2xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReferralsView({
  data,
  onRefresh,
}: {
  data: PortalData;
  onRefresh: () => Promise<void>;
}) {
  const program = data.referrals.program;
  const code = data.referrals.code?.code;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const url =
    typeof window !== 'undefined' && code
      ? `${window.location.origin}/refer/${code}`
      : '';
  const qualified = data.referrals.items.filter((item) =>
    ['qualified', 'rewarded'].includes(item.status)
  ).length;
  const earned = data.referrals.items
    .flatMap((item) => item.rewards)
    .filter(
      (reward) =>
        reward.beneficiary_type === 'referrer' &&
        ['issued', 'redeemed'].includes(reward.status)
    )
    .reduce(
      (sum, reward) =>
        sum + Number(reward.credited_amount ?? reward.reward_value ?? 0),
      0
    );

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success('Link de indicação copiado.');
  }
  async function shareLink() {
    if (!url) return;
    if (navigator.share)
      await navigator.share({
        title: program?.headline || 'Indique um amigo',
        text: program?.description,
        url,
      });
    else await copyLink();
  }
  async function submit() {
    if (!code || !name.trim() || !phone.trim())
      return toast.error('Informe o nome e o telefone do seu amigo.');
    if (program?.require_consent && !consent)
      return toast.error('Confirme o consentimento para continuar.');
    setSaving(true);
    const response = await fetch(`/api/referrals/${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email: email || null, consent }),
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok)
      return toast.error(
        payload.error || 'Não foi possível registar a indicação.'
      );
    toast.success('Indicação registada com sucesso.');
    setName('');
    setPhone('');
    setEmail('');
    setConsent(false);
    setOpen(false);
    await onRefresh();
  }
  if (!program || !code)
    return (
      <EmptyState
        icon={Share2}
        title="Programa de indicações indisponível"
        detail="A clínica ainda não publicou um programa de indicações para a sua conta."
      />
    );

  return (
    <div className="space-y-6">
      <PageHeading
        title="Indique um amigo"
        detail={program.description}
        action={
          <Button onClick={() => setOpen(true)}>
            <UserPlus /> Nova indicação
          </Button>
        }
      />
      <section className="border-primary/30 bg-primary/[0.04] rounded-lg border p-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <span className="text-primary text-xs font-semibold uppercase">
              O seu código pessoal
            </span>
            <h2 className="mt-2 text-xl font-semibold">{program.headline}</h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <code className="border-primary/30 bg-background rounded-md border px-4 py-2 text-base font-semibold">
                {code}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void copyLink()}
                title="Copiar link"
              >
                <Copy />
              </Button>
              <Button variant="outline" onClick={() => void shareLink()}>
                <Share2 /> Partilhar
              </Button>
            </div>
          </div>
          <div className="bg-background min-w-64 rounded-md border p-4 text-sm">
            <p className="text-muted-foreground text-xs">A sua recompensa</p>
            <strong className="mt-1 block text-lg">
              {referralRewardLabel(
                program.referrer_reward_type,
                Number(program.referrer_reward_value),
                data.business.default_currency
              )}
            </strong>
            <p className="text-muted-foreground mt-3 text-xs">O amigo recebe</p>
            <strong className="mt-1 block">
              {referralRewardLabel(
                program.friend_reward_type,
                Number(program.friend_reward_value),
                data.business.default_currency
              )}
            </strong>
          </div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PortalMetric
          icon={UserPlus}
          label="Indicados"
          value={String(data.referrals.items.length)}
          detail="Registos enviados"
        />
        <PortalMetric
          icon={CalendarCheck}
          label="Qualificados"
          value={String(qualified)}
          detail="Cumpriram as condições"
        />
        <PortalMetric
          icon={Gift}
          label="Recompensados"
          value={String(
            data.referrals.items.filter((item) => item.status === 'rewarded')
              .length
          )}
          detail="Prémios processados"
        />
        <PortalMetric
          icon={WalletCards}
          label="Crédito recebido"
          value={formatCurrency(earned, data.business.default_currency)}
          detail="Emitido no cartão-saldo"
        />
      </div>
      <section className="border-border bg-background overflow-hidden rounded-lg border">
        <div className="border-border border-b px-4 py-3">
          <h2 className="font-semibold">As suas indicações</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Acompanhe o registo, agendamento, qualificação e recompensa.
          </p>
        </div>
        <div className="divide-border divide-y">
          {data.referrals.items.length ? (
            data.referrals.items.map((item) => (
              <details key={item.id} className="group">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-4">
                  <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full font-semibold">
                    {item.friend_name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">
                      {item.friend_name}
                    </strong>
                    <span className="text-muted-foreground text-xs">
                      {item.friend_phone} · indicado em{' '}
                      {new Date(item.created_at).toLocaleDateString('pt-PT')}
                    </span>
                  </div>
                  <Status status={item.status} />
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                </summary>
                <div className="bg-muted/20 border-border grid gap-4 border-t p-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold">Linha do tempo</h3>
                    <div className="mt-3 space-y-2">
                      {[...item.events]
                        .sort(
                          (a, b) =>
                            +new Date(b.created_at) - +new Date(a.created_at)
                        )
                        .map((event) => (
                          <div
                            key={event.id}
                            className="border-border border-l-2 pl-3 text-xs"
                          >
                            <strong>{referralEventLabel(event.action)}</strong>
                            <p className="text-muted-foreground mt-0.5">
                              {formatPortalDate(event.created_at)}
                              {event.reason ? ` · ${event.reason}` : ''}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Recompensas</h3>
                    <div className="mt-3 space-y-2">
                      {item.rewards.length ? (
                        item.rewards.map((reward) => (
                          <div
                            key={reward.id}
                            className="bg-background rounded-md border p-3 text-xs"
                          >
                            <div className="flex justify-between gap-2">
                              <strong>
                                {reward.beneficiary_type === 'referrer'
                                  ? 'Para si'
                                  : 'Para o amigo'}
                              </strong>
                              <Status status={reward.status} />
                            </div>
                            <p className="mt-1">
                              {referralRewardLabel(
                                reward.reward_type,
                                Number(reward.reward_value),
                                data.business.default_currency
                              )}
                            </p>
                            {reward.issued_at && (
                              <p className="text-muted-foreground mt-1">
                                Emitida em {formatPortalDate(reward.issued_at)}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          A recompensa será criada quando a indicação se
                          qualificar.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            ))
          ) : (
            <p className="text-muted-foreground p-8 text-center text-sm">
              Ainda não indicou ninguém. Partilhe o seu código para começar.
            </p>
          )}
        </div>
      </section>
      {(program.terms || program.public_privacy_text) && (
        <details className="border-border bg-background rounded-lg border p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Condições do programa
          </summary>
          <div className="text-muted-foreground mt-3 space-y-2 text-xs leading-5">
            {program.terms && <p>{program.terms}</p>}
            {program.public_privacy_text && (
              <p>{program.public_privacy_text}</p>
            )}
          </div>
        </details>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Indicar um amigo</DialogTitle>
            <DialogDescription>
              O contacto ficará associado ao seu código e poderá acompanhar o
              estado aqui.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <Field label="Nome do amigo">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Telefone com indicativo">
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="351912345678"
                inputMode="tel"
              />
            </Field>
            <Field label="Email (opcional)">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            {program.require_consent && (
              <label className="border-border flex items-start gap-3 rounded-md border p-3 text-xs">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>
                  Confirmo que tenho autorização para partilhar estes dados com
                  a clínica para esta indicação.
                </span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Send />}{' '}
              Registar indicação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function referralRewardLabel(type: string, value: number, currency: string) {
  if (type === 'fixed_credit')
    return `${formatCurrency(value, currency)} no cartão-saldo`;
  if (type === 'percentage') return `${value}% de desconto`;
  if (type === 'service') return 'Uma sessão oferecida';
  return 'Sem recompensa';
}

function referralEventLabel(action: string) {
  return (
    {
      created: 'Indicação registada',
      contacted: 'Amigo contactado',
      scheduled: 'Marcação criada',
      qualified: 'Indicação qualificada',
      reward_issued: 'Recompensa emitida',
      reward_redeemed: 'Recompensa utilizada',
      reward_reversed: 'Recompensa anulada',
      lost: 'Amigo desistiu',
      not_qualified: 'Indicação não qualificada',
      note: 'Atualização da equipa',
    }[action] || action
  );
}

function ProfileView({
  data,
  onRefresh,
}: {
  data: PortalData;
  onRefresh: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(() => profileFormFromClient(data.client));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  function patchProfile(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(`/api/portal/${data.settings.slug}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok)
      return toast.error(payload.error || 'Não foi possível guardar.');
    toast.success('A sua ficha foi atualizada.');
    await onRefresh();
  }
  async function uploadAvatar(file: File) {
    setUploading(true);
    const body = new FormData();
    body.set('avatar', file);
    const response = await fetch(`/api/portal/${data.settings.slug}/profile`, {
      method: 'POST',
      body,
    });
    const payload = await response.json();
    setUploading(false);
    if (!response.ok)
      return toast.error(
        payload.error || 'Não foi possível enviar a fotografia.'
      );
    toast.success('Fotografia atualizada.');
    await onRefresh();
  }
  async function removeAvatar() {
    setUploading(true);
    const response = await fetch(`/api/portal/${data.settings.slug}/profile`, {
      method: 'DELETE',
    });
    const payload = await response.json();
    setUploading(false);
    if (!response.ok)
      return toast.error(payload.error || 'Não foi possível remover.');
    toast.success('Fotografia removida.');
    await onRefresh();
  }
  const completeness = profileCompleteness(data.client);
  return (
    <div className="space-y-6">
      <PageHeading
        title="A minha ficha"
        detail="Mantenha os seus dados, preferências e consentimentos atualizados."
      />
      <section className="border-border bg-background rounded-lg border p-5">
        <div className="flex flex-wrap items-center gap-5">
          <div className="bg-primary/10 text-primary relative flex size-20 items-center justify-center overflow-hidden rounded-full text-2xl font-semibold">
            {data.client.avatar_url ? (
              <img
                src={data.client.avatar_url}
                alt={data.client.name || 'Cliente'}
                className="size-full object-cover"
              />
            ) : (
              (data.client.name || 'C').slice(0, 1).toUpperCase()
            )}
            {uploading && (
              <span className="bg-background/80 absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-5 animate-spin" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">
              {data.client.name || 'Cliente'}
            </h2>
            <p className="text-muted-foreground text-sm">
              Ref. {data.client.client_reference || 'por atribuir'} · cliente
              desde{' '}
              {new Date(data.client.created_at).toLocaleDateString('pt-PT')}
            </p>
            <div className="mt-2 flex max-w-md items-center gap-2">
              <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full"
                  style={{ width: `${completeness}%` }}
                />
              </div>
              <span className="text-muted-foreground text-xs">
                Ficha {completeness}%
              </span>
            </div>
          </div>
          {data.settings.profileEditEnabled && (
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void uploadAvatar(file);
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <ImagePlus /> Fotografia
              </Button>
              {data.client.avatar_url && (
                <Button
                  variant="outline"
                  size="icon"
                  title="Remover fotografia"
                  onClick={() => void removeAvatar()}
                  disabled={uploading}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          )}
        </div>
      </section>
      <form
        onSubmit={saveProfile}
        className="border-border bg-background rounded-lg border p-5"
      >
        <div className="mb-5 flex items-center gap-2">
          <CircleUserRound className="text-primary size-5" />
          <h2 className="font-semibold">Dados pessoais e de contacto</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Nome completo">
            <Input
              value={form.name}
              onChange={(e) => patchProfile('name', e.target.value)}
              disabled={!data.settings.profileEditEnabled}
            />
          </Field>
          <Field label="Email de acesso">
            <Input value={data.client.email || ''} disabled />
            <p className="text-muted-foreground mt-1 text-[11px]">
              Para alterar o email de acesso, contacte a clínica.
            </p>
          </Field>
          <Field label="Telefone">
            <Input
              value={form.phone}
              onChange={(e) => patchProfile('phone', e.target.value)}
              disabled={!data.settings.profileEditEnabled}
            />
          </Field>
          <Field label="Data de nascimento">
            <Input
              type="date"
              value={form.birthDate}
              onChange={(e) => patchProfile('birthDate', e.target.value)}
              disabled={!data.settings.profileEditEnabled}
            />
          </Field>
          <Field label="NIF">
            <Input
              value={form.taxId}
              onChange={(e) => patchProfile('taxId', e.target.value)}
              disabled={!data.settings.profileEditEnabled}
            />
          </Field>
          <Field label="Género">
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={form.gender}
              onChange={(e) => patchProfile('gender', e.target.value)}
              disabled={!data.settings.profileEditEnabled}
            >
              <option value="">Não informado</option>
              <option value="male">Masculino</option>
              <option value="female">Feminino</option>
              <option value="non_binary">Não binário</option>
              <option value="not_informed">Prefiro não informar</option>
            </select>
          </Field>
          <Field label="Empresa">
            <Input
              value={form.company}
              onChange={(e) => patchProfile('company', e.target.value)}
              disabled={!data.settings.profileEditEnabled}
            />
          </Field>
          <Field label="Canal preferido">
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={form.preferredContact}
              onChange={(e) => patchProfile('preferredContact', e.target.value)}
              disabled={!data.settings.profileEditEnabled}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Telefone</option>
              <option value="email">Email</option>
            </select>
          </Field>
          <Field label="País">
            <Input
              value={form.country}
              onChange={(e) => patchProfile('country', e.target.value)}
              disabled={!data.settings.profileEditEnabled}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Morada">
              <Input
                value={form.addressLine}
                onChange={(e) => patchProfile('addressLine', e.target.value)}
                disabled={!data.settings.profileEditEnabled}
              />
            </Field>
          </div>
          <Field label="Código postal">
            <Input
              value={form.postalCode}
              onChange={(e) => patchProfile('postalCode', e.target.value)}
              disabled={!data.settings.profileEditEnabled}
            />
          </Field>
          <Field label="Localidade">
            <Input
              value={form.city}
              onChange={(e) => patchProfile('city', e.target.value)}
              disabled={!data.settings.profileEditEnabled}
            />
          </Field>
        </div>
        {data.client.privacy_review_status === 'legacy_unverified' && (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <strong>Confirme novamente as suas preferências.</strong>
            <p className="mt-1">
              As autorizações anteriores não possuem prova suficiente. Reveja
              cada opção abaixo e carregue em “Guardar alterações”. Nenhuma
              campanha será enviada antes desta confirmação.
            </p>
          </div>
        )}
        <div className="border-border mt-6 grid gap-3 border-t pt-5 md:grid-cols-3">
          <ConsentToggle
            label="Comunicações por WhatsApp"
            detail="Permito contactos operacionais e lembretes pelo WhatsApp."
            checked={form.whatsappConsent}
            onChange={(value) => patchProfile('whatsappConsent', value)}
            disabled={!data.settings.profileEditEnabled}
          />
          <ConsentToggle
            label="Marketing por email"
            detail="Aceito campanhas, novidades e ofertas por email."
            checked={form.marketingConsent}
            onChange={(value) => patchProfile('marketingConsent', value)}
            disabled={!data.settings.profileEditEnabled}
          />
          <ConsentToggle
            label="Marketing por WhatsApp"
            detail="Aceito campanhas e ofertas por WhatsApp. Posso retirar a autorização a qualquer momento."
            checked={form.marketingWhatsappConsent}
            onChange={(value) =>
              patchProfile('marketingWhatsappConsent', value)
            }
            disabled={!data.settings.profileEditEnabled}
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <ShieldCheck className="size-4" />
            Alterações ficam registadas no histórico da sua ficha.
          </p>
          {data.settings.profileEditEnabled && (
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Pencil />}{' '}
              Guardar alterações
            </Button>
          )}
        </div>
      </form>
      <PrivacyRightsCard slug={data.settings.slug} />
      <p className="text-muted-foreground mt-4 text-center text-xs">
        Consulte a{' '}
        <a
          className="text-primary underline"
          href="/privacidade"
          target="_blank"
          rel="noreferrer"
        >
          política de privacidade
        </a>{' '}
        aplicável ao tratamento dos seus dados.
      </p>
    </div>
  );
}

function PrivacyRightsCard({ slug }: { slug: string }) {
  const [requestType, setRequestType] = useState('access');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  async function submit() {
    setSending(true);
    try {
      const response = await fetch(
        `/api/portal/${encodeURIComponent(slug)}/privacy`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ requestType, details }),
        }
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Não foi possível enviar o pedido.');
      setDetails('');
      toast.success(
        'Pedido de privacidade registado. A clínica responderá dentro do prazo aplicável.'
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao enviar pedido.'
      );
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="border-border mt-5 rounded-xl border p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="text-primary mt-0.5 size-5" />
        <div>
          <h3 className="font-semibold">Os seus direitos de privacidade</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Peça acesso, correção, portabilidade, limitação ou apagamento dos
            seus dados. A identidade será confirmada antes da entrega ou
            eliminação.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_auto]">
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          value={requestType}
          onChange={(e) => setRequestType(e.target.value)}
        >
          <option value="access">Acesso aos dados</option>
          <option value="rectification">Retificação</option>
          <option value="portability">Portabilidade</option>
          <option value="erasure">Apagamento</option>
          <option value="restriction">Limitação</option>
          <option value="objection">Oposição</option>
          <option value="withdraw_consent">Retirar consentimento</option>
        </select>
        <Input
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Explique o pedido (opcional)"
        />
        <Button type="button" onClick={submit} disabled={sending}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}Enviar
          pedido
        </Button>
      </div>
      <div className="border-border mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          Descarregue uma cópia estruturada dos dados atualmente associados à
          sua ficha.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            window.open(
              `/api/portal/${encodeURIComponent(slug)}/privacy/export`,
              '_blank',
              'noopener,noreferrer'
            )
          }
        >
          <Download /> Descarregar os meus dados
        </Button>
      </div>
    </div>
  );
}

function profileFormFromClient(client: PortalData['client']) {
  return {
    name: client.name || '',
    phone: client.phone || '',
    company: client.company || '',
    birthDate: dateInputValue(client.birth_date),
    taxId: client.tax_id || '',
    gender: client.gender || '',
    addressLine: client.address_line || '',
    postalCode: client.postal_code || '',
    city: client.city || '',
    country: client.country || 'Portugal',
    preferredContact: client.preferred_contact || 'whatsapp',
    marketingConsent: Boolean(client.marketing_consent),
    marketingWhatsappConsent: Boolean(client.marketing_whatsapp_consent),
    whatsappConsent: Boolean(client.whatsapp_consent),
  };
}

function dateInputValue(value?: string | null) {
  if (!value) return '';
  return String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

function profileCompleteness(client: PortalData['client']) {
  const values = [
    client.name,
    client.phone,
    client.email,
    client.birth_date,
    client.tax_id,
    client.address_line,
    client.city,
    client.country,
    client.avatar_url,
  ];
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

function ConsentToggle({
  label,
  detail,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="border-border flex items-start gap-3 rounded-md border p-3">
      <input
        type="checkbox"
        className="mt-0.5 size-4"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span>
        <strong className="block text-sm">{label}</strong>
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {detail}
        </span>
      </span>
    </label>
  );
}

function BookingDialog({
  open,
  onOpenChange,
  data,
  slug,
  preferredBenefitCode,
  preferredBenefitPin,
  preferredServiceId,
  preferredProfessionalId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  data: PortalData;
  slug: string;
  preferredBenefitCode: string;
  preferredBenefitPin: string;
  preferredServiceId: string;
  preferredProfessionalId: string;
  onCreated: () => Promise<void>;
}) {
  const [serviceId, setServiceId] = useState(() =>
    data.catalog.services.some((service) => service.id === preferredServiceId) ? preferredServiceId : data.catalog.services.length === 1 ? data.catalog.services[0].id : ''
  );
  const [professionalId, setProfessionalId] = useState(() =>
    data.catalog.professionals.some((professional) => professional.id === preferredProfessionalId) ? preferredProfessionalId : data.catalog.professionals.length === 1
      ? data.catalog.professionals[0].id
      : ''
  );
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [benefitCode, setBenefitCode] = useState(preferredBenefitCode);
  const [benefitPin, setBenefitPin] = useState(preferredBenefitPin);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Defer the reset by one task. The dialog can open while its catalog is
    // streaming in; synchronous state updates in this effect caused a second
    // render during React's commit phase.
    const reset = window.setTimeout(() => {
      setServiceId(data.catalog.services.some((service) => service.id === preferredServiceId) ? preferredServiceId : data.catalog.services.length === 1 ? data.catalog.services[0].id : '');
      setProfessionalId(data.catalog.professionals.some((professional) => professional.id === preferredProfessionalId) ? preferredProfessionalId : data.catalog.professionals.length === 1 ? data.catalog.professionals[0].id : '');
      setBenefitCode(preferredBenefitCode);
      setBenefitPin(preferredBenefitPin);
      setTime('');
    }, 0);
    return () => window.clearTimeout(reset);
  }, [data.catalog.professionals, data.catalog.services, open, preferredBenefitCode, preferredBenefitPin, preferredProfessionalId, preferredServiceId]);

  const service = data.catalog.services.find((item) => item.id === serviceId);
  const professional = data.catalog.professionals.find(
    (item) => item.id === professionalId
  );
  const compatibleVouchers = data.benefits.vouchers.filter((item) =>
    item.status === 'active' &&
    (item.voucher_type === 'service'
      ? one(item.service)?.id === serviceId && Number(item.remaining_uses) > 0
      : Number(item.current_balance) > 0)
  );
  const compatiblePacks = data.benefits.packs.filter((pack) =>
    packIsAvailable(pack) && (pack.balances ?? []).some(
      (balance) =>
        balance.service &&
        one(balance.service)?.id === serviceId &&
        Number(balance.remaining_sessions) > 0
    )
  );
  useEffect(() => {
    if (!benefitCode) return;
    if (![...compatibleVouchers, ...compatiblePacks].some((item) => item.code === benefitCode)) {
      const clear = window.setTimeout(() => {
        setBenefitCode('');
        setBenefitPin('');
      }, 0);
      return () => window.clearTimeout(clear);
    }
  }, [benefitCode, compatiblePacks, compatibleVouchers]);
  const slots = useMemo(
    () =>
      buildSlots(
        date,
        professional,
        service?.duration_minutes || 60,
        data.availability
      ),
    [date, professional, service?.duration_minutes, data.availability]
  );
  function chooseBenefit(value: string) {
    setBenefitCode(value);
    const benefit = [...data.benefits.vouchers, ...data.benefits.packs].find(
      (item) => item.code === value
    );
    setBenefitPin(benefit?.pin_code ?? '');
    const voucher = data.benefits.vouchers.find((item) => item.code === value);
    if (voucher?.voucher_type === 'service') {
      const voucherServiceId = one(voucher.service)?.id;
      if (voucherServiceId) {
        setServiceId(voucherServiceId);
        setTime('');
      }
    }
  }
  async function submit() {
    if (!serviceId || !professionalId || !date || !time)
      return toast.error('Preencha serviço, profissional, data e horário.');
    if (benefitCode && !/^\d{4,8}$/.test(benefitPin))
      return toast.error('Informe o PIN do benefício para reservar a sessão.');
    setSaving(true);
    const response = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/appointments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          professionalId,
          scheduledStart: new Date(`${date}T${time}:00`).toISOString(),
          benefitCode: benefitCode || null,
          benefitPin: benefitPin || null,
          notes,
        }),
      }
    );
    const payload = await response.json();
    setSaving(false);
    if (!response.ok)
      return toast.error(payload.error || 'Não foi possível marcar.');
    if (payload.messageWarning) {
      toast.warning(
        `Sessão agendada. A confirmação pelo WhatsApp ficou pendente: ${payload.messageWarning}`
      );
    } else if (payload.messageSkipped) {
      toast.success(
        'Sessão agendada. A confirmação automática está desativada.'
      );
    } else {
      toast.success('Sessão agendada e detalhes enviados para o seu WhatsApp.');
    }
    onOpenChange(false);
    setServiceId(
      data.catalog.services.length === 1 ? data.catalog.services[0].id : ''
    );
    setProfessionalId(
      data.catalog.professionals.length === 1
        ? data.catalog.professionals[0].id
        : ''
    );
    setDate('');
    setTime('');
    setBenefitCode('');
    setBenefitPin('');
    await onCreated();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agendar sessão</DialogTitle>
          <DialogDescription>
            Escolha o serviço, profissional e horário. A disponibilidade é
            confirmada no momento da marcação.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <Field label="Serviço">
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setTime('');
              }}
            >
              <option value="">Selecionar serviço</option>
              {data.catalog.services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.duration_minutes} min ·{' '}
                  {formatCurrency(Number(item.price), item.currency)}
                </option>
              ))}
            </select>
          </Field>
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
            <strong className="block">Pressão padrão: média</strong>
            <p className="text-muted-foreground mt-0.5 text-xs">
              A pressão é aplicada de forma uniforme em todas as modalidades.
              Por segurança e conforto, o profissional pode ajustá-la durante a sessão quando necessário.
            </p>
          </div>
          <Field label="Profissional">
            {data.catalog.professionals.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.catalog.professionals.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'border-border bg-background flex min-h-16 items-center gap-3 rounded-md border p-3 text-left transition-colors',
                      professionalId === item.id &&
                        'border-primary bg-primary/5 ring-primary/20 ring-2'
                    )}
                    onClick={() => {
                      setProfessionalId(item.id);
                      setTime('');
                    }}
                  >
                    <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full font-semibold">
                      {(item.full_name || 'P').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">
                        {item.full_name}
                      </strong>
                      <span className="text-muted-foreground block truncate text-xs">
                        {item.professional_title || 'Profissional'}
                      </span>
                    </span>
                    {professionalId === item.id && (
                      <Check className="text-primary ml-auto size-4" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                A clínica ainda não disponibilizou profissionais para marcação
                online.
              </div>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <Field label="Data">
              <Input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                max={maxBookingDate(data.settings.bookingAdvanceDays)}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setTime('');
                }}
              />
            </Field>
            <Field label="Horários disponíveis">
              {!date || !professionalId || !serviceId ? (
                <div className="bg-muted/50 text-muted-foreground flex min-h-10 items-center rounded-md px-3 text-sm">
                  Escolha serviço, profissional e data.
                </div>
              ) : slots.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {slots.map((slot) => (
                    <Button
                      key={slot}
                      type="button"
                      variant={time === slot ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTime(slot)}
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Não existem horários livres nesta data. Escolha outro dia.
                </div>
              )}
            </Field>
          </div>
        </div>
        {service && (
          <div className="bg-muted/50 flex flex-wrap justify-between gap-2 rounded-md p-3 text-sm">
            <span>
              {service.name} · {service.duration_minutes} minutos
            </span>
            <strong>
              {formatCurrency(Number(service.price), service.currency)}
            </strong>
          </div>
        )}
        {data.settings.benefitsEnabled && (
          <details className="border-border rounded-lg border" open>
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Usar voucher ou pack
            </summary>
            <div className="border-border grid gap-3 border-t p-4 sm:grid-cols-2">
              <Field label="Benefício">
                <select
                  className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                  value={benefitCode}
                  onChange={(event) => chooseBenefit(event.target.value)}
                >
                  <option value="">Pagamento normal</option>
                  {compatibleVouchers
                    .map((item) => (
                      <option key={item.id} value={item.code}>
                        {item.voucher_type === 'service'
                          ? one(item.service)?.name
                          : formatCurrency(
                              Number(item.current_balance),
                              item.currency
                            )}{' '}
                        · {item.code}
                      </option>
                    ))}
                  {compatiblePacks.map((item) => (
                    <option key={item.id} value={item.code}>
                      {one(item.pack)?.name || 'Pack'} · {item.code}
                    </option>
                  ))}
                </select>
                {serviceId && !compatibleVouchers.length && !compatiblePacks.length && (
                  <p className="text-muted-foreground mt-2 text-xs">Não existe voucher ou pack ativo compatível com este serviço.</p>
                )}
              </Field>
              {benefitCode && (
                <Field label="PIN">
                  <Input
                    type="password"
                    inputMode="numeric"
                    value={benefitPin}
                    onChange={(event) =>
                      setBenefitPin(
                        event.target.value.replace(/\D/g, '').slice(0, 8)
                      )
                    }
                    maxLength={8}
                    placeholder="PIN de 4 a 8 dígitos"
                  />
                  <p className="text-muted-foreground mt-1 text-xs">
                    O PIN confirma que este pack ou voucher pertence à sua
                    ficha.
                  </p>
                </Field>
              )}
            </div>
            {benefitCode && benefitPin && (
              <p className="border-border bg-muted/40 border-t px-4 py-2.5 text-xs text-muted-foreground">
                Benefício pronto para usar: o código e o PIN foram preenchidos automaticamente e serão associados à marcação.
              </p>
            )}
          </details>
        )}
        <Field label="Observações">
          <textarea
            className="border-input bg-background min-h-20 w-full rounded-md border p-3 text-sm"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Preferências ou informação útil para a clínica"
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Confirmar marcação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildSlots(
  date: string,
  professional: PortalData['catalog']['professionals'][number] | undefined,
  durationMinutes: number,
  availability: PortalData['availability']
) {
  if (!date || !professional) return [];
  const professionalId = professional.id;
  const slots: string[] = [];
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayKey = dayKeys[new Date(`${date}T12:00:00`).getDay()];
  const hours = professional.working_hours?.[dayKey] as
    | {
        enabled?: boolean;
        start?: string;
        end?: string;
        breakStart?: string;
        breakEnd?: string;
      }
    | undefined;
  if (hours?.enabled === false) return [];
  const toMinutes = (value: string | undefined, fallback: number) => {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return fallback;
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  };
  const dayStart = toMinutes(hours?.start, 9 * 60);
  const dayEnd = toMinutes(hours?.end, 21 * 60);
  const breakStart = toMinutes(hours?.breakStart, -1);
  const breakEnd = toMinutes(hours?.breakEnd, -1);
  for (
    let minutes = dayStart;
    minutes + durationMinutes <= dayEnd;
    minutes += 30
  ) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    const start = new Date(`${date}T${hour}:${minute}:00`);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    if (start <= new Date()) continue;
    if (
      breakStart >= 0 &&
      breakEnd >= 0 &&
      minutes < breakEnd &&
      minutes + durationMinutes > breakStart
    )
      continue;
    const collision =
      availability.busy.some(
        (item) =>
          item.professional_profile_id === professionalId &&
          new Date(item.scheduled_start) < end &&
          new Date(item.scheduled_end) > start
      ) ||
      availability.blocks.some(
        (item) =>
          (!item.professional_profile_id ||
            item.professional_profile_id === professionalId) &&
          new Date(item.starts_at) < end &&
          new Date(item.ends_at) > start
      );
    if (!collision) slots.push(`${hour}:${minute}`);
  }
  return slots;
}

function PortalMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Gift;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="border-border bg-background rounded-lg border p-4">
      <div className="flex justify-between">
        <span className="text-muted-foreground text-xs">{label}</span>
        <Icon className="text-primary size-4" />
      </div>
      <strong className="mt-2 block text-xl">{value}</strong>
      <span className="text-muted-foreground mt-1 block truncate text-xs">
        {detail}
      </span>
    </article>
  );
}
function QuickLink({
  icon: Icon,
  label,
  detail,
  onClick,
}: {
  icon: typeof Gift;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="border-border bg-background hover:border-primary/40 flex items-center gap-3 rounded-lg border p-4 text-left"
    >
      <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md">
        <Icon className="size-4" />
      </span>
      <span>
        <strong className="block text-sm">{label}</strong>
        <span className="text-muted-foreground text-xs">{detail}</span>
      </span>
      <ChevronRight className="text-muted-foreground ml-auto size-4" />
    </button>
  );
}
function MobileNav({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-16 min-w-20 shrink-0 flex-col items-center justify-center gap-1 text-[10px]',
        active ? 'text-primary' : 'text-muted-foreground'
      )}
    >
      <Icon className="size-5" />
      {label}
    </button>
  );
}
function PageHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
      </div>
      {action}
    </div>
  );
}
function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
  onAction,
}: {
  icon: typeof Gift;
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <section className="border-border bg-background flex flex-col items-center rounded-lg border border-dashed p-10 text-center">
      <Icon className="text-muted-foreground size-8" />
      <h2 className="mt-3 font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">{detail}</p>
      {action && onAction && (
        <Button className="mt-4" onClick={onAction}>
          {action}
        </Button>
      )}
    </section>
  );
}
function Status({ status }: { status: string }) {
  const negative = ['cancelled', 'no_show', 'expired', 'refunded'].includes(
    status
  );
  const positive = ['confirmed', 'completed', 'paid', 'active'].includes(
    status
  );
  return (
    <Badge
      variant={negative ? 'destructive' : positive ? 'default' : 'secondary'}
    >
      {STATUS[status] || status}
    </Badge>
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
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
function formatPortalDate(value: string) {
  return new Date(value).toLocaleString('pt-PT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function maxBookingDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return portalDateInput(date);
}
function portalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function portalDateTimeInput(date: Date) {
  return `${portalDateInput(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function PortalLoading() {
  return (
    <main className="bg-background flex min-h-screen items-center justify-center">
      <Loader2 className="text-primary size-7 animate-spin" />
    </main>
  );
}
function PortalUnavailable() {
  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <ShieldCheck className="text-muted-foreground mx-auto size-10" />
        <h1 className="mt-4 text-2xl font-semibold">Portal indisponível</h1>
        <p className="text-muted-foreground mt-2">
          Confirme o endereço com a clínica.
        </p>
      </div>
    </main>
  );
}
