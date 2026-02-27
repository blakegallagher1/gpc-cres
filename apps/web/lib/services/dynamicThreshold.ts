import "server-only";

import { prisma } from "@entitlement-os/db";
import { BASE_PROMOTION_THRESHOLD, MIN_CALIBRATION_SAMPLES } from "./promotionConfig";

/**
 * Dynamic threshold adjustment.
 *
 * Adjusts the base promotion threshold based on:
 * 1. Volatility class — high_volatility gets +0.05 (harder to promote)
 * 2. Sample size — few samples → +0.05 (conservative when data is scarce)
 * 3. MAE drift — if segment MAE is high → raise threshold proportionally
 *
 * Final threshold is clamped to [0.4, 0.95].
 */

interface ThresholdContext {
  orgId: string;
  entityId: string;
  volatilityClass: string;
}

export interface ThresholdResult {
  threshold: number;
  baseThreshold: number;
  adjustments: Record<string, number>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function computeDynamicThreshold(
  context: ThresholdContext,
): Promise<ThresholdResult> {
  const adjustments: Record<string, number> = {};
  let threshold = BASE_PROMOTION_THRESHOLD;

  // 1. Volatility adjustment
  if (context.volatilityClass === "high_volatility") {
    adjustments.volatility = 0.05;
    threshold += 0.05;
  } else if (context.volatilityClass === "cyclical") {
    adjustments.volatility = 0.02;
    threshold += 0.02;
  } else {
    adjustments.volatility = 0;
  }

  // 2. Sample size + MAE drift from calibration segment
  const entity = await prisma.internalEntity.findFirst({
    where: { id: context.entityId, orgId: context.orgId },
    select: { type: true },
  });

  const propertyType = entity?.type ?? "property";

  const segment = await prisma.calibrationSegment.findFirst({
    where: { orgId: context.orgId, propertyType },
    orderBy: { sampleN: "desc" },
    select: { sampleN: true, mae: true },
  });

  if (!segment || segment.sampleN < MIN_CALIBRATION_SAMPLES) {
    // Scarce data → conservative
    adjustments.sampleSize = 0.05;
    threshold += 0.05;
  } else {
    adjustments.sampleSize = 0;
  }

  // 3. MAE drift — if MAE > 0.15, raise threshold proportionally
  if (segment?.mae !== null && segment?.mae !== undefined) {
    const maePenalty = segment.mae > 0.15 ? clamp(segment.mae * 0.3, 0, 0.15) : 0;
    adjustments.maeDrift = maePenalty;
    threshold += maePenalty;
  } else {
    adjustments.maeDrift = 0;
  }

  return {
    threshold: clamp(threshold, 0.4, 0.95),
    baseThreshold: BASE_PROMOTION_THRESHOLD,
    adjustments,
  };
}
