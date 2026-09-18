'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  Bell,
  Banknote,
  Briefcase,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ClipboardCheck,
  Eye,
  Filter,
  HeartHandshake,
  Gift,
  Inbox,
  ReceiptText,
  Loader2,
  LifeBuoy,
  MessageCircle,
  PackageCheck,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  TimerReset,
  UserPlus,
  UserRound,
  Wifi,
  WifiOff,
  Workflow,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  getBrowserNotificationPermission,
  playNotificationSound,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from '@/lib/notifications/browser-alerts';
import { cn } from '@/lib/utils';
import type {
  Notification,
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '@/types';

type CategoryFilter = 'all' | NotificationCategory;
type StateFilter = 'all' | 'unread' | 'read' | 'action' | 'resolved';
type PriorityFilter = 'all' | NotificationPriority;

interface NotificationBundle {
  key: string;
  primary: Notification;
  items: Notification[];
  isAssignmentGroup: boolean;
  isUnread: boolean;
  isResolved: boolean;
  latestAt: string;
}

interface AssignmentTimelineEvent {
  key: string;
  at: string;
  label: string;
  detail?: string;
}

interface NotificationTypeMeta {
  label: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  icon: LucideIcon;
  actionLabel: string;
}

interface NotificationViewMeta extends NotificationTypeMeta {
  type: NotificationType | string;
}

const CATEGORY_ORDER: NotificationCategory[] = [
  'inbox',
  'sales',
  'finance',
  'clinic',
  'clients',
  'automation',
  'broadcast',
  'work_time',
  'system',
  'support',
];

const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; icon: LucideIcon; className: string }
> = {
  inbox: {
    label: 'Atendimento',
    icon: Inbox,
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
  },
  sales: {
    label: 'Comercial',
    icon: Briefcase,
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  },
  finance: {
    label: 'Financeiro',
    icon: ReceiptText,
    className: 'border-rose-500/30 bg-rose-500/10 text-rose-500',
  },
  clinic: {
    label: 'Agenda e clínica',
    icon: CalendarDays,
    className: 'border-teal-500/30 bg-teal-500/10 text-teal-600',
  },
  clients: {
    label: 'Clientes',
    icon: UserRound,
    className: 'border-orange-500/30 bg-orange-500/10 text-orange-600',
  },
  automation: {
    label: 'Automação',
    icon: Zap,
    className: 'border-violet-500/30 bg-violet-500/10 text-violet-500',
  },
  broadcast: {
    label: 'Transmissões',
    icon: Radio,
    className: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-500',
  },
  work_time: {
    label: 'Jornada',
    icon: TimerReset,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  },
  system: {
    label: 'Sistema',
    icon: Settings,
    className: 'border-slate-500/30 bg-slate-500/10 text-slate-500',
  },
  support: {
    label: 'Suporte',
    icon: LifeBuoy,
    className: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600',
  },
};

const PRIORITY_META: Record<
  NotificationPriority,
  { label: string; className: string; dotClassName: string }
> = {
  low: {
    label: 'Baixa',
    className: 'border-border bg-muted text-muted-foreground',
    dotClassName: 'bg-muted-foreground',
  },
  normal: {
    label: 'Normal',
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
    dotClassName: 'bg-blue-500',
  },
  high: {
    label: 'Alta',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
    dotClassName: 'bg-amber-500',
  },
  critical: {
    label: 'Crítica',
    className: 'border-red-500/30 bg-red-500/10 text-red-500',
    dotClassName: 'bg-red-500',
  },
};

