import { computeDealFitScore } from "./deal-fit-score.service";
import { loadInvestmentCriteria } from "../services/investment-criteria.service";

export interface UnderwritingGateResult {
  pass: boolean;
  score: number;
  verdict: string;
  reason: string;
  hardFailures: Array<{ dimension: string; observed: string | number | null; reason: string }>;
  metrics: {
    irrPct: number | null;
    dscr: number | null;
    ltvPct: number | null;
  };
  criteriaSnapshot: Record<string, unknown>;
  evaluatedAt: string;
}

const GATED_TRANSITIONS = new Set<string>([
  "UNDERWRITING->DUE_DILIGENCE",
  "UNDERWRITING->CONTRACTING",
  "DUE_DILIGENCE->CONTRACTING",
]);

export function transitionRequiresUnderwritingGate(
  fromStageKey: string | null | undefined,
  toStageKey: string,
): boolean {
  if (!fromStageKey) return false;
  return GATED_TRANSITIONS.has(`${fromStageKey}->${toStageKey}`);
}

export async function evaluateUnderwritingGate(
  orgId: string,
  dealId: string,
): Promise<UnderwritingGateResult | null> {
  const criteria = await loadInvestmentCriteria(orgId);
  const fit = await computeDealFitScore(orgId, dealId, criteria);
  if (!fit) return null;

  const pass =
    fit.verdict === "fit" ||
    fit.verdict === "borderline" ||
    (fit.verdict === "insufficient_data" && fit.hardFailures.length === 0);

  const reason =
    fit.hardFailures.length > 0
      ? `Blocked by ${fit.hardFailures.length} hard gate failure(s): ${fit.hardFailures
          .map((g) => g.dimension)
          .join(", ")}`
      : fit.verdict === "insufficient_data"
        ? "Financial model missing; advancing without a numeric gate verification"
        : `Gates pass (verdict=${fit.verdict})`;

  const irrGap = fit.passes
    .concat(fit.hardFailures, fit.softMisses)
    .find((g) => g.dimension === "IRR");
  const dscrGap = fit.passes
    .concat(fit.hardFailures, fit.softMisses)
    .find((g) => g.dimension === "DSCR");
  const ltvGap = fit.passes
    .concat(fit.hardFailures, fit.softMisses)
    .find((g) => g.dimension === "LTV");

  return {
    pass,
    score: fit.score,
    verdict: fit.verdict,
    reason,
    hardFailures: fit.hardFailures.map((g) => ({
      dimension: g.dimension,
      observed: g.observed,
      reason: g.reason,
    })),
    metrics: {
      irrPct: typeof irrGap?.observed === "number" ? irrGap.observed : null,
      dscr: typeof dscrGap?.observed === "number" ? dscrGap.observed : null,
      ltvPct: typeof ltvGap?.observed === "number" ? ltvGap.observed : null,
    },
    criteriaSnapshot: {
      minIrrPct: criteria.minIrrPct,
      maxLtvPct: criteria.maxLtvPct,
      minDscr: criteria.minDscr,
    },
    evaluatedAt: fit.evaluatedAt,
  };
}
