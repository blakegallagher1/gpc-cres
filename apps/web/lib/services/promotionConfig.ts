import "server-only";

/**
 * Confidence vector dimension weights for promotion scoring.
 * Sum to 1.0 (before anomaly penalty).
 */
export const PROMOTION_WEIGHTS = {
  structural_confidence: 0.30,
  source_reliability_score: 0.25,
  cross_memory_agreement_score: 0.25,
  calibration_support_score: 0.20,
} as const;

/** Anomaly penalty coefficient — multiplied by anomaly_score and subtracted from weighted sum. */
export const ANOMALY_PENALTY_COEFF = 0.15;

/** Default promotion threshold. Dynamic threshold adjusts this based on volatility + sample size + drift. */
export const BASE_PROMOTION_THRESHOLD = 0.65;

/** Minimum samples before calibration_support_score contributes (fallback to 0.5). */
export const MIN_CALIBRATION_SAMPLES = 3;

/** EMA smoothing factor for MAE drift tracking. */
export const EMA_ALPHA = 0.3;

/** Number of consecutive MAE worsenings before drift freeze triggers. */
export const DRIFT_FREEZE_CONSECUTIVE_THRESHOLD = 3;

/** Novelty detection thresholds. */
export const NOVELTY_THRESHOLDS = {
  /** Source reliability must be above this to be considered "high reliability". */
  HIGH_SOURCE_RELIABILITY: 0.7,
  /** Agreement score must be below this to be considered "low agreement" (novel). */
  LOW_AGREEMENT: 0.3,
} as const;

/** Calibration eviction: max records per segment before oldest are purged. */
export const MAX_CALIBRATION_RECORDS_PER_SEGMENT = 200;
