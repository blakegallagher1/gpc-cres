import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getPortfolioSummaryMock,
  captureExceptionMock,
  isSchemaDriftErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getPortfolioSummaryMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  isSchemaDriftErrorMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/portfolioAnalytics.service", () => ({
  getPortfolioSummary: getPortfolioSummaryMock,
}));

vi.mock("@/lib/api/prismaSchemaFallback", () => ({
  EMPTY_PORTFOLIO_ANALYTICS_RESPONSE: {
    totalDeals: 0,
    activeDeals: 0,
    totalAcreage: 0,
    totalEquityDeployed: 0,
    weightedAvgIRR: null,
    weightedAvgCapRate: null,
    avgTriageScore: null,
    byStatus: {},
    bySku: {},
    byJurisdiction: {},
  },
  isSchemaDriftError: isSchemaDriftErrorMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET } from "./route";

describe("GET /api/portfolio/analytics", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getPortfolioSummaryMock.mockReset();
    captureExceptionMock.mockReset();
    isSchemaDriftErrorMock.mockReset();
    isSchemaDriftErrorMock.mockReturnValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/portfolio/analytics"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns portfolio summary for the scoped org", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getPortfolioSummaryMock.mockResolvedValue({
      totalDeals: 3,
      activeDeals: 2,
      totalAcreage: 120,
      totalEquityDeployed: 500000,
      weightedAvgIRR: 18.4,
      weightedAvgCapRate: 7.2,
      avgTriageScore: 81,
      byStatus: { INTAKE: 1, APPROVED: 2 },
      bySku: { IOS: 2, TRUCK_PARKING: 1 },
      byJurisdiction: { EBR: 2, Ascension: 1 },
    });

    const res = await GET(new NextRequest("http://localhost/api/portfolio/analytics"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totalDeals: 3,
      activeDeals: 2,
      totalAcreage: 120,
      totalEquityDeployed: 500000,
      weightedAvgIRR: 18.4,
      weightedAvgCapRate: 7.2,
      avgTriageScore: 81,
      byStatus: { INTAKE: 1, APPROVED: 2 },
      bySku: { IOS: 2, TRUCK_PARKING: 1 },
      byJurisdiction: { EBR: 2, Ascension: 1 },
    });
    expect(getPortfolioSummaryMock).toHaveBeenCalledWith("org-1");
  });

  it("returns the empty analytics fallback on schema drift", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    const error = new Error("column does not exist");
    getPortfolioSummaryMock.mockRejectedValue(error);
    isSchemaDriftErrorMock.mockReturnValue(true);

    const res = await GET(new NextRequest("http://localhost/api/portfolio/analytics"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totalDeals: 0,
      activeDeals: 0,
      totalAcreage: 0,
      totalEquityDeployed: 0,
      weightedAvgIRR: null,
      weightedAvgCapRate: null,
      avgTriageScore: null,
      byStatus: {},
      bySku: {},
      byJurisdiction: {},
    });
  });
});