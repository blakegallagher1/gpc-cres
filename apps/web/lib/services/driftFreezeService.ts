import "server-only";

import { prisma } from "@entitlement-os/db";
import { computeEma, hasWorsened } from "./emaSmoother";
import { DRIFT_FREEZE_CONSECUTIVE_THRESHOLD } from "./promotionConfig";

/**
 * Drift Freeze Protocol.
 *
 * When a calibration segment's MAE worsens over DRIFT_FREEZE_CONSECUTIVE_THRESHOLD
 * consecutive recomputes, freeze calibration updates for that segment.
 * Corrections are still allowed (they bypass the freeze).
 * Requires human unlock to unfreeze.
 */

export interface DriftFreezeStatus {
  frozen: boolean;
  consecutiveWorsenings: number;
  lastMae: number | null;
  previousMae: number | null;
  frozenAt: Date | null;
}

/**
 * Check if a segment is currently frozen.
 */
export async function isSegmentFrozen(
  orgId: string,
  segmentId: string,
): Promise<boolean> {
  const state = await prisma.driftFreezeState.findFirst({
    where: { orgId, segmentId },
    select: { frozen: true },
  });
  return state?.frozen ?? false;
}

/**
 * Get the full drift freeze status for a segment.
 */
export async function getDriftFreezeStatus(
  orgId: string,
  segmentId: string,
): Promise<DriftFreezeStatus> {
  const state = await prisma.driftFreezeState.findFirst({
    where: { orgId, segmentId },
  });

  if (!state) {
    return {
      frozen: false,
      consecutiveWorsenings: 0,
      lastMae: null,
      previousMae: null,
      frozenAt: null,
    };
  }

  return {
    frozen: state.frozen,
    consecutiveWorsenings: state.consecutiveWorsenings,
    lastMae: state.lastMae,
    previousMae: state.previousMae,
    frozenAt: state.frozenAt,
  };
}

/**
 * Update drift tracking after a calibration recompute.
 * Called after each segment MAE recomputation.
 *
 * Returns whether the segment became frozen as a result.
 */
export async function trackDrift(
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
        previousMae: previousMae,
        lastMae: emaMae,
        frozen: shouldFreeze || existing.frozen,
        frozenAt: shouldFreeze && !existing.frozen ? new Date() : existing.frozenAt,
      },
    });
  } else {
    await prisma.driftFreezeState.create({
      data: {
        orgId,
        segmentId,
        consecutiveWorsenings: newConsecutive,
        previousMae: previousMae,
        lastMae: emaMae,
        frozen: shouldFreeze,
        frozenAt: shouldFreeze ? new Date() : null,
      },
    });
  }

  return { frozen: shouldFreeze || (existing?.frozen ?? false), consecutiveWorsenings: newConsecutive };
}

/**
 * Manually unfreeze a segment (human unlock).
 */
export async function unfreezeSegment(
  orgId: string,
  segmentId: string,
  unfrozenBy: string,
): Promise<void> {
  const state = await prisma.driftFreezeState.findFirst({
    where: { orgId, segmentId },
  });

  if (!state) return;

  await prisma.driftFreezeState.update({
    where: { id: state.id },
    data: {
      frozen: false,
      consecutiveWorsenings: 0,
      unfrozenAt: new Date(),
      unfrozenBy,
    },
  });
}
