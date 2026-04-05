import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  dealFindManyMock,
  runFindManyMock,
  captureExceptionMock,
  isSchemaDriftErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  dealFindManyMock: vi.fn(),
  runFindManyMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  isSchemaDriftErrorMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: { findMany: dealFindManyMock },
    run: { findMany: runFindManyMock },
  },
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
    dealFindManyMock.mockReset();
    runFindManyMock.mockReset();
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
    dealFindManyMock.mockResolvedValue([
      {
        id: "deal-1",
        name: "Deal One",
        sku: "IOS",
        status: "INTAKE",
        updatedAt: new Date("2026-04-04T10:00:00.000Z"),
        createdAt: new Date("2026-04-01T10:00:00.000Z"),
        jurisdiction: { name: "EBR" },
        parcels: [{ acreage: { toString: () => "2.5" } }, { acreage: null }],
        _count: { tasks: 3, parcels: 2 },
      },
    ]);
    runFindManyMock.mockResolvedValue([
      {
        dealId: "deal-1",
        outputJson: {
          triageScore: 87,
          triage: {
            generated_at: "2026-04-04T10:00:00.000Z",
            deal_id: "deal-1",
            decision: "ADVANCE",
            recommended_path: "REZONING",
            rationale: "Good fit.",
            risk_scores: {
              access: 3,
              drainage: 2,
              adjacency: 4,
              env: 3,
              utilities: 2,
              politics: 3,
            },
            disqualifiers: [],
            next_actions: [],
            assumptions: [],
            sources_summary: [],
          },
        },
      },
    ]);

    const res = await GET(new NextRequest("http://localhost/api/portfolio"));
    const body = await res.json();

    expect(res.status).toBe(200);
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
    dealFindManyMock.mockRejectedValue(error);
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