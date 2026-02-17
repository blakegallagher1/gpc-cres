import { describe, expect, it } from "vitest";

import { DEFAULT_ASSUMPTIONS } from "@/stores/financialModelStore";
import { computeProForma } from "@/hooks/useProFormaCalculations";

describe("computeProForma financial model depth", () => {
  it("includes development budget totals in acquisition basis", () => {
    const baseline = computeProForma(DEFAULT_ASSUMPTIONS);
    const withBudget = computeProForma(DEFAULT_ASSUMPTIONS, {
      developmentBudget: {
        lineItems: [
          { name: "Shell", category: "hard", amount: 500000 },
          { name: "Permits", category: "soft", amount: 100000 },
        ],
        contingencies: {
          hardCostContingencyPct: 10,
          softCostContingencyPct: 5,
        },
      },
    });

    expect(withBudget.acquisitionBasis.developmentCosts).toBe(655000);
    expect(withBudget.acquisitionBasis.totalBasis).toBeGreaterThan(
      baseline.acquisitionBasis.totalBasis,
    );
  });

  it("aggregates rent roll schedule and weighted average lease term", () => {
    const results = computeProForma(DEFAULT_ASSUMPTIONS, {
      tenantLeases: [
        {
          tenantId: "11111111-1111-4111-8111-111111111111",
          leaseName: "Suite A",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          rentedAreaSf: 10000,
          rentPerSf: 12,
          annualEscalationPct: 3,
        },
      ],
    });

    expect(results.rentRoll.hasLeases).toBe(true);
    expect(results.weightedAverageLeaseTermYears).toBeGreaterThan(0);
    expect(results.rentRoll.annualSchedule[1].vacancyLoss).toBeGreaterThan(0);
    expect(results.annualCashFlows).toHaveLength(DEFAULT_ASSUMPTIONS.exit.holdYears);
  });
});
