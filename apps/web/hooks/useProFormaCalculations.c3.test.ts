import { describe, expect, it } from "vitest";
import { computeProForma } from "./useProFormaCalculations";
import { DEFAULT_ASSUMPTIONS } from "@/stores/financialModelStore";

describe("computeProForma C3 sources and uses", () => {
  it("computes sources/use delta from persisted capital sources", () => {
    const assumptions = {
      ...DEFAULT_ASSUMPTIONS,
      acquisition: {
        ...DEFAULT_ASSUMPTIONS.acquisition,
        purchasePrice: 1_000_000,
        closingCostsPct: 2,
      },
      financing: {
        ...DEFAULT_ASSUMPTIONS.financing,
        ltvPct: 60,
      },
    };

    const result = computeProForma(assumptions, {
      capitalSources: [
        { sourceKind: "DEBT", amount: 600_000 },
        { sourceKind: "LP_EQUITY", amount: 350_000 },
        { sourceKind: "GP_EQUITY", amount: 50_000 },
      ],
    });

    expect(result.sourcesAndUses.totalUses).toBeGreaterThan(0);
    expect(result.sourcesAndUses.totalSources).toBe(1_000_000);
    expect(result.sourcesAndUses.debtSources).toBe(600_000);
    expect(result.sourcesAndUses.equitySources).toBe(400_000);
    expect(result.sourcesAndUses.usesDelta).toBe(
      result.sourcesAndUses.totalSources - result.sourcesAndUses.totalUses,
    );
  });
});
