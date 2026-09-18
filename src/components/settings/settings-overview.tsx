'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleDashed,
  Database,
  FileText,
  Gauge,
  Globe2,
  Languages,
  LayoutDashboard,
  Link2,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { CURRENCIES } from '@/lib/currency';
import { cn } from '@/lib/utils';

import { SettingsChip, StatusDot } from './settings-chip';
import { ROLE_META } from './role-meta';
import {
  canAccessSettingsSection,
  type SettingsSection,
} from './settings-sections';

interface OverviewCounts {
  members: number | null;
  pendingInvites: number | null;
  templates: number | null;
  templatesPending: number | null;
  tags: number | null;
  customFields: number | null;
}

interface WhatsAppStatus {
  configured: boolean;
  connected: boolean;
}

type CheckState = 'complete' | 'warning' | 'pending';

interface ReadinessCheck {
  id: string;
  section: SettingsSection;
  icon: LucideIcon;
  state: CheckState;
  title: string;
  description: string;
  action: string;
}

export function SettingsOverview({
  onSelect,
}: {
  onSelect: (section: SettingsSection) => void;
}) {
  const {
    user,
    profile,
    account,
    accountId,
    accountRole,
    defaultCurrency,
    canManageMembers,
  } = useAuth();
  const t = useTranslations('Settings.overview');
  const tRoles = useTranslations('roles');

  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(true);
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !accountId) return;
    let cancelled = false;
    const supabase = createClient();
    const acctId = accountId;

    (async () => {
      setCountsLoading(true);
      const [
        membersRes,
        invitesRes,
        templatesTotal,
        templatesPending,
        tagsRes,
        fieldsRes,
      ] = await Promise.allSettled([
        fetch('/api/account/members', { cache: 'no-store' }).then((r) =>
          r.json()
        ),
        canManageMembers
          ? fetch('/api/account/invitations', { cache: 'no-store' }).then((r) =>
              r.json()
            )
          : Promise.resolve(null),
        supabase
          .from('message_templates')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('message_templates')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'PENDING'),
        supabase
          .from('tags')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('custom_fields')
          .select('id', { count: 'exact', head: true }),
      ]);

      if (cancelled) return;

      const members =
        membersRes.status === 'fulfilled' &&
        Array.isArray(membersRes.value?.members)
          ? membersRes.value.members.length
          : null;
      const pendingInvites =
        invitesRes.status === 'fulfilled' &&
        invitesRes.value &&
        Array.isArray(invitesRes.value.invitations)
          ? invitesRes.value.invitations.length
          : null;

      setCounts({
        members,
        pendingInvites,
        templates:
          templatesTotal.status === 'fulfilled'
            ? (templatesTotal.value.count ?? null)
            : null,
        templatesPending:
          templatesPending.status === 'fulfilled'
            ? (templatesPending.value.count ?? null)
            : null,
        tags:
          tagsRes.status === 'fulfilled' ? (tagsRes.value.count ?? null) : null,
        customFields:
          fieldsRes.status === 'fulfilled'
            ? (fieldsRes.value.count ?? null)
            : null,
      });
      setCountsLoading(false);
    })();

    const checkWhatsappStatus = async (showLoading = false) => {
      if (showLoading) setWhatsappLoading(true);
      const [row, health, qr] = await Promise.allSettled([
        supabase
          .from('whatsapp_config')
          .select('phone_number_id')
          .eq('account_id', acctId)
          .maybeSingle(),
        fetch('/api/whatsapp/config', { cache: 'no-store' }).then((r) =>
          r.json()
        ),
        fetch('/api/whatsapp/baileys/status?autostart=false', {
          cache: 'no-store',
        }).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (cancelled) return;

      const qrConnected = qr.status === 'fulfilled' && !!qr.value?.connected;
      setWhatsapp({
        configured:
          qrConnected ||
          (row.status === 'fulfilled' && !!row.value.data?.phone_number_id),
        connected:
          qrConnected ||
          (health.status === 'fulfilled' && !!health.value?.connected),
      });
      setWhatsappLoading(false);
    };

    const handleFocus = () => void checkWhatsappStatus(false);
    void checkWhatsappStatus(true);
    const whatsappInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkWhatsappStatus(false);
      }
    }, 15000);
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(whatsappInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [userId, accountId, canManageMembers]);

  const accountName = account?.name?.trim() || t('workspaceFallback');
  const accountInitials = accountName.slice(0, 2).toUpperCase();
  const roleMeta = accountRole ? ROLE_META[accountRole] : null;
  const RoleIcon = roleMeta?.icon;
  const currencyLabel =
    CURRENCIES.find((c) => c.code === defaultCurrency)?.label ??
    defaultCurrency;

  const checks: ReadinessCheck[] = useMemo(() => {
    const hasStructuredData =
      ((counts?.tags ?? 0) > 0 || (counts?.customFields ?? 0) > 0) &&
      !countsLoading;
    const hasTemplates =
      ((counts?.templates ?? 0) > 0 || (counts?.templatesPending ?? 0) > 0) &&
      !countsLoading;

    return [
      {
        id: 'workspace',
        section: 'general',
        icon: Building2,
        state:
          account?.name && account?.crm_locale && account?.timezone
            ? 'complete'
            : 'warning',
        title: t('checks.workspace.title'),
        description: t('checks.workspace.desc'),
        action: t('checks.workspace.action'),
      },
      {
        id: 'channel',
        section: 'whatsapp',
        icon: MessageSquareText,
        state: whatsappLoading
          ? 'pending'
          : whatsapp?.connected
            ? 'complete'
            : 'warning',
        title: t('checks.channel.title'),
        description: whatsapp?.configured
          ? t('checks.channel.descConfigured')
          : t('checks.channel.descMissing'),
        action: t('checks.channel.action'),
      },
      {
        id: 'team',
        section: 'members',
        icon: UsersRound,
        state: countsLoading
          ? 'pending'
          : (counts?.members ?? 0) > 0
            ? 'complete'
            : 'warning',
        title: t('checks.team.title'),
        description:
          counts?.members == null
            ? t('checks.team.descUnknown')
            : t('checks.team.desc', {
                count: counts.members,
                invites: counts.pendingInvites ?? 0,
              }),
        action: t('checks.team.action'),
      },
      {
        id: 'library',
        section: 'quick-replies',
        icon: FileText,
        state: countsLoading
          ? 'pending'
          : hasTemplates
            ? 'complete'
            : 'warning',
        title: t('checks.library.title'),
        description:
          counts?.templates == null
            ? t('checks.library.descUnknown')
            : t('checks.library.desc', {
                count: counts.templates,
                pending: counts.templatesPending ?? 0,
              }),
        action: t('checks.library.action'),
      },
      {
        id: 'data',
        section: 'fields',
        icon: Database,
        state: countsLoading
          ? 'pending'
          : hasStructuredData
            ? 'complete'
            : 'warning',
        title: t('checks.data.title'),
        description:
          counts?.tags == null && counts?.customFields == null
            ? t('checks.data.descUnknown')
            : t('checks.data.desc', {
                tags: counts?.tags ?? 0,
                fields: counts?.customFields ?? 0,
              }),
        action: t('checks.data.action'),
      },
      {
        id: 'security',
        section: 'security',
        icon: ShieldCheck,
        state: profile?.email && accountRole ? 'complete' : 'warning',
        title: t('checks.security.title'),
        description: t('checks.security.desc'),
        action: t('checks.security.action'),
      },
    ];
  }, [
    account?.name,
    account?.crm_locale,
    account?.timezone,
    accountRole,
    counts,
    countsLoading,
    profile?.email,
    t,
    whatsapp?.configured,
    whatsapp?.connected,
    whatsappLoading,
  ]);

  const accessibleChecks = checks.filter((check) =>
    canAccessSettingsSection(accountRole, check.section)
  );
  const knownChecks = accessibleChecks.filter(
    (check) => check.state !== 'pending'
  );
  const completedChecks = knownChecks.filter(
    (check) => check.state === 'complete'
  ).length;
  const readiness = knownChecks.length
    ? Math.round((completedChecks / knownChecks.length) * 100)
    : 0;
  const recommendations = accessibleChecks
    .filter((check) => check.state === 'warning')
    .slice(0, 3);

  const healthCards = [
    {
      title: t('health.channel.title'),
      icon: MessageSquareText,
      state: whatsappLoading
        ? 'pending'
        : whatsapp?.connected
          ? 'complete'
          : 'warning',
      value: whatsappLoading
        ? t('checking')
        : whatsapp?.connected
          ? t('health.channel.connected')
          : whatsapp?.configured
            ? t('health.channel.reconnect')
            : t('health.channel.missing'),
      detail: t('health.channel.detail'),
    },
    {
      title: t('health.team.title'),
      icon: UsersRound,
      state: countsLoading
        ? 'pending'
        : (counts?.members ?? 0) > 0
          ? 'complete'
          : 'warning',
      value: countsLoading
        ? t('checking')
        : t('health.team.value', { count: counts?.members ?? 0 }),
      detail: t('health.team.detail', {
        invites: counts?.pendingInvites ?? 0,
      }),
    },
    {
      title: t('health.messaging.title'),
      icon: FileText,
      state: countsLoading
        ? 'pending'
        : (counts?.templates ?? 0) > 0 || (counts?.templatesPending ?? 0) > 0
          ? 'complete'
          : 'warning',
      value: countsLoading
        ? t('checking')
        : t('health.messaging.value', {
            count: counts?.templates ?? 0,
          }),
      detail: t('health.messaging.detail', {
        pending: counts?.templatesPending ?? 0,
      }),
    },
    {
      title: t('health.data.title'),
      icon: Database,
      state: countsLoading
        ? 'pending'
        : (counts?.tags ?? 0) > 0 || (counts?.customFields ?? 0) > 0
          ? 'complete'
          : 'warning',
      value: countsLoading
        ? t('checking')
        : t('health.data.value', {
            tags: counts?.tags ?? 0,
            fields: counts?.customFields ?? 0,
          }),
      detail: t('health.data.detail'),
    },
  ] satisfies Array<{
    title: string;
    icon: LucideIcon;
    state: CheckState;
    value: string;
    detail: string;
  }>;

  const facts = [
    {
      icon: Building2,
      label: t('facts.crm'),
      value: accountName,
    },
    {
      icon: Languages,
      label: t('facts.language'),
      value: account?.crm_locale === 'en' ? 'English' : 'Português',
    },
    {
      icon: Globe2,
      label: t('facts.timezone'),
      value: account?.timezone ?? 'Europe/Lisbon',
    },
    {
      icon: LayoutDashboard,
      label: t('facts.navigation'),
      value:
        account?.navigation_layout === 'topbar'
          ? t('facts.topbar')
          : t('facts.sidebar'),
    },
    {
      icon: WalletCards,
      label: t('facts.currency'),
      value: `${defaultCurrency} · ${currencyLabel}`,
    },
    {
      icon: Link2,
      label: t('facts.publicUrl'),
      value: account?.public_url ?? t('notConfigured'),
    },
  ];

  return (
    <section className="animate-in fade-in-50 space-y-4 duration-200">
      <Card className="border-primary/15 from-primary-soft/40 via-card to-card bg-gradient-to-br">
        <CardContent className="grid gap-5 py-1 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="size-16 rounded-xl after:rounded-xl">
              {account?.logo_url ? (
                <AvatarImage
                  src={account.logo_url}
                  alt={accountName}
                  className="rounded-xl"
                />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground rounded-xl text-lg font-semibold">
                {accountInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-primary mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] uppercase">
                <Sparkles className="size-3.5" />
                {t('heroEyebrow')}
              </div>
              <h2 className="text-foreground text-2xl font-semibold tracking-tight">
                {t('heroTitle')}
              </h2>
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
                {t('heroDesc', { name: accountName })}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {roleMeta && RoleIcon ? (
                  <SettingsChip variant={roleMeta.variant}>
                    <RoleIcon />
                    {tRoles(accountRole!)}
                  </SettingsChip>
                ) : null}
                <SettingsChip variant={whatsapp?.connected ? 'ok' : 'muted'}>
                  <StatusDot tone={whatsapp?.connected ? 'ok' : 'muted'} />
                  {whatsappLoading
                    ? t('checking')
                    : whatsapp?.connected
                      ? t('connected')
                      : t('needsAttention')}
                </SettingsChip>
              </div>
            </div>
          </div>

          <div className="border-primary/20 bg-background/70 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs font-medium">
                  {t('readinessLabel')}
                </p>
                <p className="text-foreground mt-1 text-3xl font-semibold">
                  {readiness}%
                </p>
              </div>
              <Gauge className="text-primary size-9" />
            </div>
            <div className="bg-muted mt-4 h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${readiness}%` }}
              />
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {t('readinessDetail', {
                complete: completedChecks,
                total: knownChecks.length,
              })}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BadgeCheck className="text-primary size-4" />
                {t('healthTitle')}
              </CardTitle>
              <CardDescription>{t('healthDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {healthCards.map((card) => (
                <HealthCard key={card.title} {...card} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="text-primary size-4" />
                {t('recommendationsTitle')}
              </CardTitle>
              <CardDescription>{t('recommendationsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <div className="border-border bg-muted/30 rounded-xl border p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                      <CheckCircle2 className="size-4" />
                    </span>
                    <div>
                      <p className="text-foreground text-sm font-semibold">
                        {t('allGoodTitle')}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {t('allGoodDesc')}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((item) => (
                    <RecommendationRow
                      key={item.id}
                      item={item}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle>{t('factsTitle')}</CardTitle>
            <CardDescription>{t('factsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {facts.map((fact) => (
              <FactRow key={fact.label} {...fact} />
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function HealthCard({
  title,
  icon: Icon,
  state,
  value,
  detail,
}: {
  title: string;
  icon: LucideIcon;
  state: CheckState;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-border bg-muted/20 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-lg',
              state === 'complete'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                : state === 'pending'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
            )}
          >
            <Icon className="size-4" />
          </span>
          <p className="text-foreground text-sm font-semibold">{title}</p>
        </div>
        <StateIcon state={state} />
      </div>
      <p className="text-foreground mt-3 text-lg font-semibold">{value}</p>
      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
        {detail}
      </p>
    </div>
  );
}

function RecommendationRow({
  item,
  onSelect,
}: {
  item: ReadinessCheck;
  onSelect: (section: SettingsSection) => void;
}) {
  const Icon = item.icon;

  return (
    <div className="border-border bg-muted/20 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-300">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">{item.title}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {item.description}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onSelect(item.section)}
      >
        {item.action}
        <ArrowRight className="size-3.5" />
      </Button>
    </div>
  );
}

function FactRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="border-border bg-muted/20 flex items-center gap-3 rounded-lg border p-3">
      <span className="bg-primary-soft text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-foreground truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function StateIcon({ state }: { state: CheckState }) {
  if (state === 'pending') {
    return <Loader2 className="text-muted-foreground size-4 animate-spin" />;
  }
  if (state === 'complete') {
    return <CheckCircle2 className="size-4 text-emerald-500" />;
  }
  return <CircleDashed className="size-4 text-amber-500" />;
}
