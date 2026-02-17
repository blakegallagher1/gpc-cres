import { describe, expect, it } from "vitest";
import { computeWaterfall, type WaterfallStructure } from "./useWaterfallCalculations";
import { computeProForma } from "./useProFormaCalculations";
import { DEFAULT_ASSUMPTIONS } from "@/stores/financialModelStore";

describe("computeWaterfall C3 LP/GP tier allocations", () => {
  it("applies persisted LP/GP tier splits", () => {
    const base = computeProForma(DEFAULT_ASSUMPTIONS);
    const proForma = {
      ...base,
      acquisitionBasis: {
        ...base.acquisitionBasis,
        equityRequired: 100,
      },
      annualCashFlows: [
        {
          year: 1,
          noi: 120,
          debtService: 0,
          leveredCashFlow: 120,
          cumulativeCashFlow: 120,
          cashOnCash: 1.2,
        },
      ],
      exitAnalysis: {
        ...base.exitAnalysis,
        netProceeds: 0,
      },
    };

    const structure: WaterfallStructure = {
      id: "wf-1",
      name: "Persisted",
      totalEquity: 100,
      gpCoinvestPct: 10,
      preferredReturnPct: 0,
      catchUpPct: 0,
      promoteTiers: [{ hurdleIrrPct: 0, lpDistributionPct: 80, gpDistributionPct: 20 }],
      createdAt: "2026-02-17T00:00:00.000Z",
    };

    const result = computeWaterfall(structure, proForma);

    expect(result.annualDistributions).toHaveLength(1);
    expect(result.annualDistributions[0].gpDistribution).toBe(14);
    expect(result.annualDistributions[0].lpDistribution).toBe(106);
  });
});
