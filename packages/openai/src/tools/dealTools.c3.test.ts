import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dealFindFirstMock,
  developmentBudgetFindFirstMock,
  capitalSourceFindManyMock,
  equityWaterfallFindManyMock,
} = vi.hoisted(() => ({
  dealFindFirstMock: vi.fn(),
  developmentBudgetFindFirstMock: vi.fn(),
  capitalSourceFindManyMock: vi.fn(),
  equityWaterfallFindManyMock: vi.fn(),
}));

vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

vi.mock("@entitlement-os/shared", () => ({
  aggregateRentRoll: vi.fn(),
  summarizeDevelopmentBudget: () => ({ totalBudget: 200000 }),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findFirst: dealFindFirstMock,
    },
    developmentBudget: {
      findFirst: developmentBudgetFindFirstMock,
    },
    capitalSource: {
      findMany: capitalSourceFindManyMock,
    },
    equityWaterfall: {
      findMany: equityWaterfallFindManyMock,
    },
  },
}));

import { model_capital_stack, stress_test_deal } from "./dealTools";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const DEAL_ID = "22222222-2222-4222-8222-222222222222";

describe("model_capital_stack tool", () => {
  beforeEach(() => {
    dealFindFirstMock.mockReset();
    developmentBudgetFindFirstMock.mockReset();
    capitalSourceFindManyMock.mockReset();
    equityWaterfallFindManyMock.mockReset();
  });

  it("returns capital stack summary with sources/use delta", async () => {
    dealFindFirstMock.mockResolvedValue({
      id: DEAL_ID,
      financialModelAssumptions: {
        acquisition: {
          purchasePrice: 1_000_000,
          closingCostsPct: 2,
        },
      },
    });
    developmentBudgetFindFirstMock.mockResolvedValue({
      lineItems: [{ amount: 200000 }],
      contingencies: {},
    });
    capitalSourceFindManyMock.mockResolvedValue([
      {
        id: "s1",
        name: "Senior Debt",
        sourceKind: "DEBT",
        amount: { toString: () => "700000" },
        notes: null,
        sortOrder: 0,
      },
      {
        id: "s2",
        name: "LP Equity",
        sourceKind: "LP_EQUITY",
        amount: { toString: () => "400000" },
        notes: null,
        sortOrder: 1,
      },
      {
        id: "s3",
        name: "GP Equity",
        sourceKind: "GP_EQUITY",
        amount: { toString: () => "100000" },
        notes: null,
        sortOrder: 2,
      },
    ]);
    equityWaterfallFindManyMock.mockResolvedValue([
      {
        id: "w1",
        tierName: "Tier 1",
        hurdleIrrPct: { toString: () => "8" },
        lpDistributionPct: { toString: () => "80" },
        gpDistributionPct: { toString: () => "20" },
        sortOrder: 0,
      },
    ]);

    const response = await (
      model_capital_stack as unknown as {
        execute: (input: { orgId: string; dealId: string }) => Promise<string>;
      }
    ).execute({ orgId: ORG_ID, dealId: DEAL_ID });

    const body = JSON.parse(response) as {
      summary: {
        totalUses: number;
        totalSources: number;
        sourcesUsesDelta: number;
      };
      waterfallTiers: Array<{ gpDistributionPct: number }>;
    };

    expect(body.summary.totalUses).toBe(1220000);
    expect(body.summary.totalSources).toBe(1200000);
    expect(body.summary.sourcesUsesDelta).toBe(-20000);
    expect(body.waterfallTiers[0].gpDistributionPct).toBe(20);
  });

  it("returns scenario comparison table with weighted expectations", async () => {
    dealFindFirstMock.mockResolvedValue({
      id: DEAL_ID,
      financialModelAssumptions: {
        acquisition: {
          purchasePrice: 1_500_000,
          closingCostsPct: 2,
          earnestMoney: 25_000,
        },
        income: {
          rentPerSf: 10,
          vacancyPct: 5,
          rentGrowthPct: 2,
          otherIncome: 0,
        },
        expenses: {
          opexPerSf: 2,
          managementFeePct: 5,
          capexReserves: 0.25,
          insurance: 0.5,
          taxes: 1,
        },
        financing: {
          ltvPct: 65,
          interestRate: 6.5,
          amortizationYears: 25,
          ioPeriodYears: 0,
          loanFeePct: 1,
        },
        exit: {
          holdYears: 5,
          exitCapRate: 7.5,
          dispositionCostsPct: 2,
        },
        buildableSf: 30000,
      },
    });

    const response = await (
      stress_test_deal as unknown as {
        execute: (input: {
          orgId: string;
          dealId: string;
          includeScenarioIds: Array<
            "base" | "upside" | "downside" | "rate_shock_200bps" | "recession" | "tenant_loss"
          > | null;
        }) => Promise<string>;
      }
    ).execute({ orgId: ORG_ID, dealId: DEAL_ID, includeScenarioIds: null });

    const body = JSON.parse(response) as {
      scenarios: Array<{
        scenarioId: string;
        probabilityPct: number;
        leveredIrrPct: number | null;
        equityMultiple: number;
      }>;
      expected: {
        weightedLeveredIrrPct: number | null;
        weightedEquityMultiple: number | null;
      };
    };

    expect(body.scenarios).toHaveLength(6);
    expect(body.scenarios.some((row) => row.scenarioId === "rate_shock_200bps")).toBe(true);
    expect(body.expected.weightedEquityMultiple).not.toBeNull();
    expect(body.expected.weightedLeveredIrrPct).not.toBeNull();
    expect(dealFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEAL_ID, orgId: ORG_ID },
      }),
    );
  });
});
