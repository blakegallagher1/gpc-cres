/**
 * Hard filters that auto-KILL a deal.
 *
 * Two kinds of hard filters:
 * 1. Site-level (qualitative): flood zone, contamination, zoning incompatibility, no utilities/access.
 * 2. Financial: DSCR, cap rate, yield spread below thresholds.
 *
 * Site-level filters are ported from the deal_screener agent's triage logic.
 * Financial filters are ported from legacy/python/tools/screening.py `HardFilterCheck`.
 */

// ---------------------------------------------------------------------------
// FEMA Special Flood Hazard Area zones
// ---------------------------------------------------------------------------

/** FEMA zones that constitute Special Flood Hazard Areas (high risk). */
const SFHA_ZONES = new Set(["A", "AE", "AH", "AO", "AR", "A99", "V", "VE"]);

// ---------------------------------------------------------------------------
// Site-level hard filters
// ---------------------------------------------------------------------------

export type HardFilterInput = {
  floodZone?: string; // FEMA zone (A, AE, V, X, etc.)
  isContaminated?: boolean;
  currentZoning?: string;
  proposedUse?: string; // SKU type
  hasUtilities?: boolean;
  hasAccess?: boolean;
};

export type HardFilterResult = {
  passed: boolean;
  disqualifiers: string[];
};

/**
 * Check site-level hard filters that auto-KILL a deal.
 *
 * Missing inputs are NOT treated as failures (same convention as Python).
 */
export function hardFilterCheck(input: HardFilterInput): HardFilterResult {
  const disqualifiers: string[] = [];

  // 1. SFHA flood zone
  if (input.floodZone != null) {
    const zone = input.floodZone.trim().toUpperCase();
    if (SFHA_ZONES.has(zone)) {
      disqualifiers.push(`SFHA flood zone: ${zone}`);
    }
  }

  // 2. Environmental contamination
  if (input.isContaminated === true) {
    disqualifiers.push("Environmental contamination present");
  }

  // 3. No utilities
  if (input.hasUtilities === false) {
    disqualifiers.push("No utility access");
  }

  // 4. No road access
  if (input.hasAccess === false) {
    disqualifiers.push("No road access");
  }

  // 5. Zoning incompatibility (basic check)
  if (input.currentZoning != null && input.proposedUse != null) {
    const zoning = input.currentZoning.trim().toUpperCase();
    const use = input.proposedUse.trim().toUpperCase();

    // Residential-only zones are incompatible with industrial SKUs
    const residentialZones = new Set(["R-1", "R1", "R-2", "R2", "R-3", "R3", "RS", "RE"]);
    const industrialUses = new Set(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"]);

    if (residentialZones.has(zoning) && industrialUses.has(use)) {
      disqualifiers.push(`Zoning ${input.currentZoning} incompatible with ${input.proposedUse}`);
    }
  }

  return {
    passed: disqualifiers.length === 0,
    disqualifiers,
  };
}

// ---------------------------------------------------------------------------
// Financial hard filters (from Python HardFilterCheck)
// ---------------------------------------------------------------------------

export type FinancialHardFilterThresholds = {
  minDscr: number;
  minCapRate: number;
  minYieldSpread: number;
};

export const DEFAULT_FINANCIAL_HARD_FILTERS: FinancialHardFilterThresholds = {
  minDscr: 1.25,
  minCapRate: 0.07,
  minYieldSpread: 0.015,
};

export type FinancialHardFilterInput = {
  dscr?: number | null;
  capRate?: number | null;
  yieldSpread?: number | null;
};

/**
 * Check financial hard filters.
 * Only fails when the value is present AND below the threshold.
 * Missing values do not trigger a failure (same as Python).
 */
export function financialHardFilterCheck(
  input: FinancialHardFilterInput,
  thresholds: FinancialHardFilterThresholds = DEFAULT_FINANCIAL_HARD_FILTERS,
): HardFilterResult {
  const disqualifiers: string[] = [];

  if (input.dscr != null && input.dscr < thresholds.minDscr) {
    disqualifiers.push("dscr");
  }
  if (input.capRate != null && input.capRate < thresholds.minCapRate) {
    disqualifiers.push("cap_rate");
  }
  if (input.yieldSpread != null && input.yieldSpread < thresholds.minYieldSpread) {
    disqualifiers.push("yield_spread");
  }

  return {
    passed: disqualifiers.length === 0,
    disqualifiers,
  };
}
