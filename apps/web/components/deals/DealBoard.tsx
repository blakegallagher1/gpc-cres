"use client";

import { useCallback, type DragEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkuBadge } from "@/components/deals/SkuBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { TriageIndicator } from "@/components/deals/TriageIndicator";
import type { DealSummary } from "@/components/deals/DealCard";
import {
  DEAL_BOARD_STAGES,
  DEAL_STATUS_LABELS,
  STAGE_COMPATIBILITY_BY_KEY,
  type BoardStatus,
  type DealStageKey,
  getDefaultStatusForStage,
  resolveBoardStageFromStatus,
} from "@/components/deals/dealStatusMeta";
import { formatDate } from "@/lib/utils";

interface DealBoardProps {
  deals: DealSummary[];
  movingDealIds?: Set<string>;
  onMoveStatus: (dealId: string, status: BoardStatus) => Promise<void> | void;
}

interface BoardColumnStage {
  key: DealStageKey;
  label: string;
}

interface DealBoardDealState {
  deal: DealSummary;
}

function isKnownStage(stageKey: string | null | undefined): stageKey is DealStageKey {
  return stageKey ? stageKey in STAGE_COMPATIBILITY_BY_KEY : false;
}

function getBoardStageFromDeal(deal: DealSummary): DealStageKey | null {
  if (isKnownStage(deal.currentStageKey)) {
    return deal.currentStageKey;
  }

  return resolveBoardStageFromStatus(deal.status);
}

function buildBoardGroup(deals: DealSummary[]) {
  const grouped = new Map<string, DealBoardDealState[]>(
    DEAL_BOARD_STAGES.map((stage) => [stage.key, []]),
  );
  const untracked: DealBoardDealState[] = [];

  for (const deal of deals) {
    const stageKey = getBoardStageFromDeal(deal);
    if (!stageKey) {
      untracked.push({ deal });
      continue;
    }
    grouped.get(stageKey)?.push({ deal });
  }

  for (const stage of DEAL_BOARD_STAGES) {
    const sorted = grouped.get(stage.key) ?? [];
    grouped.set(
      stage.key,
      [...sorted].sort((left, right) =>
        left.deal.createdAt.localeCompare(right.deal.createdAt),
      ),
    );
  }

  return { grouped, untracked };
}

