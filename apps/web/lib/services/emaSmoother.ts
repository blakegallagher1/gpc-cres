import "server-only";

import { EMA_ALPHA } from "./promotionConfig";

/**
 * Exponential Moving Average (EMA) smoother.
 * Used to track drift in segment MAE over consecutive recomputes.
 *
 * EMA(t) = α * newValue + (1 - α) * previousEma
 */
export function computeEma(newValue: number, previousEma: number | null): number {
  if (previousEma === null || !Number.isFinite(previousEma)) {
    return newValue;
  }
  return EMA_ALPHA * newValue + (1 - EMA_ALPHA) * previousEma;
}

/**
 * Determines if MAE has worsened (increased) compared to previous.
 * Returns true if newMae > previousMae (worse calibration).
 */
export function hasWorsened(newMae: number, previousMae: number | null): boolean {
  if (previousMae === null || !Number.isFinite(previousMae)) {
    return false;
  }
  return newMae > previousMae;
}
