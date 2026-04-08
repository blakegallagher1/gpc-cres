import { prisma } from "@entitlement-os/db";

const EMA_ALPHA = 0.3;
const DRIFT_FREEZE_CONSECUTIVE_THRESHOLD = 3;

export interface DriftFreezeStatus {
  frozen: boolean;
  consecutiveWorsenings: number;
  lastMae: number | null;
  previousMae: number | null;
  frozenAt: Date | null;
}

function computeEma(newValue: number, previousEma: number | null): number {
  if (previousEma === null || !Number.isFinite(previousEma)) {
    return newValue;
  }
  return EMA_ALPHA * newValue + (1 - EMA_ALPHA) * previousEma;
}

function hasWorsened(newMae: number, previousMae: number | null): boolean {
  if (previousMae === null || !Number.isFinite(previousMae)) {
    return false;
  }
  return newMae > previousMae;
}

export async function isSegmentFrozen(orgId: string, segmentId: string): Promise<boolean> {
  const state = await prisma.driftFreezeState.findFirst({
    where: { orgId, segmentId },
    select: { frozen: true },
  });
  return state?.frozen ?? false;
}

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
  const consecutiveWorsenings = worsened ? (existing?.consecutiveWorsenings ?? 0) + 1 : 0;
  const shouldFreeze = consecutiveWorsenings >= DRIFT_FREEZE_CONSECUTIVE_THRESHOLD;

  if (existing) {
    await prisma.driftFreezeState.update({
      where: { id: existing.id },
      data: {
        consecutiveWorsenings,
        previousMae,
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
        consecutiveWorsenings,
        previousMae,
        lastMae: emaMae,
        frozen: shouldFreeze,
        frozenAt: shouldFreeze ? new Date() : null,
      },
    });
  }

  return {
    frozen: shouldFreeze || (existing?.frozen ?? false),
    consecutiveWorsenings,
  };
}

export async function unfreezeSegment(
  orgId: string,
  segmentId: string,
  unfrozenBy: string,
): Promise<void> {
  const state = await prisma.driftFreezeState.findFirst({
    where: { orgId, segmentId },
  });

  if (!state) {
    return;
  }

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
