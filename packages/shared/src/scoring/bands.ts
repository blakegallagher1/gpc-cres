/**
 * Band-based scoring for numeric metrics.
 *
 * Ported from legacy/python/tools/screening.py `_score_from_bands`.
 */

export type ScoreBand = {
  min: number;
  max: number;
  score: number;
  label?: string;
};

/**
 * Score a numeric value based on which band it falls into.
 * Returns a score in the band's defined range.
 *
 * Bands are checked in order; the highest band whose `min` the value meets wins.
 */
export function scoreFromBands(value: number, bands: ScoreBand[]): number {
  if (bands.length === 0) return 0;

  // Find the highest-scoring band where value >= min and value <= max
  let bestScore = 0;
  for (const band of bands) {
    if (value >= band.min && value <= band.max) {
      if (band.score > bestScore) {
        bestScore = band.score;
      }
    }
  }
  return bestScore;
}

/**
 * Score a value against ascending threshold bands (1-5 scale).
 *
 * This mirrors the Python `_score_from_bands` exactly:
 * each threshold in `thresholds` is the floor for scores 1..N.
 * Values below the first threshold still score 1.
 *
 * @param value - The numeric value to score
 * @param thresholds - Ascending threshold list (e.g. [0.07, 0.08, 0.09, 0.10, 0.11])
 * @returns Score from 1 to thresholds.length, or null if value is null/undefined
 */
export function scoreFromThresholds(
  value: number | null | undefined,
  thresholds: number[],
): number | null {
  if (value == null) return null;
  if (thresholds.length === 0) return null;

  let score = 1;
  for (let idx = 0; idx < thresholds.length; idx++) {
    if (value >= thresholds[idx]) {
      score = idx + 1;
    }
  }
  return score;
}
