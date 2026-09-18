'use client';

import type { Deal, PipelineStage } from '@/types';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  Clock3,
  MessageSquare,
  UserRound,
  X,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { useTranslations } from 'next-intl';

interface DealCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  onEdit: (deal: Deal) => void;
  isOverlay?: boolean;
  stageIndex?: number;
  totalStages?: number;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function initials(name?: string, fallback?: string) {
  const source = (name || fallback || '?').trim();
  if (!source) return '?';
  return source.charAt(0).toUpperCase();
}

function daysUntil(dateStr?: string) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateStr}T00:00:00`);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function daysSince(dateStr?: string) {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

export function DealCard({
  deal,
  stage,
  onEdit,
  isOverlay,
  stageIndex = 0,
  totalStages = 1,
}: DealCardProps) {
  const t = useTranslations('Pipelines.card');
  const contactLabel =
    deal.contact?.name || deal.contact?.phone || t('noContact');
  const assigneeLabel = deal.assignee?.full_name || null;
  const dueInDays = daysUntil(deal.expected_close_date);
  const isOverdue =
    typeof dueInDays === 'number' &&
    dueInDays < 0 &&
    deal.status !== 'won' &&
    deal.status !== 'lost';
  const isDueSoon =
    typeof dueInDays === 'number' &&
    dueInDays >= 0 &&
    dueInDays <= 3 &&
    deal.status !== 'won' &&
    deal.status !== 'lost';
  const idleDays = daysSince(deal.updated_at ?? deal.created_at);
  const progress =
    totalStages <= 1 ? 100 : Math.round((stageIndex / (totalStages - 1)) * 100);

  return (
    <button
      type="button"
      onClick={(e) => {
        // `onClick` still fires after a non-drag tap because the PointerSensor
        // requires 5px movement before it counts as a drag.
        if (isOverlay) return;
        e.stopPropagation();
        onEdit(deal);
      }}
      className={`group border-border/50 bg-muted/70 relative w-full cursor-pointer rounded-lg border py-3 pr-3 pl-4 text-left shadow-sm transition-all ${
        isOverlay
          ? 'shadow-xl'
          : 'hover:border-border hover:bg-muted hover:-translate-y-0.5 hover:shadow-lg'
      }`}
    >
      {/* 4px left accent bar using stage color */}
      <span
        aria-hidden
        className="absolute top-0 left-0 h-full w-1 rounded-l-lg"
        style={{ backgroundColor: stage?.color ?? '#94a3b8' }}
      />

      <div className="flex items-start justify-between gap-2">
        <h4 className="text-foreground flex-1 text-sm leading-snug font-semibold break-words">
          {deal.title}
        </h4>
        {deal.status === 'won' && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
            <Check className="h-3 w-3" />
            {t('won')}
          </span>
        )}
        {deal.status === 'lost' && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            <X className="h-3 w-3" />
            {t('lost')}
          </span>
        )}
      </div>

      {/* Contact row */}
      <div className="mt-2 flex items-center gap-2">
        <span className="bg-muted text-foreground flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold">
          {initials(deal.contact?.name, deal.contact?.phone)}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {contactLabel}
        </span>
      </div>

      {deal.contact?.company && (
        <div className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[11px]">
          <Building2 className="h-3 w-3" />
          <span className="truncate">{deal.contact.company}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-primary text-sm font-bold">
          {formatCurrency(deal.value, deal.currency)}
        </span>
        {deal.expected_close_date && (
          <span
            className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] ${
              isOverdue
                ? 'bg-red-500/10 text-red-500'
                : isDueSoon
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'text-muted-foreground'
            }`}
          >
            <Calendar className="h-3 w-3" />
            {formatDate(deal.expected_close_date)}
          </span>
        )}
      </div>

      <div className="bg-background mt-3 h-1.5 rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${progress}%` }}
          title={t('stageProgress', { progress })}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {deal.conversation_id && (
          <span
            title={t('linkedConversation')}
            className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600"
          >
            <MessageSquare className="h-3 w-3" />
            {t('inbox')}
          </span>
        )}
        {isOverdue && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
            <AlertTriangle className="h-3 w-3" />
            {t('overdue')}
          </span>
        )}
        {isDueSoon && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
            <Clock3 className="h-3 w-3" />
            {t('dueSoon')}
          </span>
        )}
        {idleDays >= 7 && deal.status === 'open' && (
          <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
            <Clock3 className="h-3 w-3" />
            {t('idleDays', { count: idleDays })}
          </span>
        )}
        {assigneeLabel ? (
          <span
            title={assigneeLabel}
            className="bg-primary/15 text-primary ml-auto flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
          >
            {initials(assigneeLabel)}
          </span>
        ) : (
          <span className="bg-muted text-muted-foreground ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
            <UserRound className="h-3 w-3" />
            {t('noOwner')}
          </span>
        )}
      </div>
    </button>
  );
}
