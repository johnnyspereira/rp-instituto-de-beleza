'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  Archive,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  HelpCircle,
  History,
  Layers3,
  Loader2,
  MessageSquare,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GatedButton } from '@/components/ui/gated-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FlowGuide } from '@/components/flows/flow-guide';
import { useCan } from '@/hooks/use-can';
import { cn } from '@/lib/utils';

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  trigger_type: 'keyword' | 'first_inbound_message' | 'manual';
  trigger_config: { keywords?: string[] } | Record<string, unknown>;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
  node_count?: number;
  active_run_count?: number;
  completed_run_count?: number;
  failed_run_count?: number;
  handed_off_run_count?: number;
}

interface TemplateSummary {
  slug: string;
  name: string;
  description: string;
  icon: 'MessageSquare' | 'HelpCircle' | 'UserPlus';
  trigger_type: string;
  node_count: number;
}

interface QrStatus {
  connected: boolean;
  state: 'idle' | 'starting' | 'qr' | 'connected' | 'disconnected' | 'error';
  connectedForSeconds: number | null;
  lastError: string | null;
}

interface MetaStatus {
  connected: boolean;
  reason?: string;
  message?: string;
}

type FilterKey =
  | 'all'
  | 'active'
  | 'draft'
  | 'archived'
  | 'neverRun'
  | 'withFailures'
  | 'keyword'
  | 'firstInbound'
  | 'manual';

type HealthTone = 'ok' | 'warning' | 'muted';

const STATUS_COLORS: Record<FlowRow['status'], string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  active: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-300',
  archived: 'border-border bg-muted/50 text-muted-foreground',
};

const TEMPLATE_ICONS = {
  MessageSquare,
  HelpCircle,
  UserPlus,
} as const;

const FILTERS: FilterKey[] = [
  'all',
  'active',
  'draft',
  'neverRun',
  'withFailures',
  'keyword',
  'firstInbound',
  'manual',
  'archived',
];

