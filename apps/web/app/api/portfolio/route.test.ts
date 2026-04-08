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

vi.mock("@gpc/server", () => ({
  getPortfolioSummary: getPortfolioSummaryMock,
}));

vi.mock("@/lib/api/prismaSchemaFallback", () => ({
  EMPTY_PORTFOLIO_RESPONSE: {
    deals: [],
    metrics: {
      totalDeals: 0,
      totalAcreage: 0,
      avgTriageScore: null,
      byStatus: {},
      bySku: {},
      byJurisdiction: {},
    },
  },
  isSchemaDriftError: isSchemaDriftErrorMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET } from "./route";

describe("GET /api/portfolio", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getPortfolioSummaryMock.mockReset();
    captureExceptionMock.mockReset();
    isSchemaDriftErrorMock.mockReset();
    isSchemaDriftErrorMock.mockReturnValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/portfolio"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns portfolio aggregates for scoped deals", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getPortfolioSummaryMock.mockResolvedValue({
      deals: [
        {
          id: "deal-1",
          name: "Deal One",
          sku: "IOS",
          status: "INTAKE",
          jurisdiction: "EBR",
          acreage: 2.5,
          triageScore: 87,
          triageTier: null,
          taskCount: 3,
          parcelCount: 2,
          updatedAt: "2026-04-04T10:00:00.000Z",
          createdAt: "2026-04-01T10:00:00.000Z",
        },
      ],
      metrics: {
        totalDeals: 1,
        totalAcreage: 2.5,
        avgTriageScore: 87,
        byStatus: { INTAKE: 1 },
        bySku: { IOS: 1 },
        byJurisdiction: { EBR: 1 },
      },
    });

    const res = await GET(new NextRequest("http://localhost/api/portfolio"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getPortfolioSummaryMock).toHaveBeenCalledWith("org-1");
    expect(body.deals).toEqual([
      expect.objectContaining({
        id: "deal-1",
        name: "Deal One",
        acreage: 2.5,
        triageScore: 87,
        triageTier: null,
        taskCount: 3,
        parcelCount: 2,
      }),
    ]);
    expect(body.metrics).toEqual({
      totalDeals: 1,
      totalAcreage: 2.5,
      avgTriageScore: 87,
      byStatus: { INTAKE: 1 },
      bySku: { IOS: 1 },
      byJurisdiction: { EBR: 1 },
    });
  });

  it("returns the empty fallback response on schema drift", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    const error = new Error("column deals.market_name does not exist");
    getPortfolioSummaryMock.mockRejectedValue(error);
    isSchemaDriftErrorMock.mockReturnValue(true);

    const res = await GET(new NextRequest("http://localhost/api/portfolio"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deals: [],
      metrics: {
        totalDeals: 0,
        totalAcreage: 0,
        avgTriageScore: null,
        byStatus: {},
        bySku: {},
        byJurisdiction: {},
      },
    });
  });
});
