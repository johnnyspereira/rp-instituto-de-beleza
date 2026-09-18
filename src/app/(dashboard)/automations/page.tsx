'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Zap,
  Plus,
  MoreVertical,
  Copy,
  Pencil,
  Trash2,
  FileText,
  MessageCircle,
  Clock,
  Users,
  PhoneCall,
  Loader2,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useCan } from '@/hooks/use-can';
import { useTranslations } from 'next-intl';
import type { Automation } from '@/types';
import { Button } from '@/components/ui/button';
import { GatedButton } from '@/components/ui/gated-button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AUTOMATION_TEMPLATES,
  type TemplateSlug,
} from '@/lib/automations/templates';
import { triggerMeta } from '@/lib/automations/trigger-meta';
import { cn } from '@/lib/utils';

const TEMPLATE_ORDER: TemplateSlug[] = [
  'massage_welcome',
  'massage_booking',
  'massage_after_hours',
  'massage_follow_up',
  'welcome_message',
  'out_of_office',
  'lead_qualifier',
  'follow_up_reminder',
];

const TEMPLATE_ICON: Record<TemplateSlug, typeof Zap> = {
  massage_welcome: MessageCircle,
  massage_booking: Users,
  massage_after_hours: Clock,
  massage_follow_up: PhoneCall,
  welcome_message: MessageCircle,
  out_of_office: Clock,
  lead_qualifier: Users,
  follow_up_reminder: PhoneCall,
};

