import { hydrateDealContext } from "./deal-context-hydrator.service";

/**
 * Deal fit score: a deterministic 30-second go/no-go against hard-coded
 * default investment criteria for GPC's light-industrial / outdoor-storage /
 * truck-parking thesis in Louisiana.
 *
 * The criteria are intentionally inline (not yet persisted per-org) to keep
 * Phase 1 small. A follow-up migration will persist org-scoped criteria and
 * replace `getDefaultInvestmentCriteria` with a DB lookup.
 */

export interface InvestmentCriteria {
  // Hard gates (violation → fail)
  minIrrPct: number | null;
  maxLtvPct: number | null;
  minDscr: number | null;

  // Soft preferences (weighted scoring)
  preferredAssetClasses: string[];
  preferredStrategies: string[];
  preferredStates: string[];
  minAcreage: number | null;
  maxAcreage: number | null;
}

export interface FitScoreGap {
  dimension: string;
  severity: "hard_fail" | "soft_miss" | "ok";
  observed: string | number | null;
  expected: string;
  reason: string;
}

export interface FitScoreResult {
  score: number;
  verdict: "fit" | "borderline" | "miss" | "insufficient_data";
  hardFailures: FitScoreGap[];
  softMisses: FitScoreGap[];
  passes: FitScoreGap[];
  criteriaUsed: InvestmentCriteria;
  evaluatedAt: string;
}

export function getDefaultInvestmentCriteria(): InvestmentCriteria {
  return {
    minIrrPct: 18,
    maxLtvPct: 70,
    minDscr: 1.25,
    preferredAssetClasses: [
      "INDUSTRIAL",
      "OUTDOOR_STORAGE",
      "TRUCK_PARKING",
      "FLEX",
      "MHP",
    ],
    preferredStrategies: ["ACQUISITION", "DEVELOPMENT", "ENTITLEMENT_LAND"],
    preferredStates: ["LA"],
    minAcreage: 1,
    maxAcreage: 500,
  };
}

function evaluateHardGate(
  observed: number | null,
  threshold: number | null,
  comparator: "gte" | "lte",
  dimension: string,
): FitScoreGap | null {
  if (threshold === null) return null;
  if (observed === null) {
    return {
      dimension,
      severity: "soft_miss",
      observed: null,
      expected: `${comparator === "gte" ? ">=" : "<="} ${threshold}`,
      reason: `${dimension} missing — cannot verify gate`,
    };
  }
  const passes = comparator === "gte" ? observed >= threshold : observed <= threshold;
  if (passes) {
    return {
      dimension,
      severity: "ok",
      observed,
      expected: `${comparator === "gte" ? ">=" : "<="} ${threshold}`,
      reason: "gate passed",
    };
  }
  return {
    dimension,
    severity: "hard_fail",
    observed,
    expected: `${comparator === "gte" ? ">=" : "<="} ${threshold}`,
    reason: `${dimension}=${observed} violates ${
      comparator === "gte" ? ">=" : "<="
    } ${threshold}`,
  };
}

function evaluateSoftMatch(
  observed: string | null,
  allowed: string[],
  dimension: string,
): FitScoreGap {
  if (allowed.length === 0) {
    return { dimension, severity: "ok", observed, expected: "any", reason: "no preference" };
  }
  if (!observed) {
    return {
      dimension,
      severity: "soft_miss",
      observed: null,
      expected: allowed.join("|"),
      reason: `${dimension} not set`,
    };
  }
  const normalized = observed.toUpperCase();
  const match = allowed.some((a) => a.toUpperCase() === normalized);
  return {
    dimension,
    severity: match ? "ok" : "soft_miss",
    observed,
    expected: allowed.join("|"),
    reason: match ? "within preference set" : "outside preference set",
  };
}