const TYPE_META: Record<NotificationType, NotificationTypeMeta> = {
  conversation_assigned: {
    label: 'Conversa atribuída',
    category: 'inbox',
    priority: 'normal',
    icon: UserPlus,
    actionLabel: 'Abrir conversa',
  },
  new_message_received: {
    label: 'Nova mensagem',
    category: 'inbox',
    priority: 'normal',
    icon: MessageCircle,
    actionLabel: 'Responder',
  },
  conversation_waiting: {
    label: 'Cliente aguardando',
    category: 'inbox',
    priority: 'high',
    icon: Clock3,
    actionLabel: 'Abrir conversa',
  },
  deal_created: {
    label: 'Negócio criado',
    category: 'sales',
    priority: 'normal',
    icon: Briefcase,
    actionLabel: 'Ver pipeline',
  },
  deal_stage_changed: {
    label: 'Etapa alterada',
    category: 'sales',
    priority: 'normal',
    icon: Activity,
    actionLabel: 'Ver pipeline',
  },
  deal_won: {
    label: 'Negócio ganho',
    category: 'sales',
    priority: 'high',
    icon: CheckCircle2,
    actionLabel: 'Ver pipeline',
  },
  deal_lost: {
    label: 'Negócio perdido',
    category: 'sales',
    priority: 'high',
    icon: XCircle,
    actionLabel: 'Ver pipeline',
  },
  follow_up_due: {
    label: 'Follow-up',
    category: 'sales',
    priority: 'high',
    icon: Clock3,
    actionLabel: 'Abrir tarefa',
  },
  task_due: {
    label: 'Tarefa vencendo',
    category: 'sales',
    priority: 'high',
    icon: TimerReset,
    actionLabel: 'Abrir tarefa',
  },
  automation_failed: {
    label: 'Automação falhou',
    category: 'automation',
    priority: 'critical',
    icon: ShieldAlert,
    actionLabel: 'Ver log',
  },
  flow_handoff: {
    label: 'Fluxo encaminhou',
    category: 'automation',
    priority: 'normal',
    icon: Workflow,
    actionLabel: 'Ver execução',
  },
  flow_failed: {
    label: 'Fluxo falhou',
    category: 'automation',
    priority: 'critical',
    icon: AlertTriangle,
    actionLabel: 'Ver execução',
  },
  whatsapp_connected: {
    label: 'WhatsApp conectado',
    category: 'system',
    priority: 'normal',
    icon: Wifi,
    actionLabel: 'Ver conexão',
  },
  whatsapp_disconnected: {
    label: 'WhatsApp offline',
    category: 'system',
    priority: 'critical',
    icon: WifiOff,
    actionLabel: 'Reconectar',
  },
  broadcast_completed: {
    label: 'Transmissão finalizada',
    category: 'broadcast',
    priority: 'normal',
    icon: Radio,
    actionLabel: 'Ver relatório',
  },
  broadcast_failed: {
    label: 'Transmissão falhou',
    category: 'broadcast',
    priority: 'critical',
    icon: AlertTriangle,
    actionLabel: 'Ver relatório',
  },
  work_time_missing: {
    label: 'Falta registrada',
    category: 'work_time',
    priority: 'high',
    icon: TimerReset,
    actionLabel: 'Ver ponto',
  },
  work_time_pause_pending: {
    label: 'Pausa pendente',
    category: 'work_time',
    priority: 'high',
    icon: Clock3,
    actionLabel: 'Justificar',
  },
  referral_registered: {
    label: 'Nova indicação',
    category: 'sales',
    priority: 'normal',
    icon: HeartHandshake,
    actionLabel: 'Ver indicação',
  },
  referral_qualified: {
    label: 'Indicação qualificada',
    category: 'sales',
    priority: 'high',
    icon: CheckCircle2,
    actionLabel: 'Ver recompensas',
  },
  referral_reward_issued: {
    label: 'Recompensa emitida',
    category: 'sales',
    priority: 'normal',
    icon: HeartHandshake,
    actionLabel: 'Ver recompensa',
  },
  invoice_requested: {
    label: 'Pedido de fatura',
    category: 'finance',
    priority: 'high',
    icon: ReceiptText,
    actionLabel: 'Processar pedido',
  },
  anamnesis_submitted: {
    label: 'Anamnese recebida',
    category: 'clinic',
    priority: 'high',
    icon: ClipboardCheck,
    actionLabel: 'Rever ficha',
  },
  anamnesis_reviewed: {
    label: 'Anamnese revista',
    category: 'clinic',
    priority: 'normal',
    icon: CheckCircle2,
    actionLabel: 'Abrir ficha',
  },
  appointment_created: {
    label: 'Nova marcação',
    category: 'clinic',
    priority: 'normal',
    icon: CalendarDays,
    actionLabel: 'Abrir agenda',
  },
  appointment_rescheduled: {
    label: 'Marcação remarcada',
    category: 'clinic',
    priority: 'high',
    icon: Clock3,
    actionLabel: 'Abrir marcação',
  },
  appointment_cancelled: {
    label: 'Marcação cancelada',
    category: 'clinic',
    priority: 'high',
    icon: XCircle,
    actionLabel: 'Abrir agenda',
  },
  appointment_communication_sent: {
    label: 'Comunicação da agenda enviada',
    category: 'clinic',
    priority: 'normal',
    icon: CheckCircle2,
    actionLabel: 'Abrir marcação',
  },
  appointment_communication_failed: {
    label: 'Falha na comunicação da agenda',
    category: 'clinic',
    priority: 'high',
    icon: AlertTriangle,
    actionLabel: 'Ver detalhes',
  },
  client_created: {
    label: 'Novo cliente',
    category: 'clients',
    priority: 'normal',
    icon: UserPlus,
    actionLabel: 'Abrir Cliente 360',
  },
  payment_received: {
    label: 'Pagamento recebido',
    category: 'finance',
    priority: 'normal',
    icon: Banknote,
    actionLabel: 'Abrir financeiro',
  },
  pack_delivery_sent: {
    label: 'Pack enviado',
    category: 'finance',
    priority: 'normal',
    icon: PackageCheck,
    actionLabel: 'Ver packs',
  },
  pack_delivery_failed: {
    label: 'Falha no envio do pack',
    category: 'finance',
    priority: 'high',
    icon: AlertTriangle,
    actionLabel: 'Ver packs',
  },
  voucher_delivery_sent: {
    label: 'Voucher enviado',
    category: 'finance',
    priority: 'normal',
    icon: Gift,
    actionLabel: 'Ver vouchers',
  },
  voucher_delivery_failed: {
    label: 'Falha no envio do voucher',
    category: 'finance',
    priority: 'high',
    icon: AlertTriangle,
    actionLabel: 'Ver vouchers',
  },
  support_ticket_created: {
    label: 'Novo ticket de suporte',
    category: 'support',
    priority: 'normal',
    icon: LifeBuoy,
    actionLabel: 'Abrir ticket',
  },
  support_new_message: {
    label: 'Nova mensagem de suporte',
    category: 'support',
    priority: 'high',
    icon: LifeBuoy,
    actionLabel: 'Responder ticket',
  },
  system_alert: {
    label: 'Alerta do sistema',
    category: 'system',
    priority: 'normal',
    icon: Bell,
    actionLabel: 'Abrir',
  },
};

