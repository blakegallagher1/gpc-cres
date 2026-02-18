import { beforeEach, describe, expect, it, vi } from "vitest";

const { dealFindManyMock, capitalDeploymentFindManyMock } = vi.hoisted(() => ({
  dealFindManyMock: vi.fn(),
  capitalDeploymentFindManyMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findMany: dealFindManyMock,
    },
    capitalDeployment: {
      findMany: capitalDeploymentFindManyMock,
    },
    run: {
      findMany: vi.fn(),
    },
    dealRisk: {
      findMany: vi.fn(),
    },
  },
}));

import { getCapitalDeploymentAnalytics } from "@/lib/services/portfolioAnalytics.service";

describe("portfolioAnalytics capital deployment fallback", () => {
  beforeEach(() => {
    dealFindManyMock.mockReset();
    capitalDeploymentFindManyMock.mockReset();
  });

  it("returns zeroed deployment metrics when capital_deployments table is missing", async () => {
    dealFindManyMock.mockResolvedValue([
      {
        id: "deal-active",
        status: "ACTIVE",
        parcels: [{ id: "parcel-1", acreage: { toString: () => "2.5" } }],
      },
      {
        id: "deal-killed",
        status: "KILLED",
        parcels: [{ id: "parcel-2", acreage: { toString: () => "1.0" } }],
      },
    ]);
    capitalDeploymentFindManyMock.mockRejectedValue(
      Object.assign(
        new Error(
          "Invalid `prisma.capitalDeployment.findMany()` invocation: The table `public.capital_deployments` does not exist in the current database.",
        ),
        { code: "P2021" },
      ),
    );

    const result = await getCapitalDeploymentAnalytics("org-test");

    expect(result.totalCommitted).toBe(0);
    expect(result.totalDeployed).toBe(0);
    expect(result.totalNonRecoverable).toBe(0);
    expect(result.sunkCostKilledDeals).toBe(0);
    expect(result.costPerActiveParcel).toBe(0);
    expect(result.costPerAcre).toBe(0);
    expect(result.stageRollup).toEqual([]);
  });

  it("rethrows non-missing-table Prisma errors", async () => {
    dealFindManyMock.mockResolvedValue([]);
    capitalDeploymentFindManyMock.mockRejectedValue(
      Object.assign(new Error("database unavailable"), { code: "P1001" }),
    );

    await expect(getCapitalDeploymentAnalytics("org-test")).rejects.toThrow(
      "database unavailable",
    );
  });
});
