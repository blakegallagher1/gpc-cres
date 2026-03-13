import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, getEbrBuildingPermitsFeedMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getEbrBuildingPermitsFeedMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/buildingPermits.service", () => ({
  getEbrBuildingPermitsFeed: getEbrBuildingPermitsFeedMock,
}));

import { GET } from "./route";

describe("GET /api/market/building-permits", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getEbrBuildingPermitsFeedMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/market/building-permits");
    const res = await GET(req);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getEbrBuildingPermitsFeedMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid query params", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const req = new NextRequest(
      "http://localhost/api/market/building-permits?days=2&designation=industrial",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(getEbrBuildingPermitsFeedMock).not.toHaveBeenCalled();
  });

  it("returns the live permits feed when validation succeeds", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    getEbrBuildingPermitsFeedMock.mockResolvedValue({
      dataset: {
        id: "7fq7-8j7r",
        sourceUrl:
          "https://data.brla.gov/Housing-and-Development/EBR-Building-Permits/7fq7-8j7r/about_data",
        apiBaseUrl: "https://data.brla.gov/resource",
        refreshedAt: "2026-03-13T08:00:00.000Z",
      },
      filters: {
        days: 45,
        designation: "commercial",
        limit: 30,
        permitType: "Occupancy Permit (C)",
        zipCode: "70811",
      },
      totals: {
        permitCount: 12,
        totalProjectValue: 450000,
        averageProjectValue: 37500,
        totalPermitFees: 6000,
        latestIssuedDate: "2026-03-12T00:00:00.000",
      },
      issuedTrend: [],
      designationBreakdown: [],
      topPermitTypes: [],
      topZipCodes: [],
      recentPermits: [],
    });

    const req = new NextRequest(
      "http://localhost/api/market/building-permits?days=45&designation=commercial&limit=30&permitType=Occupancy%20Permit%20(C)&zip=70811",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(getEbrBuildingPermitsFeedMock).toHaveBeenCalledWith({
      days: 45,
      designation: "commercial",
      limit: 30,
      permitType: "Occupancy Permit (C)",
      zipCode: "70811",
    });
    expect(body.filters).toEqual({
      days: 45,
      designation: "commercial",
      limit: 30,
      permitType: "Occupancy Permit (C)",
      zipCode: "70811",
    });
  });

  it("returns 500 when the feed service throws", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    getEbrBuildingPermitsFeedMock.mockRejectedValue(
      new Error("Socrata returned 503 Service Unavailable"),
    );

    const req = new NextRequest("http://localhost/api/market/building-permits");
    const res = await GET(req);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to fetch building permits feed",
    });
  });
});
