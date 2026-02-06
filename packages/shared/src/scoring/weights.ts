/**
 * Scoring weight configuration.
 *
 * Two weight systems:
 * 1. Site-level triage weights (access, drainage, adjacency, etc.) from parcel triage.
 * 2. Deal screener category weights (financial, location, etc.) from deal_screener.py.
 *
 * Ported from legacy/python/gpc_agents/deal_screener.py SCORE_WEIGHTS and
 * the parcel triage risk_scores schema.
 */

// ---------------------------------------------------------------------------
// Site-level triage weights (for parcel/entitlement scoring)
// ---------------------------------------------------------------------------

export type ScoringWeights = {
  access: number; // Road access quality
  drainage: number; // Flood/drainage risk
  adjacency: number; // Adjacent land uses compatibility
  environmental: number; // Environmental contamination risk
  utilities: number; // Utility availability
  politics: number; // Political/community support
  zoning: number; // Zoning compatibility
  acreage: number; // Lot size fit for SKU
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  access: 0.15,
  drainage: 0.15,
  adjacency: 0.10,
  environmental: 0.15,
  utilities: 0.15,
  politics: 0.10,
  zoning: 0.15,
  acreage: 0.05,
};

// ---------------------------------------------------------------------------
// Deal screener category weights (from deal_screener.py)
// ---------------------------------------------------------------------------

export type DealScoringWeights = {
  financial: number;
  location: number;
  utilities: number;
  zoning: number;
  market: number;
  risk: number;
};

/** Default weights from legacy deal_screener agent. */
export const DEFAULT_DEAL_WEIGHTS: DealScoringWeights = {
  financial: 0.30,
  location: 0.20,
  utilities: 0.10,
  zoning: 0.15,
  market: 0.15,
  risk: 0.10,
};

// ---------------------------------------------------------------------------
// Screening playbook scoring bands (from screening.py ScoringBands)
// ---------------------------------------------------------------------------

export type ScoringBands = {
  capRate: number[];
  dscr: number[];
  cashOnCash: number[];
  yieldOnCost: number[];
  yieldSpread: number[];
};

export const DEFAULT_SCORING_BANDS: ScoringBands = {
  capRate: [0.07, 0.08, 0.09, 0.10, 0.11],
  dscr: [1.25, 1.40, 1.55, 1.70, 1.85],
  cashOnCash: [0.06, 0.08, 0.10, 0.12, 0.14],
  yieldOnCost: [0.06, 0.08, 0.10, 0.12, 0.14],
  yieldSpread: [0.015, 0.020, 0.025, 0.030, 0.035],
};
