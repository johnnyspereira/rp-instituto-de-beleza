'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Bot,
  Briefcase,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Inbox,
  MessageCircle,
  Radio,
  Send,
  UserRound,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { formatCurrencyShort } from '@/lib/currency';
import type {
  AutomationInsights,
  DashboardAlert,
  InboxOperations,
  SalesInsights,
  TeamPerformance,
  WhatsAppHealth,
} from '@/lib/dashboard/types';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

type Icon = ComponentType<{ className?: string }>;
type MetricTone = 'muted' | 'blue' | 'amber' | 'green' | 'red' | 'violet';

const ALERT_TONES: Record<DashboardAlert['tone'], string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export function DashboardAlertsPanel({
  whatsapp,
  inbox,
  sales,
  automation,
  loading,
}: {
  whatsapp: WhatsAppHealth | null;
  inbox: InboxOperations | null;
  sales: SalesInsights | null;
  automation: AutomationInsights | null;
  loading: boolean;
}) {
  const t = useTranslations('Dashboard.alerts');
  const alerts = buildLocalizedAlerts(
    { whatsapp, inbox, sales, automation },
    t
  );

  return (
    <section className="border-border bg-card rounded-xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-foreground text-base font-semibold">
            {t('title')}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('description')}
          </p>
        </div>
        <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <AlertTriangle className="h-4 w-4" />
        </div>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-2/3" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{t('allGood')}</span>
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {alerts.map((alert) => (
            <Link
              key={alert.id}
              href={alert.href ?? '/dashboard'}
              className={cn(
                'hover:bg-muted/60 flex items-start justify-between gap-3 rounded-lg border px-3 py-2 transition-colors',
                ALERT_TONES[alert.tone]
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{alert.title}</span>
                <span className="mt-0.5 block text-xs opacity-80">
                  {alert.detail}
                </span>
              </span>
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function WhatsAppHealthCard({
  data,
  loading,
}: {
  data: WhatsAppHealth | null;
  loading: boolean;
}) {
  const t = useTranslations('Dashboard.whatsappHealth');
  const connected = Boolean(data?.qrConnected || data?.metaConnected);
  const Icon = connected ? Wifi : WifiOff;

  return (
    <WidgetCard
      title={t('title')}
      description={t('description')}
      icon={Icon}
      className={connected ? 'border-emerald-200' : 'border-amber-200'}
    >
      {loading ? (
        <PanelSkeleton rows={4} />
      ) : !data ? (
        <PanelUnavailable />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <HealthItem
              label={t('qrSession')}
              value={data.qrConnected ? t('online') : t('offline')}
              detail={
                data.qrConnectedForSeconds
                  ? t('connectedFor', {
                      duration: formatDuration(data.qrConnectedForSeconds),
                    })
                  : t('state', { state: data.qrState })
              }
              tone={data.qrConnected ? 'success' : 'warning'}
            />
            <HealthItem
              label={t('metaApi')}
              value={data.metaConnected ? t('online') : t('offline')}
              detail={
                data.metaConnectedAt
                  ? formatDateTime(data.metaConnectedAt)
                  : t('notConfigured')
              }
              tone={data.metaConnected ? 'success' : 'muted'}
            />
            <HealthItem
              label={t('lastInbound')}
              value={formatDateTime(data.lastInboundAt) || t('noData')}
              detail={t('customerMessages')}
              tone="muted"
            />
            <HealthItem
              label={t('lastOutbound')}
              value={formatDateTime(data.lastOutboundAt) || t('noData')}
              detail={t('sentMessages')}
              tone="muted"
            />
          </div>
          {data.qrLastError ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {data.qrLastError}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionLink
              href="/settings?tab=whatsapp"
              label={t('openSettings')}
            />
            <ActionLink href="/inbox" label={t('openInbox')} />
          </div>
        </>
      )}
    </WidgetCard>
  );
}

export function InboxOperationsPanel({
  data,
  loading,
}: {
  data: InboxOperations | null;
  loading: boolean;
}) {
  const t = useTranslations('Dashboard.inboxOps');

  return (
    <WidgetCard title={t('title')} description={t('description')} icon={Inbox}>
      {loading ? (
        <PanelSkeleton rows={6} />
      ) : !data ? (
        <PanelUnavailable />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <InboxHeroMetric
                label={t('open')}
                value={data.open}
                icon={MessageCircle}
                tone="blue"
              />
              <InboxHeroMetric
                label={t('pending')}
                value={data.pending}
                icon={Clock}
                tone="amber"
              />
              <InboxHeroMetric
                label={t('unread')}
                value={data.unread}
                icon={Inbox}
                tone="violet"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <InboxMetricGroup title={t('crmQueueTitle')}>
                <InboxMetricLine
                  label={t('unassigned')}
                  value={data.unassigned}
                  icon={Users}
                  tone="amber"
                />
                <InboxMetricLine
                  label={t('withoutDeal')}
                  value={data.withoutDeal}
                  icon={Briefcase}
                />
                <InboxMetricLine
                  label={t('automationActive')}
                  value={data.automationActive}
                  icon={Zap}
                  tone="violet"
                />
              </InboxMetricGroup>

              <InboxMetricGroup title={t('replyQueueTitle')}>
                <InboxMetricLine
                  label={t('waitingAgent')}
                  value={data.waitingAgent}
                  icon={UserRound}
                  tone="amber"
                />
                <InboxMetricLine
                  label={t('waitingCustomer')}
                  value={data.waitingCustomer}
                  icon={Send}
                  tone="blue"
                />
                <InboxMetricLine
                  label={t('closed')}
                  value={data.closed}
                  icon={CheckCircle2}
                  tone="green"
                />
              </InboxMetricGroup>
            </div>
          </div>

          <div className="bg-muted/35 min-w-0 rounded-lg p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-foreground text-sm font-semibold">
                {t('criticalTitle')}
              </h3>
              <Link
                href="/inbox"
                className="text-primary text-xs font-medium hover:underline"
              >
                {t('viewInbox')}
              </Link>
            </div>
            {data.critical.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('noCritical')}</p>
            ) : (
              <div className="space-y-2.5">
                {data.critical.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="hover:bg-card flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                  >
                    <div className="bg-card text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                      {item.contactName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-foreground truncate text-sm font-medium">
                          {item.contactName}
                        </p>
                        {item.unreadCount > 0 ? (
                          <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                            {item.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {item.lastMessageText ||
                          item.contactPhone ||
                          t('noPreview')}
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatShortDate(item.lastMessageAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

export function SalesInsightsPanel({
  data,
  loading,
  currency,
}: {
  data: SalesInsights | null;
  loading: boolean;
  currency: string;
}) {
  const t = useTranslations('Dashboard.sales');

  return (
    <WidgetCard
      title={t('title')}
      description={t('description')}
      icon={DollarSign}
    >
      {loading ? (
        <PanelSkeleton rows={5} />
      ) : !data ? (
        <PanelUnavailable />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <StatBlock
              label={t('activeDeals')}
              value={data.activeDeals}
              icon={Briefcase}
            />
            <StatBlock
              label={t('wonToday')}
              value={data.wonDealsToday}
              icon={CheckCircle2}
              tone="green"
            />
            <StatBlock
              label={t('stalledDeals')}
              value={data.stalledDeals}
              icon={Clock}
              tone="amber"
            />
            <StatBlock
              label={t('withoutDeal')}
              value={data.noDealConversations}
              icon={MessageCircle}
            />
          </div>
          <div className="bg-muted/35 rounded-lg p-3">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              {t('forecast')}
            </p>
            <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">
              {formatCurrencyShort(data.forecastValue, currency)}
            </p>
          </div>
          <div className="bg-muted/35 rounded-lg p-3">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              {t('topStage')}
            </p>
            {data.topStage ? (
              <div className="mt-1 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-semibold">
                    {data.topStage.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('dealsInStage', { count: data.topStage.count })}
                  </p>
                </div>
                <p className="text-foreground shrink-0 text-sm font-semibold">
                  {formatCurrencyShort(data.topStage.value, currency)}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">
                {t('noStage')}
              </p>
            )}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

export function AutomationInsightsPanel({
  data,
  loading,
}: {
  data: AutomationInsights | null;
  loading: boolean;
}) {
  const t = useTranslations('Dashboard.automation');

  return (
    <WidgetCard title={t('title')} description={t('description')} icon={Bot}>
      {loading ? (
        <PanelSkeleton rows={6} />
      ) : !data ? (
        <PanelUnavailable />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <StatBlock
            label={t('activeAutomations')}
            value={data.activeAutomations}
            icon={Zap}
            tone="violet"
          />
          <StatBlock
            label={t('inactiveAutomations')}
            value={data.inactiveAutomations}
            icon={Clock}
          />
          <StatBlock
            label={t('triggeredToday')}
            value={data.triggeredToday}
            icon={Radio}
            tone="blue"
          />
          <StatBlock
            label={t('failed24h')}
            value={data.failedLogs24h}
            icon={AlertTriangle}
            tone="red"
          />
          <StatBlock
            label={t('activeFlows')}
            value={data.activeFlowRuns}
            icon={Bot}
            tone="green"
          />
          <StatBlock
            label={t('pausedByAgent')}
            value={data.pausedByAgent}
            icon={UserRound}
            tone="amber"
          />
          <div className="bg-muted/35 col-span-2 rounded-lg p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm font-medium">
                {t('aiGenerated')}
              </span>
              <span className="text-foreground text-lg font-bold tabular-nums">
                {data.aiGeneratedToday.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

export function TeamPerformancePanel({
  data,
  loading,
}: {
  data: TeamPerformance | null;
  loading: boolean;
}) {
  const t = useTranslations('Dashboard.team');
  const maxAssigned = Math.max(
    1,
    ...(data?.agents.map((agent) => agent.assignedOpen) ?? [0])
  );

  return (
    <WidgetCard title={t('title')} description={t('description')} icon={Users}>
      {loading ? (
        <PanelSkeleton rows={5} />
      ) : !data ? (
        <PanelUnavailable />
      ) : (
        <div className="space-y-3">
          <div className="bg-muted/35 flex items-center justify-between rounded-lg px-3 py-2">
            <span className="text-muted-foreground text-sm font-medium">
              {t('unassignedOpen')}
            </span>
            <span className="text-foreground text-lg font-bold tabular-nums">
              {data.unassignedOpen.toLocaleString()}
            </span>
          </div>
          {data.agents.length === 0 ? (
            <p className="bg-muted/35 text-muted-foreground rounded-lg px-3 py-4 text-sm">
              {t('noAgents')}
            </p>
          ) : (
            <div className="space-y-2">
              {data.agents.map((agent) => (
                <div key={agent.id} className="bg-muted/35 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-semibold">
                        {agent.name}
                      </p>
                      {agent.email ? (
                        <p className="text-muted-foreground truncate text-xs">
                          {agent.email}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground text-right text-xs">
                      <p>
                        <span className="text-foreground font-semibold">
                          {agent.sentToday.toLocaleString()}
                        </span>{' '}
                        {t('sentToday')}
                      </p>
                      <p>
                        {t('avgResponse', {
                          time: formatMinutes(agent.avgResponseMinutes),
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-muted-foreground flex items-center justify-between text-xs">
                      <span>{t('assignedOpen')}</span>
                      <span>{agent.assignedOpen.toLocaleString()}</span>
                    </div>
                    <div className="bg-card mt-1 h-2 rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{
                          width: `${Math.max(8, (agent.assignedOpen / maxAssigned) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

function WidgetCard({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description: string;
  icon: Icon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'border-border bg-card h-full rounded-xl border p-5',
        className
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground text-base font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        </div>
        <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {children}
    </section>
  );
}

function InboxHeroMetric({
  label,
  value,
  icon: Icon,
  tone = 'muted',
}: {
  label: string;
  value: number;
  icon: Icon;
  tone?: MetricTone;
}) {
  return (
    <div className="bg-muted/35 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">
          {label}
        </span>
        <Icon className={cn('h-4 w-4 shrink-0', metricToneClass(tone))} />
      </div>
      <p className="text-foreground mt-3 text-3xl font-bold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function InboxMetricGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-muted/25 rounded-lg p-3">
      <h3 className="text-muted-foreground mb-3 text-xs font-semibold uppercase">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InboxMetricLine({
  label,
  value,
  icon: Icon,
  tone = 'muted',
}: {
  label: string;
  value: number;
  icon: Icon;
  tone?: MetricTone;
}) {
  return (
    <div className="bg-card/60 flex min-h-12 items-center justify-between gap-3 rounded-lg px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', metricToneClass(tone))} />
        <span className="text-muted-foreground text-sm leading-snug">
          {label}
        </span>
      </div>
      <span className="text-foreground shrink-0 text-lg font-bold tabular-nums">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function StatBlock({
  label,
  value,
  icon: Icon,
  tone = 'muted',
}: {
  label: string;
  value: number;
  icon: Icon;
  tone?: MetricTone;
}) {
  return (
    <div className="bg-muted/35 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground truncate text-xs font-medium">
          {label}
        </span>
        <Icon className={cn('h-4 w-4 shrink-0', metricToneClass(tone))} />
      </div>
      <p className="text-foreground mt-2 text-xl font-bold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function metricToneClass(tone: MetricTone) {
  return {
    muted: 'text-muted-foreground',
    blue: 'text-sky-500',
    amber: 'text-amber-500',
    green: 'text-emerald-500',
    red: 'text-red-500',
    violet: 'text-primary',
  }[tone];
}

function HealthItem({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'success' | 'warning' | 'muted';
}) {
  const dotClass =
    tone === 'success'
      ? 'bg-emerald-500'
      : tone === 'warning'
        ? 'bg-amber-500'
        : 'bg-muted-foreground';

  return (
    <div className="bg-muted/35 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', dotClass)} />
        <span className="text-muted-foreground text-xs font-medium uppercase">
          {label}
        </span>
      </div>
      <p className="text-foreground mt-2 text-sm font-semibold">{value}</p>
      <p className="text-muted-foreground mt-0.5 truncate text-xs">{detail}</p>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="border-border text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </Link>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn('h-10 w-full', index === rows - 1 ? 'w-2/3' : '')}
        />
      ))}
    </div>
  );
}

function PanelUnavailable() {
  return (
    <div className="text-muted-foreground flex min-h-32 items-center justify-center text-center text-sm">
      Dados indisponíveis. Atualize o Dashboard para tentar novamente.
    </div>
  );
}

function buildLocalizedAlerts(
  input: {
    whatsapp: WhatsAppHealth | null;
    inbox: InboxOperations | null;
    sales: SalesInsights | null;
    automation: AutomationInsights | null;
  },
  t: ReturnType<typeof useTranslations>
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  if (
    input.whatsapp &&
    !input.whatsapp.qrConnected &&
    !input.whatsapp.metaConnected
  ) {
    alerts.push({
      id: 'whatsapp-offline',
      tone: 'critical',
      title: t('whatsappDisconnectedTitle'),
      detail: t('whatsappDisconnectedDetail'),
      href: '/settings?tab=whatsapp',
    });
  } else if (input.whatsapp?.qrConnected) {
    alerts.push({
      id: 'whatsapp-online',
      tone: 'success',
      title: t('whatsappOnlineTitle'),
      detail: t('whatsappOnlineDetail', {
        user: input.whatsapp.qrUserJid ?? t('qrSessionFallback'),
      }),
      href: '/settings?tab=whatsapp',
    });
  }

  if ((input.inbox?.waitingAgent ?? 0) > 0) {
    alerts.push({
      id: 'waiting-agent',
      tone: 'warning',
      title: t('waitingAgentTitle'),
      detail: t('waitingAgentDetail', {
        count: input.inbox?.waitingAgent ?? 0,
      }),
      href: '/inbox',
    });
  }

  if ((input.inbox?.unassigned ?? 0) > 0) {
    alerts.push({
      id: 'unassigned',
      tone: 'info',
      title: t('unassignedTitle'),
      detail: t('unassignedDetail', { count: input.inbox?.unassigned ?? 0 }),
      href: '/inbox',
    });
  }

  if ((input.automation?.failedLogs24h ?? 0) > 0) {
    alerts.push({
      id: 'automation-failed',
      tone: 'critical',
      title: t('automationFailedTitle'),
      detail: t('automationFailedDetail', {
        count: input.automation?.failedLogs24h ?? 0,
      }),
      href: '/automations',
    });
  }

  if ((input.sales?.stalledDeals ?? 0) > 0) {
    alerts.push({
      id: 'stalled-deals',
      tone: 'warning',
      title: t('stalledDealsTitle'),
      detail: t('stalledDealsDetail', {
        count: input.sales?.stalledDeals ?? 0,
      }),
      href: '/pipelines',
    });
  }

  return alerts.slice(0, 5);
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24)
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatMinutes(minutes: number | null) {
  if (minutes === null) return '--';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function formatDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatShortDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
