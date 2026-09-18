'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Deal, PipelineStage } from '@/types';
import { DealCard } from './deal-card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Plus, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { useTranslations } from 'next-intl';

interface PipelineBoardProps {
  stages: PipelineStage[];
  deals: Deal[];
  onDealMoved: (dealId: string, newStageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onOpenDeal: (deal: Deal) => void;
}

export function PipelineBoard({
  stages,
  deals,
  onDealMoved,
  onAddDeal,
  onOpenDeal,
}: PipelineBoardProps) {
  const { defaultCurrency } = useAuth();
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages]
  );

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of sortedStages) map.set(stage.id, []);
    for (const deal of deals) {
      const bucket = map.get(deal.stage_id);
      if (bucket) bucket.push(deal);
    }
    return map;
  }, [sortedStages, deals]);

  const sensors = useSensors(
    // 5px activation distance avoids clicks being interpreted as drags.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Keyboard drag support: focus a card, Space to pick up, arrows to move,
    // Space to drop, Escape to cancel.
    useSensor(KeyboardSensor)
  );

  const activeDeal = activeDealId
    ? (deals.find((d) => d.id === activeDealId) ?? null)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveDealId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDealId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const targetStageId = String(over.id);

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === targetStageId) return;
    if (!sortedStages.some((s) => s.id === targetStageId)) return;

    onDealMoved(dealId, targetStageId);
  }

  function handleDragCancel() {
    setActiveDealId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* snap-x + snap-mandatory on mobile so swipes land the next
          stage cleanly at the viewport edge instead of mid-column.
          Disabled on lg+ where snapping would interfere with the
          natural layout. The board can still overflow horizontally on
          lg+ once a pipeline has many stages (columns keep a 260px
          min-width), so a thin scrollbar stays visible on desktop. */}
      <div className="pipeline-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:snap-none">
        {sortedStages.map((stage, stageIndex) => {
          const stageDeals = dealsByStage.get(stage.id) ?? [];
          const totalValue = stageDeals.reduce(
            (s, d) => (d.status === 'lost' ? s : s + Number(d.value || 0)),
            0
          );
          return (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={stageDeals}
              stageIndex={stageIndex}
              totalStages={sortedStages.length}
              totalValue={totalValue}
              currency={defaultCurrency}
              onAddDeal={onAddDeal}
              onOpenDeal={onOpenDeal}
            />
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        {activeDeal ? (
          <div className="opacity-90">
            <DealCard
              deal={activeDeal}
              stage={
                sortedStages.find((s) => s.id === activeDeal.stage_id) ?? null
              }
              onEdit={() => {}}
              isOverlay
              stageIndex={sortedStages.findIndex(
                (stage) => stage.id === activeDeal.stage_id
              )}
              totalStages={sortedStages.length}
            />
          </div>
        ) : null}
      </DragOverlay>

      <style jsx>{`
        .pipeline-scroll {
          scroll-behavior: smooth;
        }
        /* On touch devices the peek/snap layout already signals there's
           more to swipe, so the scrollbar is hidden for a clean look.
           On desktop (mouse) the board can overflow with many stages
           and there is no peek hint, so keep a thin, themed scrollbar
           visible to make the overflow discoverable and usable. */
        @media (hover: none), (pointer: coarse) {
          .pipeline-scroll::-webkit-scrollbar {
            height: 0;
            display: none;
          }
          .pipeline-scroll {
            scrollbar-width: none;
          }
        }
        @media (hover: hover) and (pointer: fine) {
          .pipeline-scroll {
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
          }
          .pipeline-scroll::-webkit-scrollbar {
            height: 8px;
          }
          .pipeline-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 9999px;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted-foreground);
          }
        }
      `}</style>
    </DndContext>
  );
}

function StageColumn({
  stage,
  deals,
  stageIndex,
  totalStages,
  totalValue,
  currency,
  onAddDeal,
  onOpenDeal,
}: {
  stage: PipelineStage;
  deals: Deal[];
  stageIndex: number;
  totalStages: number;
  totalValue: number;
  currency: string;
  onAddDeal: (stageId: string) => void;
  onOpenDeal: (deal: Deal) => void;
}) {
  const t = useTranslations('Pipelines.board');
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const activeDeals = deals.filter((deal) => deal.status !== 'lost');
  const avgValue = activeDeals.length > 0 ? totalValue / activeDeals.length : 0;
  const overdueCount = activeDeals.filter(isDealOverdue).length;
  const unassignedCount = activeDeals.filter(
    (deal) => !deal.assigned_to
  ).length;

  return (
    // On mobile each column is `w-[85vw]` (with a reasonable min/max)
    // so the next column's edge peeks in — a "there's more here" hint.
    // snap-start lands each column cleanly when swiping. On lg+ we
    // restore the flex-1 share-the-row behavior. The droppable ref is
    // on the inner messages region below — intentionally NOT here, so
    // a drag over the column header doesn't highlight the whole column.
    <div className="border-border bg-card/60 flex w-[85vw] max-w-[340px] min-w-[280px] shrink-0 snap-start flex-col rounded-lg border p-4 lg:w-auto lg:max-w-none lg:flex-1 lg:shrink lg:basis-[280px] lg:snap-none">
      {/* 3px colored top border — sits above the column's padding */}
      <div
        className="-mx-4 -mt-4 h-[3px] rounded-t-lg"
        style={{ backgroundColor: stage.color }}
      />
      <div className="flex items-center justify-between pt-3">
        <h3 className="text-foreground truncate text-sm font-semibold">
          {stage.name}
        </h3>
        <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">
          {deals.length}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        {formatCurrency(totalValue, currency)}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <StageMetric
          label={t('avg')}
          value={formatCurrency(avgValue, currency)}
        />
        <StageMetric
          label={t('overdue')}
          value={String(overdueCount)}
          icon={<AlertTriangle className="h-3 w-3 text-red-500" />}
        />
        <StageMetric
          label={t('noOwner')}
          value={String(unassignedCount)}
          icon={<UserRound className="text-muted-foreground h-3 w-3" />}
        />
      </div>

      <div
        ref={setNodeRef}
        className={`mt-3 flex flex-1 flex-col gap-2 rounded-lg transition-all ${
          isOver
            ? 'bg-primary/5 outline-primary outline outline-2 outline-offset-2 outline-dashed'
            : ''
        }`}
      >
        {deals.length === 0 ? (
          <div className="border-border text-muted-foreground flex flex-1 items-center justify-center rounded-lg border-2 border-dashed py-10 text-xs">
            {t('dropDealHere')}
          </div>
        ) : (
          deals.map((deal) => (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              stage={stage}
              stageIndex={stageIndex}
              totalStages={totalStages}
              onOpen={onOpenDeal}
            />
          ))
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddDeal(stage.id)}
        className="border-border text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground mt-3 w-full justify-start border border-dashed bg-transparent"
      >
        <Plus className="mr-1 h-3 w-3" />
        {t('addDeal')}
      </Button>
    </div>
  );
}

function DraggableDealCard({
  deal,
  stage,
  stageIndex,
  totalStages,
  onOpen,
}: {
  deal: Deal;
  stage: PipelineStage;
  stageIndex: number;
  totalStages: number;
  onOpen: (deal: Deal) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: 'none' }}
    >
      <DealCard
        deal={deal}
        stage={stage}
        stageIndex={stageIndex}
        totalStages={totalStages}
        onEdit={onOpen}
      />
    </div>
  );
}

function StageMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-muted/60 min-w-0 rounded-md px-2 py-1.5">
      <div className="text-muted-foreground flex items-center gap-1 text-[10px]">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-foreground mt-0.5 truncate text-xs font-semibold">
        {value}
      </p>
    </div>
  );
}

function isDealOverdue(deal: Deal) {
  if (
    !deal.expected_close_date ||
    deal.status === 'won' ||
    deal.status === 'lost'
  ) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${deal.expected_close_date}T00:00:00`) < today;
}
