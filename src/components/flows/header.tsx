'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  CircleDot,
  History,
  Loader2,
  PauseCircle,
  PlayCircle,
  Save,
  Trash2,
  Workflow,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFlowEditor, type BuilderState } from './flow-editor-state';

export function EditorHeader() {
  const router = useRouter();
  const t = useTranslations('Flows.header');
  const {
    flow,
    state,
    setState,
    dirty,
    saving,
    activating,
    canActivate,
    save,
    setStatus,
    deleteFlow,
  } = useFlowEditor();

  return (
    <div className="flex flex-col gap-1.5 px-6 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/flows')}
          title={t('back')}
          aria-label={t('back')}
          className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="bg-primary-soft text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          <Workflow className="h-[18px] w-[18px]" />
        </span>
        <input
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder={t('namePlaceholder')}
          spellCheck={false}
          aria-label={t('namePlaceholder')}
          className="text-foreground hover:bg-muted focus:border-primary max-w-[340px] min-w-[120px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg leading-tight font-bold tracking-tight transition-colors outline-none focus:bg-transparent focus:shadow-[0_0_0_3px_var(--primary-soft)]"
        />
        <StatusChip status={state.status} t={t} />
        {dirty && (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium tracking-wide text-amber-300 uppercase"
            title={t('dirtyTitle')}
            aria-live="polite"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {t('edited')}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/flows/${flow.id}/runs`)}
          >
            <History className="h-3.5 w-3.5" />
            {t('runs')}
            <span className="bg-muted text-muted-foreground ml-0.5 rounded px-1.5 py-0.5 font-mono text-[11px]">
              {flow.execution_count}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void deleteFlow()}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('delete')}
          </Button>
          {state.status === 'active' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void setStatus('draft')}
              disabled={activating}
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PauseCircle className="h-3.5 w-3.5" />
              )}
              {t('pause')}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void setStatus('active')}
              disabled={activating || !canActivate}
              title={!canActivate ? t('fixBeforeActivate') : undefined}
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              {t('activate')}
            </Button>
          )}
          <Button onClick={() => void save()} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {t('save')}
          </Button>
        </div>
      </div>

      <input
        value={state.description}
        onChange={(e) =>
          setState((s) => ({ ...s, description: e.target.value }))
        }
        placeholder={t('descriptionPlaceholder')}
        aria-label={t('descriptionAria')}
        className="text-muted-foreground placeholder:text-muted-foreground/60 hover:bg-muted/50 focus:border-primary focus:text-foreground w-full max-w-[78ch] rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] transition-colors outline-none focus:bg-transparent"
      />
    </div>
  );
}

function StatusChip({
  status,
  t,
}: {
  status: BuilderState['status'];
  t: ReturnType<typeof useTranslations>;
}) {
  const cfg = {
    draft: {
      cls: 'border-border bg-muted text-muted-foreground',
      label: t('statusDraft'),
    },
    active: {
      cls: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-300',
      label: t('statusActive'),
    },
    archived: {
      cls: 'border-border bg-muted/50 text-muted-foreground',
      label: t('statusArchived'),
    },
  }[status];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium',
        cfg.cls
      )}
    >
      <CircleDot className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