function DealBoardCard({
  deal,
  currentIndex,
  isBusy,
  fromStageKey,
  onMovePrev,
  onMoveNext,
}: {
  deal: DealSummary;
  fromStageKey: DealStageKey;
  currentIndex: number;
  isBusy: boolean;
  onMovePrev: () => void;
  onMoveNext: () => void;
}) {
  const canMovePrev = currentIndex > 0;
  const canMoveNext = currentIndex < DEAL_BOARD_STAGES.length - 1;
  const previousStatus = canMovePrev
    ? getDefaultStatusForStage(DEAL_BOARD_STAGES[currentIndex - 1].key)
    : null;
  const nextStatus = canMoveNext
    ? getDefaultStatusForStage(DEAL_BOARD_STAGES[currentIndex + 1].key)
    : null;

  const handleDragStart = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", deal.id);
    event.dataTransfer.setData("application/x-board-stage", fromStageKey);
    event.dataTransfer.effectAllowed = "move";
  }, [deal.id, fromStageKey]);

  return (
    <div
      className="cursor-grab rounded-lg border p-3 transition hover:-translate-y-0.5 hover:shadow-sm"
      draggable
      onDragStart={handleDragStart}
      data-deal-id={deal.id}
    >
      <div className="space-y-2">
        <Link href={`/deals/${deal.id}`} className="block">
          <CardTitle className="text-sm leading-tight text-balance text-foreground hover:underline">
            {deal.name}
          </CardTitle>
        </Link>

        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <SkuBadge sku={deal.sku} />
          <StatusBadge status={deal.status} />
        </div>

        <p className="text-xs text-muted-foreground">
          {deal.jurisdiction?.name ?? "No jurisdiction"}
        </p>
        <p className="text-xs text-muted-foreground">Created {formatDate(deal.createdAt)}</p>

        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <TriageIndicator tier={deal.triageTier} showLabel />
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={onMovePrev}
              disabled={isBusy || !canMovePrev || !previousStatus}
              aria-label={`Move ${deal.name} to ${previousStatus ? DEAL_STATUS_LABELS[previousStatus] : "previous stage"}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={onMoveNext}
              disabled={isBusy || !canMoveNext || !nextStatus}
              aria-label={`Move ${deal.name} to ${nextStatus ? DEAL_STATUS_LABELS[nextStatus] : "next stage"}`}
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardColumn({
  stage,
  deals,
  movingDealIds,
  onMoveStatus,
}: {
  stage: BoardColumnStage;
  deals: DealBoardDealState[];
  movingDealIds: Set<string>;
  onMoveStatus: (dealId: string, status: BoardStatus) => Promise<void> | void;
}) {
  const stageIndex = DEAL_BOARD_STAGES.findIndex((value) => value.key === stage.key);
  const nextStatus = stageIndex < DEAL_BOARD_STAGES.length - 1
    ? getDefaultStatusForStage(DEAL_BOARD_STAGES[stageIndex + 1].key)
    : null;
  const previousStatus = stageIndex > 0
    ? getDefaultStatusForStage(DEAL_BOARD_STAGES[stageIndex - 1].key)
    : null;

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const dealId = event.dataTransfer.getData("text/plain");
      if (!dealId) return;
      const sourceStage = event.dataTransfer.getData("application/x-board-stage");
      if (sourceStage === stage.key) return;
      const targetStatus = getDefaultStatusForStage(stage.key);
      if (!targetStatus) return;

      onMoveStatus(dealId, targetStatus);
    },
    [onMoveStatus, stage.key],
  );

  return (
    <Card
      className="h-full min-h-[180px]"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-board-stage={stage.key}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{stage.label}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {deals.length} deal{deals.length === 1 ? "" : "s"}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {deals.length === 0 ? (
          <p className="rounded-md border border-dashed border-muted-foreground/25 px-2 py-6 text-center text-xs text-muted-foreground">
            No deals in this stage
          </p>
        ) : (
          deals.map((dealState) => {
            const isMoving = movingDealIds.has(dealState.deal.id);
            return (
              <DealBoardCard
                key={dealState.deal.id}
                deal={dealState.deal}
                currentIndex={stageIndex}
                fromStageKey={stage.key}
                isBusy={isMoving}
                onMovePrev={() => {
                  if (!previousStatus) return;
                  onMoveStatus(dealState.deal.id, previousStatus);
                }}
                onMoveNext={() => {
                  if (!nextStatus) return;
                  onMoveStatus(dealState.deal.id, nextStatus);
                }}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function DealBoard({ deals, movingDealIds = new Set(), onMoveStatus }: DealBoardProps) {
  const groupedDeals = buildBoardGroup(deals);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {DEAL_BOARD_STAGES.map((stage) => (
          <BoardColumn
            key={stage.key}
            stage={stage}
            deals={groupedDeals.grouped.get(stage.key) ?? []}
            movingDealIds={movingDealIds}
            onMoveStatus={onMoveStatus}
          />
        ))}
      </div>

      {groupedDeals.untracked.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Closed / Untracked</CardTitle>
            <p className="text-xs text-muted-foreground">Deals with unmatched board status</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {groupedDeals.untracked.map((entry) => (
              <div key={entry.deal.id} className="rounded-lg border border-dashed p-3">
                <Link href={`/deals/${entry.deal.id}`} className="font-medium hover:underline">
                  {entry.deal.name}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.deal.status}
                </p>
                <StatusBadge status={entry.deal.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
