import { prisma } from "@entitlement-os/db";

// ---------------------------------------------------------------------------
// Constants (duplicated from apps/web promotionConfig — do NOT move that file,
// it is imported by 7 web-layer services)
// ---------------------------------------------------------------------------

const EMA_ALPHA = 0.3;
const DRIFT_FREEZE_CONSECUTIVE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Pure helpers (inlined from emaSmoother.ts)
// ---------------------------------------------------------------------------

function computeEma(newValue: number, previousEma: number | null): number {
  if (previousEma === null || !Number.isFinite(previousEma)) return newValue;
  return EMA_ALPHA * newValue + (1 - EMA_ALPHA) * previousEma;
}

function hasWorsened(newMae: number, previousMae: number | null): boolean {
  if (previousMae === null || !Number.isFinite(previousMae)) return false;
  return newMae > previousMae;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriftMonitorResult {
  segmentId: string;
  frozen: boolean;
  consecutiveWorsenings: number;
}

export interface DriftMonitorSummary {
  success: true;
  segmentsChecked: number;
  frozenSegments: number;
  results: DriftMonitorResult[];
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function trackDrift(
  orgId: string,
  segmentId: string,
  newMae: number,
): Promise<{ frozen: boolean; consecutiveWorsenings: number }> {
  const existing = await prisma.driftFreezeState.findFirst({
    where: { orgId, segmentId },
  });

  const previousMae = existing?.lastMae ?? null;
  const emaMae = computeEma(newMae, previousMae);
  const worsened = hasWorsened(emaMae, previousMae);

  const newConsecutive = worsened
    ? (existing?.consecutiveWorsenings ?? 0) + 1
    : 0;

  const shouldFreeze = newConsecutive >= DRIFT_FREEZE_CONSECUTIVE_THRESHOLD;

  if (existing) {
    await prisma.driftFreezeState.update({
      where: { id: existing.id },
      data: {
        consecutiveWorsenings: newConsecutive,
        previousMae,
        lastMae: emaMae,
        frozen: shouldFreeze || existing.frozen,
        frozenAt:
          shouldFreeze && !existing.frozen ? new Date() : existing.frozenAt,
      },
    });
  } else {
    await prisma.driftFreezeState.create({
      data: {
        orgId,
        segmentId,
        consecutiveWorsenings: newConsecutive,
        previousMae,
        lastMae: emaMae,
        frozen: shouldFreeze,
        frozenAt: shouldFreeze ? new Date() : null,
      },
    });
  }

  return {
    frozen: shouldFreeze || (existing?.frozen ?? false),
    consecutiveWorsenings: newConsecutive,
  };
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runDriftMonitor(): Promise<DriftMonitorSummary> {
  const segments = await prisma.calibrationSegment.findMany({
    select: { id: true, orgId: true, mae: true },
  });

  const results: DriftMonitorResult[] = [];

  for (const segment of segments) {
    if (segment.mae === null) continue;

    const result = await trackDrift(segment.orgId, segment.id, segment.mae);
    results.push({ segmentId: segment.id, ...result });
  }

  const frozenCount = results.filter((r) => r.frozen).length;

  return {
    success: true,
    segmentsChecked: results.length,
    frozenSegments: frozenCount,
    results,
  };
}
