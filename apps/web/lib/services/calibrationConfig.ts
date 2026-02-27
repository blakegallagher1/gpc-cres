import "server-only";

export const CALIBRATION_MINIMUMS = {
  MIN_N: 5,
  VARIANCE_CEILING: 0.25,
  CONFIDENCE_FLOOR: 0.6,
  BAND_WIDENING_PENALTY: 0.15,
} as const;