const FALLBACK_META: NotificationTypeMeta = {
  label: 'Notificação',
  category: 'system',
  priority: 'normal',
  icon: Bell,
  actionLabel: 'Abrir',
};

const STATE_FILTERS: Array<{ key: StateFilter; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Não lidas' },
  { key: 'action', label: 'Ação' },
  { key: 'read', label: 'Lidas' },
  { key: 'resolved', label: 'Resolvidas' },
];

const PRIORITY_FILTERS: Array<{ key: PriorityFilter; label: string }> = [
  { key: 'all', label: 'Todas prioridades' },
  { key: 'critical', label: 'Críticas' },
  { key: 'high', label: 'Altas' },
  { key: 'normal', label: 'Normais' },
  { key: 'low', label: 'Baixas' },
];

export default function NotificationsPage() {
  const router = useRouter();
  const { accountId, profileLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [search, setSearch] = useState('');
  const [desktopPermission, setDesktopPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getBrowserNotificationPermission());

  const load = useCallback(
    async (showRefreshing = false) => {
      if (!accountId) {
        if (!profileLoading) {
          setNotifications([]);
          setError('Sua conta ainda não está vinculada a um workspace.');
        }
        return;
      }

      if (showRefreshing) setRefreshing(true);
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from('notifications')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(150);

      if (fetchErr) {
        setError(fetchErr.message);
      } else {
        setError(null);
        setNotifications(sortByNewest((data ?? []) as Notification[]));
      }
      if (showRefreshing) setRefreshing(false);
    },
    [accountId, profileLoading]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!accountId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-page-${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Notification;
            setNotifications((prev) => {
              const current = prev ?? [];
              if (current.some((n) => n.id === row.id)) return current;
              return sortByNewest([row, ...current]).slice(0, 150);
            });
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Notification;
            setNotifications((prev) =>
              prev
                ? sortByNewest(
                    prev.map((n) => (n.id === row.id ? { ...n, ...row } : n))
                  )
                : prev
            );
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<Notification>;
            setNotifications(
              (prev) => prev?.filter((n) => n.id !== oldRow.id) ?? prev
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId]);

  const allNotifications = useMemo(() => notifications ?? [], [notifications]);
  const supportsResolved = allNotifications.some((n) =>
    Object.prototype.hasOwnProperty.call(n, 'resolved_at')
  );
  const notificationBundles = useMemo(
    () => bundleNotifications(allNotifications),
    [allNotifications]
  );
  const stats = useMemo(
    () => buildStats(notificationBundles),
    [notificationBundles]
  );
  const categoryStats = useMemo(
    () => buildCategoryStats(notificationBundles),
    [notificationBundles]
  );
  const filtered = useMemo(
    () =>
      filterNotifications(notificationBundles, {
        category,
        state: stateFilter,
        priority: priorityFilter,
        search,
      }),
    [notificationBundles, category, priorityFilter, search, stateFilter]
  );
  const grouped = useMemo(() => groupNotifications(filtered), [filtered]);
  const unreadIds = allNotifications
    .filter((n) => !n.read_at && !n.resolved_at)
    .map((n) => n.id);

  async function setReadState(ids: string[], read: boolean) {
    if (!accountId || ids.length === 0) return;
    const previous = notifications;
    const readAt = read ? new Date().toISOString() : null;
    setNotifications(
      (prev) =>
        prev?.map((n) =>
          ids.includes(n.id) ? { ...n, read_at: readAt ?? undefined } : n
        ) ?? prev
    );

    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('account_id', accountId)
      .in('id', ids);

    if (updateErr) {
      setNotifications(previous);
      toast.error(
        read
          ? 'Falha ao marcar notificação como lida'
          : 'Falha ao marcar notificação como não lida'
      );
      load();
    }
  }

  async function markResolved(bundle: NotificationBundle) {
    if (!accountId || !supportsResolved) return;
    const previous = notifications;
    const now = new Date().toISOString();
    const ids = bundle.items.map((notification) => notification.id);
    setNotifications(
      (prev) =>
        prev?.map((n) =>
          ids.includes(n.id)
            ? { ...n, read_at: n.read_at ?? now, resolved_at: now }
            : n
        ) ?? prev
    );

    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from('notifications')
      .update({ read_at: now, resolved_at: now })
      .eq('account_id', accountId)
      .in('id', ids);

    if (updateErr) {
      setNotifications(previous);
      toast.error('Falha ao resolver notificação');
      load();
    }
  }

  async function markAllRead() {
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    await setReadState(unreadIds, true);
    setMarkingAll(false);
  }

  async function requestDesktopPermission() {
    const permission = await requestBrowserNotificationPermission();
    setDesktopPermission(permission);
    if (permission === 'granted') {
      playNotificationSound();
      showBrowserNotification({
        title: 'Alertas ativados',
        body: 'O CRM vai avisar quando uma notificacao importante chegar.',
        tag: 'notifications-permission-test',
      });
      toast.success('Alertas do navegador ativados.');
    }
  }

  function testDesktopAlert() {
    const played = playNotificationSound();
    const shown = showBrowserNotification({
      title: 'Teste de notificacao',
      body: 'Som e alerta do navegador estao configurados para este CRM.',
      tag: 'notifications-test',
    });

    if (desktopPermission !== 'granted') {
      toast.info('Ative os alertas do navegador para testar o popup.');
      return;
    }

    toast.success(
      shown
        ? 'Teste enviado. Confira o popup do navegador.'
        : played
          ? 'Som reproduzido. O navegador nao exibiu popup.'
          : 'Teste solicitado.'
    );
  }

  function openNotification(bundle: NotificationBundle) {
    const notification = bundle.primary;
    const unreadIdsInBundle = bundle.items
      .filter((item) => !item.read_at && !item.resolved_at)
      .map((item) => item.id);

    if (unreadIdsInBundle.length > 0) {
      void setReadState(unreadIdsInBundle, true);
    }
    const href = getActionHref(notification);
    if (href) router.push(href);
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive max-w-md text-center text-sm">{error}</p>
        <Button variant="outline" onClick={() => load(true)}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (notifications === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-foreground text-2xl font-semibold">
              Notificações
            </h1>
            {stats.unread > 0 && (
              <Badge className="bg-primary text-primary-foreground">
                {stats.unread > 99 ? '99+' : stats.unread}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Central de alertas do atendimento, comercial, automações, QR e
            sistema.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={unreadIds.length === 0 || markingAll}
            onClick={markAllRead}
          >
            {markingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Marcar lidas
          </Button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Bell}
          label="Total"
          value={stats.total}
          detail="últimas 150"
        />
        <StatCard
          icon={Eye}
          label="Não lidas"
          value={stats.unread}
          detail="aguardando atenção"
          tone={stats.unread > 0 ? 'primary' : 'muted'}
        />
        <StatCard
          icon={ShieldAlert}
          label="Críticas"
          value={stats.critical}
          detail="risco operacional"
          tone={stats.critical > 0 ? 'danger' : 'muted'}
        />
        <StatCard
          icon={Activity}
          label="Com ação"
          value={stats.actionable}
          detail="abrem uma tela"
          tone={stats.actionable > 0 ? 'warning' : 'muted'}
        />
        <StatCard
          icon={Clock3}
          label="Hoje"
          value={stats.today}
          detail="eventos do dia"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <FilterBar
            category={category}
            stateFilter={stateFilter}
            priorityFilter={priorityFilter}
            search={search}
            categoryStats={categoryStats}
            onCategoryChange={setCategory}
            onStateChange={setStateFilter}
            onPriorityChange={setPriorityFilter}
            onSearchChange={setSearch}
          />

          {filtered.length === 0 ? (
            <EmptyState hasNotifications={allNotifications.length > 0} />
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <section key={group.label} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      {group.label}
                    </h2>
                    <span className="bg-border h-px flex-1" />
                    <span className="text-muted-foreground text-[11px]">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((bundle) => (
                      <NotificationRow
                        key={bundle.key}
                        bundle={bundle}
                        supportsResolved={supportsResolved}
                        onOpen={() => openNotification(bundle)}
                        onMarkRead={() =>
                          setReadState(
                            bundle.items.map((notification) => notification.id),
                            true
                          )
                        }
                        onMarkUnread={() =>
                          setReadState(
                            bundle.items.map((notification) => notification.id),
                            false
                          )
                        }
                        onResolve={() => markResolved(bundle)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <QuickActions routerPush={(href) => router.push(href)} />
          <DesktopAlerts
            permission={desktopPermission}
            onRequest={requestDesktopPermission}
            onTest={testDesktopAlert}
          />
          <CategoryBreakdown stats={categoryStats} />
        </aside>
      </section>
    </div>
  );
}

function FilterBar({
  category,
  stateFilter,
  priorityFilter,
  search,
  categoryStats,
  onCategoryChange,
  onStateChange,
  onPriorityChange,
  onSearchChange,
}: {
  category: CategoryFilter;
  stateFilter: StateFilter;
  priorityFilter: PriorityFilter;
  search: string;
  categoryStats: Record<NotificationCategory, number>;
  onCategoryChange: (value: CategoryFilter) => void;
  onStateChange: (value: StateFilter) => void;
  onPriorityChange: (value: PriorityFilter) => void;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="border-border bg-card space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Pesquisar por título, corpo ou tipo..."
            className="bg-background pl-9"
          />
        </div>
        <FilterPill
          active={category === 'all'}
          onClick={() => onCategoryChange('all')}
          label="Todas categorias"
        />
        {CATEGORY_ORDER.map((key) => {
          const meta = CATEGORY_META[key];
          const Icon = meta.icon;
          return (
            <FilterPill
              key={key}
              active={category === key}
              onClick={() => onCategoryChange(key)}
              label={meta.label}
              count={categoryStats[key]}
              icon={Icon}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <Filter className="h-3.5 w-3.5" />
          Estado
        </span>
        {STATE_FILTERS.map((item) => (
          <FilterPill
            key={item.key}
            active={stateFilter === item.key}
            onClick={() => onStateChange(item.key)}
            label={item.label}
          />
        ))}
        <span className="text-muted-foreground ml-0 inline-flex items-center gap-1 text-xs md:ml-3">
          <ShieldAlert className="h-3.5 w-3.5" />
          Prioridade
        </span>
        {PRIORITY_FILTERS.map((item) => (
          <FilterPill
            key={item.key}
            active={priorityFilter === item.key}
            onClick={() => onPriorityChange(item.key)}
            label={item.label}
          />
        ))}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-primary/50 bg-primary-soft text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function NotificationRow({
  bundle,
  supportsResolved,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onResolve,
}: {
  bundle: NotificationBundle;
  supportsResolved: boolean;
  onOpen: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onResolve: () => void;
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const notification = bundle.primary;
  const meta = getNotificationMeta(notification);
  const categoryMeta = CATEGORY_META[meta.category];
  const priorityMeta = PRIORITY_META[meta.priority];
  const Icon = meta.icon;
  const isResolved = bundle.isResolved;
  const isUnread = bundle.isUnread;
  const href = getActionHref(notification);
  const assignmentCount = getAssignmentCount(bundle);
  const assignmentTimeline = getAssignmentTimeline(bundle);
  const body = getBundleBody(bundle);
  const canShowTimeline =
    bundle.isAssignmentGroup && assignmentTimeline.length > 1;

  return (
    <article
      className={cn(
        'bg-card rounded-lg border p-4 transition-colors',
        isUnread
          ? 'border-primary/35 shadow-sm'
          : 'border-border hover:border-border/80',
        isResolved && 'opacity-75'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
            categoryMeta.className
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={cn(
                'max-w-full min-w-0 truncate text-sm font-semibold',
                isUnread ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {notification.title}
            </h3>
            {isUnread && (
              <span className="bg-primary h-2 w-2 shrink-0 rounded-full" />
            )}
            <Badge
              variant="outline"
              className={cn('text-[10px]', categoryMeta.className)}
            >
              {categoryMeta.label}
            </Badge>
            <Badge
              variant="outline"
              className={cn('gap-1 text-[10px]', priorityMeta.className)}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  priorityMeta.dotClassName
                )}
              />
              {priorityMeta.label}
            </Badge>
            {bundle.isAssignmentGroup && assignmentCount > 1 && (
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary-soft text-primary gap-1 text-[10px]"
              >
                <UserPlus className="h-3 w-3" />
                Atribuído {assignmentCount} vezes
              </Badge>
            )}
            {isResolved && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <CheckCircle2 className="h-3 w-3" />
                Resolvida
              </Badge>
            )}
          </div>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span>{meta.label}</span>
            <span>•</span>
            <span>{formatRelativePt(bundle.latestAt)}</span>
            {bundle.items.length > 1 && (
              <>
                <span>•</span>
                <span>
                  {bundle.items.length} evento
                  {bundle.items.length > 1 ? 's' : ''} agrupado
                  {bundle.items.length > 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>

          {body && (
            <p className="text-muted-foreground mt-2 line-clamp-2 text-sm leading-relaxed">
              {body}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {href && (
              <Button size="sm" onClick={onOpen}>
                <Sparkles className="h-3.5 w-3.5" />
                {meta.actionLabel}
              </Button>
            )}
            {!href && (
              <Button size="sm" variant="outline" onClick={onOpen}>
                <Eye className="h-3.5 w-3.5" />
                Marcar lida
              </Button>
            )}
            {!isResolved && (
              <>
                {isUnread ? (
                  <Button size="sm" variant="ghost" onClick={onMarkRead}>
                    <CheckCheck className="h-3.5 w-3.5" />
                    Lida
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={onMarkUnread}>
                    <Bell className="h-3.5 w-3.5" />
                    Não lida
                  </Button>
                )}
              </>
            )}
            {supportsResolved && !isResolved && (
              <Button size="sm" variant="ghost" onClick={onResolve}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Resolver
              </Button>
            )}
            {canShowTimeline && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowTimeline((current) => !current)}
              >
                <Clock3 className="h-3.5 w-3.5" />
                {showTimeline ? 'Ocultar histórico' : 'Ver histórico'}
                {showTimeline ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>

          {canShowTimeline && showTimeline && (
            <div className="border-border bg-muted/20 mt-3 rounded-lg border p-3">
              <div className="text-foreground mb-2 flex items-center gap-2 text-xs font-semibold">
                <Clock3 className="text-primary h-3.5 w-3.5" />
                Histórico de atribuição
              </div>
              <div className="space-y-2">
                {assignmentTimeline.map((event, index) => (
                  <div key={event.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'mt-1 h-2 w-2 rounded-full',
                          index === 0 ? 'bg-primary' : 'bg-muted-foreground/50'
                        )}
                      />
                      {index < assignmentTimeline.length - 1 && (
                        <span className="bg-border mt-1 h-full min-h-5 w-px" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground text-xs font-medium">
                        {event.label}
                      </p>
                      {event.detail && (
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {event.detail}
                        </p>
                      )}
                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                        {formatRelativePt(event.at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function QuickActions({ routerPush }: { routerPush: (href: string) => void }) {
  const actions = [
    { label: 'Abrir Inbox', href: '/inbox', icon: Inbox },
    { label: 'Ver Pipelines', href: '/pipelines', icon: Briefcase },
    { label: 'Automações', href: '/automations', icon: Zap },
    { label: 'WhatsApp', href: '/settings?tab=whatsapp', icon: Wifi },
  ];

  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
        <Activity className="text-primary h-4 w-4" />
        Ações rápidas
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.href}
              type="button"
              onClick={() => routerPush(action.href)}
              className="border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground flex min-h-20 flex-col items-start justify-between rounded-md border p-3 text-left text-xs font-medium transition-colors"
            >
              <Icon className="text-primary h-4 w-4" />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DesktopAlerts({
  permission,
  onRequest,
  onTest,
}: {
  permission: NotificationPermission | 'unsupported';
  onRequest: () => void;
  onTest: () => void;
}) {
  const status =
    permission === 'unsupported'
      ? 'Indisponível'
      : permission === 'granted'
        ? 'Ativo'
        : permission === 'denied'
          ? 'Bloqueado'
          : 'Pendente';

  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <Bell className="text-primary h-4 w-4" />
            Alertas desktop
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Status do navegador: {status}
          </p>
        </div>
        <Badge variant="outline">{status}</Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onRequest}
          disabled={permission === 'unsupported' || permission === 'granted'}
        >
          <Bell className="h-3.5 w-3.5" />
          Ativar alertas
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onTest}
          disabled={permission === 'unsupported'}
        >
          <Radio className="h-3.5 w-3.5" />
          Testar
        </Button>
      </div>
    </div>
  );
}

function CategoryBreakdown({
  stats,
}: {
  stats: Record<NotificationCategory, number>;
}) {
  const total = CATEGORY_ORDER.reduce((sum, key) => sum + stats[key], 0);
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
        <Filter className="text-primary h-4 w-4" />
        Mapa de alertas
      </div>
      <div className="mt-3 space-y-2">
        {CATEGORY_ORDER.map((key) => {
          const meta = CATEGORY_META[key];
          const Icon = meta.icon;
          const count = stats[key];
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground flex min-w-0 items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="truncate">{meta.label}</span>
                </span>
                <span className="text-foreground font-medium">{count}</span>
              </div>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'muted',
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail: string;
  tone?: 'muted' | 'primary' | 'warning' | 'danger';
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs font-medium">
          {label}
        </span>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md',
            tone === 'muted' && 'bg-muted text-primary',
            tone === 'primary' && 'bg-primary-soft text-primary',
            tone === 'warning' && 'bg-amber-500/10 text-amber-500',
            tone === 'danger' && 'bg-red-500/10 text-red-500'
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-foreground mt-2 text-2xl font-semibold">
        {value.toLocaleString('pt-PT')}
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </div>
  );
}

function EmptyState({ hasNotifications }: { hasNotifications: boolean }) {
  return (
    <div className="border-border bg-card/50 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
      <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
        <Bell className="text-muted-foreground h-5 w-5" />
      </div>
      <h2 className="text-foreground mt-4 text-base font-medium">
        {hasNotifications
          ? 'Nada encontrado com esses filtros'
          : 'Nenhuma notificação ainda'}
      </h2>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">
        {hasNotifications
          ? 'Ajuste a categoria, prioridade, estado ou busca para ver outros eventos.'
          : 'Quando conversas, automações, transmissões e sistema gerarem alertas, eles aparecem aqui.'}
      </p>
    </div>
  );
}

function getNotificationMeta(notification: Notification): NotificationViewMeta {
  const base =
    TYPE_META[notification.type as NotificationType] ?? FALLBACK_META;
  return {
    ...base,
    type: notification.type,
    category: normalizeCategory(notification.category) ?? base.category,
    priority: normalizePriority(notification.priority) ?? base.priority,
  };
}

function getActionHref(notification: Notification): string | null {
  if (notification.action_url?.startsWith('/')) return notification.action_url;
  if (notification.conversation_id) {
    return `/inbox?c=${notification.conversation_id}`;
  }

  const meta = getNotificationMeta(notification);
  if (meta.category === 'sales') return '/pipelines';
  if (meta.category === 'finance') return '/finance';
  if (meta.category === 'clinic') return '/agenda';
  if (meta.category === 'clients') return '/contacts';
  if (meta.category === 'automation') return '/automations';
  if (meta.category === 'broadcast') return '/broadcasts';
  if (meta.category === 'work_time') return '/settings?tab=work-time';
  if (
    meta.type === 'whatsapp_connected' ||
    meta.type === 'whatsapp_disconnected'
  ) {
    return '/settings?tab=whatsapp';
  }
  return null;
}

function bundleNotifications(
  notifications: Notification[]
): NotificationBundle[] {
  const map = new Map<string, Notification[]>();

  for (const notification of notifications) {
    const key = getBundleKey(notification);
    const items = map.get(key) ?? [];
    items.push(notification);
    map.set(key, items);
  }

  return Array.from(map, ([key, items]) => {
    const sorted = sortByNewest(items);
    const primary = sorted[0];
    const isAssignmentGroup = key.startsWith('assignment:');

    return {
      key,
      primary,
      items: sorted,
      isAssignmentGroup,
      isUnread: sorted.some(
        (notification) => !notification.read_at && !notification.resolved_at
      ),
      isResolved: sorted.every((notification) =>
        Boolean(notification.resolved_at)
      ),
      latestAt: sorted[0]?.created_at ?? new Date(0).toISOString(),
    };
  }).sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt));
}

function getBundleKey(notification: Notification) {
  if (
    notification.type === 'conversation_assigned' &&
    notification.conversation_id
  ) {
    return `assignment:${notification.conversation_id}:${notification.user_id}`;
  }
  return `single:${notification.id}`;
}

function getBundleBody(bundle: NotificationBundle) {
  const body = bundle.primary.body ?? '';
  if (!bundle.isAssignmentGroup) return body;

  const count = getAssignmentCount(bundle);
  if (count <= 1) return body;

  return `${body || 'Conversa atribuída.'} Histórico agrupado com ${count} atribuições.`;
}

function getAssignmentCount(bundle: NotificationBundle) {
  if (!bundle.isAssignmentGroup) return bundle.items.length;

  const countFromMetadata = bundle.items.reduce((max, notification) => {
    const value = readNumberMetadata(notification.metadata, 'assignment_count');
    return Math.max(max, value ?? 0);
  }, 0);

  return Math.max(countFromMetadata, bundle.items.length, 1);
}

function getAssignmentTimeline(
  bundle: NotificationBundle
): AssignmentTimelineEvent[] {
  if (!bundle.isAssignmentGroup) return [];

  const metadataEvents = bundle.items.flatMap((notification) =>
    readTimelineMetadata(notification.metadata)
  );

  const events =
    metadataEvents.length > 0
      ? metadataEvents
      : bundle.items.map((notification) => ({
          key: notification.id,
          at: notification.created_at,
          label: notification.body || notification.title,
          detail: getNotificationMeta(notification).label,
        }));

  const deduped = new Map<string, AssignmentTimelineEvent>();
  for (const event of events) {
    deduped.set(`${event.at}:${event.label}:${event.detail ?? ''}`, event);
  }

  return Array.from(deduped.values()).sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at)
  );
}

function readNumberMetadata(
  metadata: Notification['metadata'],
  key: string
): number | null {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readTimelineMetadata(
  metadata: Notification['metadata']
): AssignmentTimelineEvent[] {
  const raw = metadata?.assignment_timeline;
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((event, index) => {
    if (!event || typeof event !== 'object') return [];
    const data = event as Record<string, unknown>;
    const at = typeof data.at === 'string' ? data.at : null;
    if (!at) return [];

    return [
      {
        key:
          typeof data.id === 'string'
            ? data.id
            : `${at}:${String(data.action ?? 'event')}:${index}`,
        at,
        label: assignmentEventLabel(data),
        detail:
          typeof data.contact_name === 'string'
            ? `Conversa com ${data.contact_name}`
            : undefined,
      },
    ];
  });
}

function assignmentEventLabel(event: Record<string, unknown>) {
  const actor =
    typeof event.actor_name === 'string' ? event.actor_name : 'Sistema';
  const assignee =
    typeof event.assignee_name === 'string' ? event.assignee_name : 'atendente';
  const fromName =
    typeof event.from_name === 'string'
      ? event.from_name
      : 'responsavel anterior';
  const toName = typeof event.to_name === 'string' ? event.to_name : assignee;

  switch (event.action) {
    case 'unassigned':
      return `${actor} removeu a atribuição de ${assignee}`;
    case 'transferred':
      return `${actor} transferiu de ${fromName} para ${toName}`;
    case 'assigned':
    default:
      return `${actor} atribuiu para ${assignee}`;
  }
}

function filterNotifications(
  bundles: NotificationBundle[],
  filters: {
    category: CategoryFilter;
    state: StateFilter;
    priority: PriorityFilter;
    search: string;
  }
) {
  const q = normalizeText(filters.search);
  return bundles.filter((bundle) => {
    const notification = bundle.primary;
    const meta = getNotificationMeta(notification);
    const isResolved = bundle.isResolved;
    const isUnread = bundle.isUnread;
    const href = getActionHref(notification);

    if (filters.category !== 'all' && meta.category !== filters.category) {
      return false;
    }
    if (filters.priority !== 'all' && meta.priority !== filters.priority) {
      return false;
    }
    if (filters.state === 'unread' && !isUnread) return false;
    if (filters.state === 'read' && isUnread) return false;
    if (filters.state === 'action' && (!href || isResolved)) return false;
    if (filters.state === 'resolved' && !isResolved) return false;

    if (q) {
      const haystack = normalizeText(
        [
          ...bundle.items.flatMap((item) => [item.title, item.body ?? '']),
          meta.label,
          CATEGORY_META[meta.category].label,
          PRIORITY_META[meta.priority].label,
          ...getAssignmentTimeline(bundle).map(
            (event) => `${event.label} ${event.detail ?? ''}`
          ),
        ].join(' ')
      );
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

function buildStats(bundles: NotificationBundle[]) {
  const today = new Date().toDateString();
  return bundles.reduce(
    (acc, bundle) => {
      const notification = bundle.primary;
      const meta = getNotificationMeta(notification);
      if (bundle.isUnread) acc.unread += 1;
      if (meta.priority === 'critical') acc.critical += 1;
      if (getActionHref(notification) && !bundle.isResolved) {
        acc.actionable += 1;
      }
      if (new Date(bundle.latestAt).toDateString() === today) {
        acc.today += 1;
      }
      return acc;
    },
    {
      total: bundles.length,
      unread: 0,
      critical: 0,
      actionable: 0,
      today: 0,
    }
  );
}

function buildCategoryStats(bundles: NotificationBundle[]) {
  const stats = CATEGORY_ORDER.reduce(
    (acc, key) => ({ ...acc, [key]: 0 }),
    {} as Record<NotificationCategory, number>
  );
  for (const bundle of bundles) {
    const meta = getNotificationMeta(bundle.primary);
    stats[meta.category] += 1;
  }
  return stats;
}

function groupNotifications(bundles: NotificationBundle[]) {
  const groups = new Map<string, NotificationBundle[]>();
  for (const bundle of bundles) {
    const label = dateGroupLabel(bundle.latestAt);
    const list = groups.get(label) ?? [];
    list.push(bundle);
    groups.set(label, list);
  }
  return Array.from(groups, ([label, items]) => ({ label, items }));
}

function dateGroupLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';

  const diffMs = today.getTime() - date.getTime();
  if (diffMs < 7 * 24 * 60 * 60 * 1000) return 'Esta semana';

  return new Intl.DateTimeFormat('pt-PT', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatRelativePt(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 'agora';
  const diffSeconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSeconds < 60) return 'agora';
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} dia${days > 1 ? 's' : ''}`;
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function sortByNewest(items: Notification[]) {
  return [...items].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function normalizeCategory(
  value: Notification['category']
): NotificationCategory | null {
  return CATEGORY_ORDER.includes(value as NotificationCategory)
    ? (value as NotificationCategory)
    : null;
}

function normalizePriority(
  value: Notification['priority']
): NotificationPriority | null {
  return value === 'low' ||
    value === 'normal' ||
    value === 'high' ||
    value === 'critical'
    ? value
    : null;
}
