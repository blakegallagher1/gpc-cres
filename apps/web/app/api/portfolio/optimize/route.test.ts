import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getCapitalAllocationMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getCapitalAllocationMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/portfolioAnalytics.service", () => ({
  getCapitalAllocation: getCapitalAllocationMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { POST } from "./route";

describe("POST /api/portfolio/optimize", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getCapitalAllocationMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await POST(new NextRequest("http://localhost/api/portfolio/optimize", {
      method: "POST",
      body: JSON.stringify({ availableEquity: 1000000 }),
    }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid available equity", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    const res = await POST(new NextRequest("http://localhost/api/portfolio/optimize", {
      method: "POST",
      body: JSON.stringify({ availableEquity: 0 }),
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "availableEquity must be a positive number" });
  });

  it("computes capital allocation for the scoped org", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getCapitalAllocationMock.mockResolvedValue({ recommendedDeals: [], totalAllocated: 5000000 });
    const res = await POST(new NextRequest("http://localhost/api/portfolio/optimize", {
      method: "POST",
      body: JSON.stringify({ availableEquity: 5000000, maxDeals: 4 }),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recommendedDeals: [], totalAllocated: 5000000 });
    expect(getCapitalAllocationMock).toHaveBeenCalledWith("org-1", 5000000, 4);
  });
});