export default function FlowsPage() {
  const router = useRouter();
  const canCreate = useCan('send-messages');
  const t = useTranslations('Flows.list');

  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [qrStatus, setQrStatus] = useState<QrStatus | null>(null);
  const [metaStatus, setMetaStatus] = useState<MetaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [flowsRes, tmplRes, qrRes, metaRes] = await Promise.all([
          fetch('/api/flows'),
          fetch('/api/flows/templates'),
          fetch('/api/whatsapp/baileys/status?autostart=false'),
          fetch('/api/whatsapp/config'),
        ]);

        if (!flowsRes.ok) {
          throw new Error(`Failed to load flows: ${flowsRes.status}`);
        }

        const flowsJson = (await flowsRes.json()) as { flows: FlowRow[] };
        if (!cancelled) setFlows(flowsJson.flows ?? []);

        if (tmplRes.ok) {
          const tmplJson = (await tmplRes.json()) as {
            templates: TemplateSummary[];
          };
          if (!cancelled) setTemplates(tmplJson.templates ?? []);
        }

        if (qrRes.ok) {
          const qrJson = (await qrRes.json()) as QrStatus;
          if (!cancelled) setQrStatus(qrJson);
        }

        if (metaRes.ok) {
          const metaJson = (await metaRes.json()) as MetaStatus;
          if (!cancelled) setMetaStatus(metaJson);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error(t('loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const stats = useMemo(() => buildStats(flows), [flows]);
  const filteredFlows = useMemo(
    () => filterFlows(flows, filter, search),
    [flows, filter, search]
  );

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          trigger_type: 'keyword',
          trigger_config: { keywords: [] },
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      setNewName('');
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      console.error(err);
      toast.error(t('createError'));
    } finally {
      setCreating(false);
    }
  }

  async function handleUseTemplate(slug: string) {
    setCreating(true);
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_slug: slug }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Clone failed: ${res.status}`);
      }
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('cloneError');
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(flow: FlowRow) {
    const yes = window.confirm(t('deleteConfirm', { name: flow.name }));
    if (!yes) return;
    try {
      const res = await fetch(`/api/flows/${flow.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('deleteError'));
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      toast.success(t('deleteSuccess'));
    } catch (err) {
      console.error(err);
      toast.error(t('deleteError'));
    }
  }

  async function handleStatus(flow: FlowRow, status: FlowRow['status']) {
    try {
      const res = await fetch(`/api/flows/${flow.id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? t('statusUpdateError'));
      }
      setFlows((prev) =>
        prev.map((item) => (item.id === flow.id ? { ...item, status } : item))
      );
      toast.success(
        status === 'active' ? t('statusActivated') : t('statusPaused')
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('statusUpdateError'));
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-foreground text-2xl font-semibold">
              {t('title')}
            </h1>
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-300 uppercase">
              {t('beta')}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('operationalSubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setGuideOpen((value) => !value)}
          >
            <HelpCircle className="h-4 w-4" />
            {guideOpen ? t('hideGuide') : t('howItWorks')}
          </Button>
          <GatedButton
            canAct={canCreate}
            gateReason={t('createGateReason')}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {t('newFlow')}
          </GatedButton>
        </div>
      </header>

      {guideOpen && <FlowGuide compact />}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          icon={Layers3}
          label={t('statsTotal')}
          value={stats.total}
        />
        <MetricCard
          icon={PlayCircle}
          label={t('statsActive')}
          value={stats.active}
          tone="ok"
        />
        <MetricCard
          icon={PauseCircle}
          label={t('statsDraft')}
          value={stats.draft}
        />
        <MetricCard
          icon={Activity}
          label={t('statsRunningContacts')}
          value={stats.running}
          tone="ok"
        />
        <MetricCard
          icon={AlertTriangle}
          label={t('statsFailures')}
          value={stats.failed}
          tone={stats.failed > 0 ? 'warning' : 'muted'}
        />
        <MetricCard
          icon={Clock3}
          label={t('statsLastRun')}
          value={stats.lastRun ? formatShortDate(stats.lastRun) : '-'}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <TemplateLauncher
          templates={templates}
          creating={creating}
          onUseTemplate={handleUseTemplate}
          onBlank={() => setCreateOpen(true)}
          t={t}
        />
        <SystemHealth qrStatus={qrStatus} metaStatus={metaStatus} t={t} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-foreground text-base font-semibold">
              {t('flowLibraryTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('flowLibraryDesc')}
            </p>
          </div>
          <div className="relative min-w-[240px]">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="bg-card pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                filter === key
                  ? 'border-primary/50 bg-primary-soft text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              {t(`filters.${key}`)}
            </button>
          ))}
        </div>

        {filteredFlows.length === 0 ? (
          <EmptyState
            hasFlows={flows.length > 0}
            onCreate={() => setCreateOpen(true)}
            canCreate={canCreate}
            t={t}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredFlows.map((flow) => (
              <FlowCard
                key={flow.id}
                flow={flow}
                onEdit={() => router.push(`/flows/${flow.id}`)}
                onRuns={() => router.push(`/flows/${flow.id}/runs`)}
                onDelete={() => handleDelete(flow)}
                onStatus={(status) => handleStatus(flow, status)}
                canEdit={canCreate}
                t={t}
              />
            ))}
          </div>
        )}
      </section>

      <CreateFlowDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        templates={templates}
        creating={creating}
        newName={newName}
        onNameChange={setNewName}
        onCreate={handleCreate}
        onUseTemplate={handleUseTemplate}
        t={t}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = 'muted',
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: HealthTone;
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
            tone === 'ok' && 'bg-emerald-500/10 text-emerald-300',
            tone === 'warning' && 'bg-amber-500/10 text-amber-300',
            tone === 'muted' && 'bg-muted text-primary'
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-foreground mt-2 truncate text-2xl font-semibold">
        {value}
      </div>
    </div>
  );
}

function TemplateLauncher({
  templates,
  creating,
  onUseTemplate,
  onBlank,
  t,
}: {
  templates: TemplateSummary[];
  creating: boolean;
  onUseTemplate: (slug: string) => void;
  onBlank: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-foreground inline-flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="text-primary h-4 w-4" />
            {t('templateLauncherTitle')}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('templateLauncherDesc')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBlank}>
          <Plus className="h-3.5 w-3.5" />
          {t('createBlankShort')}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {templates.slice(0, 3).map((template) => {
          const Icon = TEMPLATE_ICONS[template.icon] ?? FileText;
          return (
            <button
              key={template.slug}
              type="button"
              onClick={() => onUseTemplate(template.slug)}
              disabled={creating}
              className="border-border bg-background hover:border-primary/40 hover:bg-muted rounded-lg border p-3 text-left transition-colors disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="bg-primary-soft text-primary flex h-8 w-8 items-center justify-center rounded-md">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                  {t('nodeCount', { count: template.node_count })}
                </span>
              </div>
              <h3 className="text-foreground mt-3 text-sm font-semibold">
                {t(`commercialTemplates.${template.slug}.title`)}
              </h3>
              <p className="text-muted-foreground mt-1 line-clamp-3 text-xs leading-relaxed">
                {t(`commercialTemplates.${template.slug}.desc`)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SystemHealth({
  qrStatus,
  metaStatus,
  t,
}: {
  qrStatus: QrStatus | null;
  metaStatus: MetaStatus | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const qrConnected = Boolean(qrStatus?.connected);
  const metaConnected = Boolean(metaStatus?.connected);
  const anyConnected = qrConnected || metaConnected;

  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-foreground inline-flex items-center gap-2 text-sm font-semibold">
            <Bot className="text-primary h-4 w-4" />
            {t('healthTitle')}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {anyConnected ? t('healthReady') : t('healthNeedsChannel')}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'gap-1',
            anyConnected
              ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-600/40 bg-amber-500/10 text-amber-300'
          )}
        >
          {anyConnected ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          {anyConnected ? t('ready') : t('attention')}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HealthItem
          icon={QrCode}
          title={t('qrChannel')}
          status={
            qrConnected
              ? t('connected')
              : qrStatus?.state === 'starting'
                ? t('restoring')
                : qrStatus?.state === 'qr'
                  ? t('awaitingQr')
                  : t('notConnected')
          }
          detail={
            qrConnected && qrStatus?.connectedForSeconds != null
              ? t('connectedFor', {
                  time: formatSeconds(qrStatus.connectedForSeconds),
                })
              : qrStatus?.lastError || t('qrFallbackHint')
          }
          tone={qrConnected ? 'ok' : 'warning'}
        />
        <HealthItem
          icon={ShieldCheck}
          title={t('metaChannel')}
          status={metaConnected ? t('connected') : t('notConnected')}
          detail={
            metaConnected
              ? t('metaNativeHint')
              : metaStatus?.message || t('metaFallbackHint')
          }
          tone={metaConnected ? 'ok' : 'muted'}
        />
      </div>
    </div>
  );
}

function HealthItem({
  icon: Icon,
  title,
  status,
  detail,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  status: string;
  detail: string;
  tone: HealthTone;
}) {
  return (
    <div className="border-border bg-background rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md',
            tone === 'ok' && 'bg-emerald-500/10 text-emerald-300',
            tone === 'warning' && 'bg-amber-500/10 text-amber-300',
            tone === 'muted' && 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-foreground truncate text-sm font-semibold">
            {title}
          </h3>
          <p className="text-primary text-[11px] font-medium">{status}</p>
        </div>
      </div>
      <p className="text-muted-foreground mt-2 line-clamp-2 text-xs leading-relaxed">
        {detail}
      </p>
    </div>
  );
}

function EmptyState({
  hasFlows,
  onCreate,
  canCreate,
  t,
}: {
  hasFlows: boolean;
  onCreate: () => void;
  canCreate: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="border-border bg-card/50 flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center">
      <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
        <Workflow className="text-muted-foreground h-5 w-5" />
      </div>
      <h2 className="text-foreground mt-4 text-base font-medium">
        {hasFlows ? t('noFilterResults') : t('emptyTitle')}
      </h2>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">
        {hasFlows ? t('noFilterResultsDesc') : t('emptyDesc')}
      </p>
      {!hasFlows && (
        <GatedButton
          canAct={canCreate}
          gateReason={t('createGateReason')}
          onClick={onCreate}
          className="mt-5"
        >
          <Plus className="h-4 w-4" />
          {t('createFirst')}
        </GatedButton>
      )}
    </div>
  );
}

function FlowCard({
  flow,
  onEdit,
  onRuns,
  onDelete,
  onStatus,
  canEdit,
  t,
}: {
  flow: FlowRow;
  onEdit: () => void;
  onRuns: () => void;
  onDelete: () => void;
  onStatus: (status: FlowRow['status']) => void;
  canEdit: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const triggerSummary = describeTrigger(flow, t);
  const StatusIcon =
    flow.status === 'active'
      ? PlayCircle
      : flow.status === 'archived'
        ? Archive
        : PauseCircle;
  const completionRate = getCompletionRate(flow);

  return (
    <article className="border-border bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-primary-soft text-primary flex h-9 w-9 items-center justify-center rounded-lg">
              <Workflow className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-foreground truncate text-sm font-semibold">
                {flow.name}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {flow.description || triggerSummary}
              </p>
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 gap-1 text-[10px]',
            STATUS_COLORS[flow.status]
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {t(`status.${flow.status}`)}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <FlowFact label={t('factTrigger')} value={triggerSummary} />
        <FlowFact
          label={t('factChannel')}
          value={t('channelBoth')}
          icon={QrCode}
        />
        <FlowFact
          label={t('factNodes')}
          value={String(flow.node_count ?? 0)}
          icon={Layers3}
        />
        <FlowFact
          label={t('factRuns')}
          value={String(flow.execution_count ?? 0)}
          icon={Activity}
        />
        <FlowFact
          label={t('factCompletion')}
          value={completionRate == null ? '-' : `${completionRate}%`}
          icon={CheckCircle2}
        />
        <FlowFact
          label={t('factLastRun')}
          value={
            flow.last_executed_at ? formatShortDate(flow.last_executed_at) : '-'
          }
          icon={Clock3}
        />
      </div>

      <div className="border-border mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="text-muted-foreground flex flex-wrap gap-2 text-[11px]">
          {flow.failed_run_count ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              {t('failedRuns', { count: flow.failed_run_count })}
            </span>
          ) : (
            <span className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-1">
              <CheckCircle2 className="h-3 w-3" />
              {t('noRecentFailures')}
            </span>
          )}
          {flow.active_run_count ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-300">
              <Bot className="h-3 w-3" />
              {t('activeRuns', { count: flow.active_run_count })}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onRuns}>
            <History className="h-3.5 w-3.5" />
            {t('runs')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            {t('edit')}
          </Button>
          {flow.status === 'active' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatus('draft')}
              disabled={!canEdit}
            >
              <PauseCircle className="h-3.5 w-3.5" />
              {t('pause')}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatus('active')}
              disabled={!canEdit || flow.status === 'archived'}
            >
              <PlayCircle className="h-3.5 w-3.5" />
              {t('activate')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
            disabled={!canEdit}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('delete')}
          </Button>
        </div>
      </div>
    </article>
  );
}

function FlowFact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="bg-background min-w-0 rounded-md px-3 py-2">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
        {Icon && <Icon className="h-3 w-3" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-foreground mt-1 truncate text-xs font-semibold">
        {value}
      </div>
    </div>
  );
}

function CreateFlowDialog({
  open,
  onOpenChange,
  templates,
  creating,
  newName,
  onNameChange,
  onCreate,
  onUseTemplate,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: TemplateSummary[];
  creating: boolean;
  newName: string;
  onNameChange: (value: string) => void;
  onCreate: () => void;
  onUseTemplate: (slug: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover text-popover-foreground sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('createDesc')}
          </DialogDescription>
        </DialogHeader>

        {templates.length > 0 && (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              {t('startTemplate')}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => {
                const Icon = TEMPLATE_ICONS[template.icon] ?? FileText;
                return (
                  <button
                    key={template.slug}
                    type="button"
                    onClick={() => onUseTemplate(template.slug)}
                    disabled={creating}
                    className="border-border bg-background hover:border-primary/40 hover:bg-muted flex flex-col gap-2.5 rounded-lg border p-4 text-left transition-colors disabled:opacity-50"
                  >
                    <Icon className="text-primary h-5 w-5" />
                    <span className="text-popover-foreground text-sm font-semibold">
                      {t(`commercialTemplates.${template.slug}.title`)}
                    </span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {t(`commercialTemplates.${template.slug}.desc`)}
                    </span>
                    <span className="border-border text-muted-foreground mt-auto border-t pt-2 text-[11px]">
                      {t('nodeCount', { count: template.node_count })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="border-border space-y-2 border-t pt-4">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            {t('startBlank')}
          </p>
          <Input
            value={newName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={t('placeholderName')}
            className="bg-muted"
            onKeyDown={(event) => {
              if (event.key === 'Enter') onCreate();
            }}
          />
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            {t('cancel')}
          </Button>
          <Button onClick={onCreate} disabled={!newName.trim() || creating}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('createBlank')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildStats(flows: FlowRow[]) {
  const lastRun = flows
    .map((flow) => flow.last_executed_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    total: flows.length,
    active: flows.filter((flow) => flow.status === 'active').length,
    draft: flows.filter((flow) => flow.status === 'draft').length,
    running: flows.reduce((sum, flow) => sum + (flow.active_run_count ?? 0), 0),
    failed: flows.reduce((sum, flow) => sum + (flow.failed_run_count ?? 0), 0),
    lastRun,
  };
}

function filterFlows(flows: FlowRow[], filter: FilterKey, search: string) {
  const q = search.trim().toLowerCase();
  return flows.filter((flow) => {
    if (q) {
      const haystack = [
        flow.name,
        flow.description ?? '',
        describeTriggerText(flow),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (filter === 'all') return true;
    if (filter === 'active') return flow.status === 'active';
    if (filter === 'draft') return flow.status === 'draft';
    if (filter === 'archived') return flow.status === 'archived';
    if (filter === 'neverRun') return (flow.execution_count ?? 0) === 0;
    if (filter === 'withFailures') return (flow.failed_run_count ?? 0) > 0;
    if (filter === 'keyword') return flow.trigger_type === 'keyword';
    if (filter === 'firstInbound') {
      return flow.trigger_type === 'first_inbound_message';
    }
    if (filter === 'manual') return flow.trigger_type === 'manual';
    return true;
  });
}

function describeTrigger(
  flow: FlowRow,
  t: ReturnType<typeof useTranslations>
): string {
  if (flow.trigger_type === 'keyword') {
    const keywords = Array.isArray(flow.trigger_config.keywords)
      ? (flow.trigger_config.keywords as string[])
      : [];
    if (keywords.length === 0) return t('triggerKeywordNone');
    return t('triggerKeyword', { keywords: keywords.join(', ') });
  }
  if (flow.trigger_type === 'first_inbound_message') {
    return t('triggerFirstInbound');
  }
  return t('triggerManual');
}

function describeTriggerText(flow: FlowRow): string {
  if (flow.trigger_type === 'keyword') {
    const keywords = Array.isArray(flow.trigger_config.keywords)
      ? (flow.trigger_config.keywords as string[])
      : [];
    return keywords.join(' ');
  }
  return flow.trigger_type;
}

function getCompletionRate(flow: FlowRow): number | null {
  const completed = flow.completed_run_count ?? 0;
  const failed = flow.failed_run_count ?? 0;
  const handedOff = flow.handed_off_run_count ?? 0;
  const total = completed + failed + handedOff;
  if (total === 0) return null;
  return Math.round((completed / total) * 100);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatSeconds(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}
