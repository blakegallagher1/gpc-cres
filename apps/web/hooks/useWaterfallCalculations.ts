import { useMemo } from "react";
import type { ProFormaResults } from "@/hooks/useProFormaCalculations";

// ---------------------------------------------------------------------------
// Waterfall structure types
// ---------------------------------------------------------------------------

export interface PromoteTier {
  /** IRR hurdle that must be exceeded for this tier to activate (e.g., 12 = 12%) */
  hurdleIrrPct: number;
  /** GP's share of distributions in this tier (e.g., 20 = 20%) */
  gpSplitPct: number;
}

export interface WaterfallStructure {
  id: string;
  name: string;
  /** Total project equity (should match equityRequired from pro forma) */
  totalEquity: number;
  /** GP co-invest as % of total equity (e.g., 10 = 10%) */
  gpCoinvestPct: number;
  /** Annual preferred return to LP (e.g., 8 = 8%) */
  preferredReturnPct: number;
  /** GP catch-up: % of distributions to GP after LP pref is met (e.g., 50 = 50%) */
  catchUpPct: number;
  /** Promote tiers sorted by ascending hurdleIrrPct */
  promoteTiers: PromoteTier[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Distribution output types
// ---------------------------------------------------------------------------

export interface AnnualDistribution {
  year: number;
  totalCashFlow: number;
  lpDistribution: number;
  gpDistribution: number;
  lpCumulative: number;
  gpCumulative: number;
  lpIrr: number | null;
  activeTier: string;
}

export interface WaterfallResults {
  lpEquity: number;
  gpEquity: number;
  annualDistributions: AnnualDistribution[];
  lpTotalReturn: number;
  gpTotalReturn: number;
  lpMultiple: number;
  gpMultiple: number;
  lpIrr: number | null;
  gpIrr: number | null;
  lpProfitShare: number;
  gpProfitShare: number;
}

// ---------------------------------------------------------------------------
// IRR helper (Newton-Raphson, same approach as computeProForma)
// ---------------------------------------------------------------------------

function computeIRR(
  cashflows: number[],
  guess = 0.1,
  maxIterations = 100,
  tolerance = 0.0001
): number | null {
  if (cashflows.length === 0) return null;
  const hasPositive = cashflows.some((cf) => cf > 0);
  const hasNegative = cashflows.some((cf) => cf < 0);
  if (!(hasPositive && hasNegative)) return null;

  let rate = guess;
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashflows[t] / denom;
      dnpv -= (t * cashflows[t]) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(npv) < tolerance) return rate;
    if (dnpv === 0) break;
    rate -= npv / dnpv;
  }
  return rate;
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Pure waterfall distribution calculation
// ---------------------------------------------------------------------------

export function computeWaterfall(
  structure: WaterfallStructure,
  proForma: ProFormaResults
): WaterfallResults {
  const totalEquity = structure.totalEquity;
  const gpEquity = totalEquity * (structure.gpCoinvestPct / 100);
  const lpEquity = totalEquity - gpEquity;
  const prefRate = structure.preferredReturnPct / 100;
  const catchUpPct = structure.catchUpPct / 100;

  // Build total distributable cash flows per year
  // Operating cash flows come from annualCashFlows[].leveredCashFlow
  // Terminal year gets exit net proceeds added
  const holdYears = proForma.annualCashFlows.length;
  const cashFlows: number[] = [];
  for (let y = 0; y < holdYears; y++) {
    let cf = proForma.annualCashFlows[y].leveredCashFlow;
    if (y === holdYears - 1) {
      cf += proForma.exitAnalysis.netProceeds;
    }
    cashFlows.push(cf);
  }

  // Track state
  let lpUnreturnedCapital = lpEquity;
  let gpUnreturnedCapital = gpEquity;
  let lpAccruedPref = 0;
  let lpCumulative = 0;
  let gpCumulative = 0;

  // Track cash flow streams for IRR
  const lpCFs: number[] = [-lpEquity];
  const gpCFs: number[] = [-gpEquity];

  const annualDistributions: AnnualDistribution[] = [];

  for (let y = 0; y < holdYears; y++) {
    const totalCF = cashFlows[y];
    let remaining = totalCF;
    let lpDist = 0;
    let gpDist = 0;
    let activeTier = "Return of Capital";

    if (remaining <= 0) {
      // Negative cash flow — split proportionally by equity contribution
      const lpShare = lpEquity / totalEquity;
      lpDist = remaining * lpShare;
      gpDist = remaining * (1 - lpShare);
      activeTier = "Capital Call";
    } else {
      // Accrue preferred return for this period on unreturned LP capital
      lpAccruedPref += lpUnreturnedCapital * prefRate;

      // TIER 1: Return of Capital (pro rata)
      if (remaining > 0 && (lpUnreturnedCapital > 0 || gpUnreturnedCapital > 0)) {
        const totalUnreturned = lpUnreturnedCapital + gpUnreturnedCapital;
        const rocAmount = Math.min(remaining, totalUnreturned);
        const lpROC = totalUnreturned > 0
          ? rocAmount * (lpUnreturnedCapital / totalUnreturned)
          : 0;
        const gpROC = rocAmount - lpROC;
        lpDist += lpROC;
        gpDist += gpROC;
        lpUnreturnedCapital = Math.max(0, lpUnreturnedCapital - lpROC);
        gpUnreturnedCapital = Math.max(0, gpUnreturnedCapital - gpROC);
        remaining -= rocAmount;
      }

      // TIER 2: LP Preferred Return
      if (remaining > 0 && lpAccruedPref > 0) {
        activeTier = "Preferred Return";
        const prefPayment = Math.min(remaining, lpAccruedPref);
        lpDist += prefPayment;
        lpAccruedPref -= prefPayment;
        remaining -= prefPayment;
      }

      // TIER 3: GP Catch-up
      if (remaining > 0 && catchUpPct > 0) {
        // GP catches up until GP has received catchUpPct of total distributions above ROC
        const totalDistAboveRoc = (lpCumulative + lpDist - (lpEquity - lpUnreturnedCapital)) +
          (gpCumulative + gpDist - (gpEquity - gpUnreturnedCapital));
        const gpTarget = totalDistAboveRoc > 0
          ? (totalDistAboveRoc + remaining) * catchUpPct
          : 0;
        const gpReceived = gpCumulative + gpDist - (gpEquity - gpUnreturnedCapital);
        const gpShortfall = Math.max(0, gpTarget - gpReceived);

        if (gpShortfall > 0) {
          activeTier = "GP Catch-up";
          const catchUpAmount = Math.min(remaining, gpShortfall);
          gpDist += catchUpAmount;
          remaining -= catchUpAmount;
        }
      }

      // TIER 4+: Promote tiers based on LP IRR achieved
      if (remaining > 0) {
        // Calculate LP IRR achieved so far (including this year's partial dist)
        const tempLpCFs = [...lpCFs, lpDist + remaining]; // hypothetically give all to LP
        const currentLpIrr = computeIRR(tempLpCFs);
        const irrPct = currentLpIrr !== null ? currentLpIrr * 100 : 0;

        // Find the active promote tier
        const sortedTiers = [...structure.promoteTiers].sort(
          (a, b) => a.hurdleIrrPct - b.hurdleIrrPct
        );

        // Default split: pro rata by equity
        let gpSplit = structure.gpCoinvestPct / 100;

        for (const tier of sortedTiers) {
          if (irrPct >= tier.hurdleIrrPct) {
            gpSplit = tier.gpSplitPct / 100;
            activeTier = `Promote ${tier.hurdleIrrPct}%+`;
          }
        }

        // If no tiers defined or haven't hit first hurdle, use first tier's split
        if (sortedTiers.length > 0 && irrPct < sortedTiers[0].hurdleIrrPct) {
          gpSplit = sortedTiers[0].gpSplitPct / 100;
          activeTier = `Below ${sortedTiers[0].hurdleIrrPct}% Hurdle`;
        }

        const gpPromote = remaining * gpSplit;
        const lpPromote = remaining - gpPromote;
        gpDist += gpPromote;
        lpDist += lpPromote;
      }
    }

    lpCumulative += lpDist;
    gpCumulative += gpDist;
    lpCFs.push(lpDist);
    gpCFs.push(gpDist);

    const lpIrrSoFar = computeIRR(lpCFs);

    annualDistributions.push({
      year: y + 1,
      totalCashFlow: round(totalCF, 0),
      lpDistribution: round(lpDist, 0),
      gpDistribution: round(gpDist, 0),
      lpCumulative: round(lpCumulative, 0),
      gpCumulative: round(gpCumulative, 0),
      lpIrr: lpIrrSoFar !== null ? round(lpIrrSoFar, 4) : null,
      activeTier,
    });
  }

  const lpIrr = computeIRR(lpCFs);
  const gpIrr = computeIRR(gpCFs);

  const totalProfit = lpCumulative + gpCumulative - totalEquity;
  const lpProfit = lpCumulative - lpEquity;
  const gpProfit = gpCumulative - gpEquity;

  return {
    lpEquity: round(lpEquity, 0),
    gpEquity: round(gpEquity, 0),
    annualDistributions,
    lpTotalReturn: round(lpCumulative, 0),
    gpTotalReturn: round(gpCumulative, 0),
    lpMultiple: lpEquity > 0 ? round(lpCumulative / lpEquity, 2) : 0,
    gpMultiple: gpEquity > 0 ? round(gpCumulative / gpEquity, 2) : 0,
    lpIrr: lpIrr !== null ? round(lpIrr, 4) : null,
    gpIrr: gpIrr !== null ? round(gpIrr, 4) : null,
    lpProfitShare: totalProfit > 0 ? round(lpProfit / totalProfit, 4) : 0,
    gpProfitShare: totalProfit > 0 ? round(gpProfit / totalProfit, 4) : 0,
  };
}

// ---------------------------------------------------------------------------
// Hook — memoized wrapper
// ---------------------------------------------------------------------------

export function useWaterfallCalculations(
  structure: WaterfallStructure | null,
  proForma: ProFormaResults
): WaterfallResults | null {
  return useMemo(() => {
    if (!structure) return null;
    return computeWaterfall(structure, proForma);
  }, [structure, proForma]);
}