export default function AutomationsPage() {
  const router = useRouter();
  const canCreate = useCan('send-messages');
  const t = useTranslations('Automations.list');
  const tTemplates = useTranslations('Automations.templates');
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from('automations')
        .select('*')
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;
      setAutomations((data ?? []) as Automation[]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load automations'
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(a: Automation, next: boolean) {
    // Optimistic flip so the switch feels instant.
    setAutomations(
      (prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ??
        prev
    );
    const res = await fetch(`/api/automations/${a.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) {
      // Roll back on error.
      setAutomations(
        (prev) =>
          prev?.map((x) => (x.id === a.id ? { ...x, is_active: !next } : x)) ??
          prev
      );
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? t('toasts.updateError'));
      return;
    }
    toast.success(next ? t('toasts.activated') : t('toasts.paused'));
  }

  async function duplicate(a: Automation) {
    const res = await fetch(`/api/automations/${a.id}/duplicate`, {
      method: 'POST',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? t('toasts.duplicateError'));
      return;
    }
    toast.success(t('toasts.duplicated'));
    load();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await fetch(`/api/automations/${pendingDelete.id}`, {
      method: 'DELETE',
    });
    setDeleting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? t('toasts.deleteError'));
      return;
    }
    toast.success(t('toasts.deleted'));
    setPendingDelete(null);
    load();
  }

  async function startFromTemplate(slug: TemplateSlug) {
    router.push(`/automations/new?template=${slug}`);
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (automations === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  const showTemplates = automations.length < 3;
  const activeCount = automations.filter((a) => a.is_active).length;
  const totalRuns = automations.reduce(
    (sum, a) => sum + (a.execution_count ?? 0),
    0
  );
  const lastRun = automations
    .map((a) => a.last_executed_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const stats = {
    total: automations.length,
    active: activeCount,
    paused: automations.length - activeCount,
    totalRuns,
    lastRun,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        </div>
        <GatedButton
          canAct={canCreate}
          gateReason={t('createGateReason')}
          onClick={() => router.push('/automations/new')}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('create')}
        </GatedButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AutomationStatCard
          icon={Zap}
          label={t('stats.total')}
          value={stats.total.toLocaleString()}
          detail={t('stats.totalDesc')}
        />
        <AutomationStatCard
          icon={MessageCircle}
          label={t('stats.active')}
          value={stats.active.toLocaleString()}
          detail={t('stats.pausedCount', { count: stats.paused })}
        />
        <AutomationStatCard
          icon={FileText}
          label={t('stats.runs')}
          value={stats.totalRuns.toLocaleString()}
          detail={t('stats.runsDesc')}
        />
        <AutomationStatCard
          icon={Clock}
          label={t('stats.lastRun')}
          value={formatRelativeLabel(stats.lastRun, t)}
          detail={t('stats.lastRunDesc')}
        />
      </div>

      {showTemplates && (
        <section>
          <h2 className="text-muted-foreground mb-3 text-sm font-semibold">
            {t('templatesTitle')}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {TEMPLATE_ORDER.map((slug) => {
              const templateDef = AUTOMATION_TEMPLATES[slug];
              const Icon = TEMPLATE_ICON[slug];
              return (
                <button
                  key={slug}
                  onClick={() => startFromTemplate(slug)}
                  className="group border-border bg-card hover:border-primary/50 hover:bg-card/80 flex flex-col items-start rounded-xl border p-4 text-left transition-colors"
                >
                  <div className="bg-primary/10 text-primary group-hover:bg-primary/15 mb-3 flex h-9 w-9 items-center justify-center rounded-lg">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-foreground text-sm font-semibold">
                    {tTemplates(`${templateDef.slug}.name`)}
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {tTemplates(`${templateDef.slug}.description`)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {automations.length === 0 ? (
        <div className="border-border bg-card/40 flex h-48 flex-col items-center justify-center rounded-xl border border-dashed">
          <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-xl">
            <Zap className="text-primary h-6 w-6" />
          </div>
          <p className="text-foreground mt-3 text-sm font-medium">
            {t('emptyTitle')}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{t('emptyDesc')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onToggle={(next) => toggleActive(a, next)}
              onEdit={() => router.push(`/automations/${a.id}/edit`)}
              onDuplicate={() => duplicate(a)}
              onLogs={() => router.push(`/automations/${a.id}/logs`)}
              onDelete={() => setPendingDelete(a)}
              t={t}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteDesc', { name: pendingDelete?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatRelativeLabel(
  iso: string | null | undefined,
  t: ReturnType<typeof useTranslations>
): string {
  if (!iso) return t('relative.never');
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return t('relative.never');
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return t('relative.justNow');
  if (diffSec < 3600) {
    return t('relative.minutesAgo', { count: Math.floor(diffSec / 60) });
  }
  if (diffSec < 86400) {
    return t('relative.hoursAgo', { count: Math.floor(diffSec / 3600) });
  }
  if (diffSec < 2_592_000) {
    return t('relative.daysAgo', { count: Math.floor(diffSec / 86400) });
  }
  return new Date(iso).toLocaleDateString();
}

function AutomationStatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase">
            {label}
          </p>
          <p className="text-foreground mt-2 text-2xl font-bold">{value}</p>
          <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
        </div>
        <div className="border-primary/20 bg-primary/10 text-primary rounded-lg border p-2">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDuplicate,
  onLogs,
  onDelete,
  t,
}: {
  automation: Automation;
  onToggle: (next: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onLogs: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const meta = triggerMeta(automation.trigger_type);
  const tBuilder = useTranslations('Automations.builder');
  return (
    <li className="border-border bg-card hover:border-border rounded-xl border transition-colors">
      <div className="flex items-center gap-4 p-4">
        <div
          className="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
          aria-hidden
        >
          <Zap className="text-primary h-5 w-5" />
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-foreground truncate text-sm font-semibold">
              {automation.name}
            </span>
            {automation.is_active && (
              <span className="relative flex h-2 w-2" aria-label="active">
                <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
              </span>
            )}
          </div>
          {automation.description && (
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {automation.description}
            </p>
          )}
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                meta.pillClass
              )}
            >
              {tBuilder(`triggers.${automation.trigger_type}.label`)}
            </span>
            <span className="tabular-nums">
              {automation.execution_count === 1
                ? t('runs', { count: automation.execution_count })
                : t('runsPlural', { count: automation.execution_count })}
            </span>
            <span aria-hidden>·</span>
            <span>
              {t('lastRun', {
                time: formatRelativeLabel(automation.last_executed_at, t),
              })}
            </span>
          </div>
        </button>

        <div className="flex items-center gap-3">
          <Switch
            checked={automation.is_active}
            onCheckedChange={(v) => onToggle(!!v)}
            aria-label={automation.is_active ? t('deactivate') : t('activate')}
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t('openMenu')}
              className="text-muted-foreground hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                {t('edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4" />
                {t('duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogs}>
                <FileText className="h-4 w-4" />
                {t('viewLogs')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
                {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
