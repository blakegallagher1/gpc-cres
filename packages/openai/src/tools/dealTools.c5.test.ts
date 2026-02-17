import { beforeEach, describe, expect, it, vi } from "vitest";

const { dealFindFirstMock } = vi.hoisted(() => ({
  dealFindFirstMock: vi.fn(),
}));

vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

vi.mock("@entitlement-os/shared", () => ({
  aggregateRentRoll: vi.fn(),
  summarizeDevelopmentBudget: vi.fn(() => ({ totalBudget: 0 })),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findFirst: dealFindFirstMock,
    },
  },
}));

import { model_exit_scenarios } from "./dealTools";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const DEAL_ID = "22222222-2222-4222-8222-222222222222";

describe("model_exit_scenarios tool", () => {
  beforeEach(() => {
    dealFindFirstMock.mockReset();
  });

  it("returns serialized scenario rows with ranked output and timing metadata", async () => {
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
        buildableSf: 30_000,
      },
    });

    const response = await (
      model_exit_scenarios as unknown as {
        execute: (input: {
          orgId: string;
          dealId: string;
          maxExitYear: number | null;
        }) => Promise<string>;
      }
    ).execute({ orgId: ORG_ID, dealId: DEAL_ID, maxExitYear: 10 });

    const body = JSON.parse(response) as {
      scenarios: Array<{
        id: string;
        path: "sell" | "refinance_hold" | "stabilization_disposition";
        exitValue: number;
        equityProceeds: number;
        equityMultiple: number;
        irrPct: number | null;
        irrMaximizingExitTiming: {
          sellYear: number;
          refinanceYear: number | null;
          exitYear: number;
        };
      }>;
      summary: {
        sellIrrMaxTiming: { sellYear: number; refinanceYear: null; exitYear: number } | null;
        refinanceIrrMaxTiming: {
          sellYear: number;
          refinanceYear: number;
          exitYear: number;
        } | null;
        stabilizationTiming: { sellYear: number; refinanceYear: null; exitYear: number };
        overallBestScenarioId: string | null;
      };
    };

    expect(body.scenarios).toHaveLength(56);
    expect(body.scenarios.some((scenario) => scenario.path === "sell")).toBe(true);
    expect(body.scenarios.some((scenario) => scenario.path === "refinance_hold")).toBe(true);
    expect(
      body.scenarios.some((scenario) => scenario.path === "stabilization_disposition"),
    ).toBe(true);
    expect(body.summary.sellIrrMaxTiming).not.toBeNull();
    expect(body.summary.refinanceIrrMaxTiming).not.toBeNull();
    expect(body.summary.overallBestScenarioId).toBeTruthy();

    const first = body.scenarios[0];
    expect(first.exitValue).toEqual(expect.any(Number));
    expect(first.equityProceeds).toEqual(expect.any(Number));
    expect(first.equityMultiple).toEqual(expect.any(Number));
    expect(first.irrMaximizingExitTiming.exitYear).toEqual(expect.any(Number));

    expect(dealFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEAL_ID, orgId: ORG_ID },
      }),
    );
  });
});