function evaluateAcreage(
  acreage: number | null,
  criteria: InvestmentCriteria,
): FitScoreGap {
  if (criteria.minAcreage === null && criteria.maxAcreage === null) {
    return {
      dimension: "acreage",
      severity: "ok",
      observed: acreage,
      expected: "any",
      reason: "no preference",
    };
  }
  if (acreage === null) {
    return {
      dimension: "acreage",
      severity: "soft_miss",
      observed: null,
      expected: `${criteria.minAcreage ?? 0}–${criteria.maxAcreage ?? "∞"} ac`,
      reason: "acreage missing",
    };
  }
  const tooSmall = criteria.minAcreage !== null && acreage < criteria.minAcreage;
  const tooLarge = criteria.maxAcreage !== null && acreage > criteria.maxAcreage;
  if (tooSmall || tooLarge) {
    return {
      dimension: "acreage",
      severity: "soft_miss",
      observed: acreage,
      expected: `${criteria.minAcreage ?? 0}–${criteria.maxAcreage ?? "∞"} ac`,
      reason: tooSmall ? "below min acreage" : "above max acreage",
    };
  }
  return {
    dimension: "acreage",
    severity: "ok",
    observed: acreage,
    expected: `${criteria.minAcreage ?? 0}–${criteria.maxAcreage ?? "∞"} ac`,
    reason: "within preferred acreage band",
  };
}

export async function computeDealFitScore(
  orgId: string,
  dealId: string,
  criteria: InvestmentCriteria = getDefaultInvestmentCriteria(),
): Promise<FitScoreResult | null> {
  const context = await hydrateDealContext(orgId, dealId, {
    includeAutomationEvents: false,
  });
  if (!context) return null;

  const gaps: FitScoreGap[] = [];

  const irrGap = evaluateHardGate(
    context.financial.latestIrrPct,
    criteria.minIrrPct,
    "gte",
    "IRR",
  );
  if (irrGap) gaps.push(irrGap);

  const ltvGap = evaluateHardGate(
    context.financial.latestLtvPct,
    criteria.maxLtvPct,
    "lte",
    "LTV",
  );
  if (ltvGap) gaps.push(ltvGap);

  const dscrGap = evaluateHardGate(
    context.financial.latestDscr,
    criteria.minDscr,
    "gte",
    "DSCR",
  );
  if (dscrGap) gaps.push(dscrGap);

  gaps.push(
    evaluateSoftMatch(context.assetClass, criteria.preferredAssetClasses, "assetClass"),
  );
  gaps.push(evaluateSoftMatch(context.strategy, criteria.preferredStrategies, "strategy"));
  gaps.push(
    evaluateSoftMatch(
      context.jurisdiction?.state ?? null,
      criteria.preferredStates,
      "state",
    ),
  );
  gaps.push(evaluateAcreage(context.primaryAsset?.acreage ?? null, criteria));

  const hardFailures = gaps.filter((g) => g.severity === "hard_fail");
  const softMisses = gaps.filter((g) => g.severity === "soft_miss");
  const passes = gaps.filter((g) => g.severity === "ok");

  const totalGated = gaps.filter((g) => g.severity !== "ok").length;
  const softMissCount = softMisses.length;

  let verdict: FitScoreResult["verdict"];
  let score: number;

  if (hardFailures.length > 0) {
    verdict = "miss";
    score = Math.max(0, 25 - hardFailures.length * 10);
  } else if (
    !context.financial.hasAssumptions &&
    context.financial.latestIrrPct === null &&
    context.financial.latestDscr === null &&
    context.financial.latestLtvPct === null
  ) {
    verdict = "insufficient_data";
    score = 50;
  } else if (softMissCount === 0) {
    verdict = "fit";
    score = 95;
  } else if (softMissCount <= 2) {
    verdict = "borderline";
    score = 75 - softMissCount * 5;
  } else {
    verdict = "miss";
    score = Math.max(30, 65 - totalGated * 5);
  }

  return {
    score,
    verdict,
    hardFailures,
    softMisses,
    passes,
    criteriaUsed: criteria,
    evaluatedAt: new Date().toISOString(),
  };
}
