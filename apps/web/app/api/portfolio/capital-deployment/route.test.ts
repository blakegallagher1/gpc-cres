import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getCapitalDeploymentAnalyticsMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getCapitalDeploymentAnalyticsMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/portfolioAnalytics.service", () => ({
  getCapitalDeploymentAnalytics: getCapitalDeploymentAnalyticsMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET } from "./route";

describe("GET /api/portfolio/capital-deployment", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getCapitalDeploymentAnalyticsMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/portfolio/capital-deployment"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns capital deployment analytics for the scoped org", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getCapitalDeploymentAnalyticsMock.mockResolvedValue({
      deployedByQuarter: [{ quarter: "2026-Q1", equity: 3000000 }],
      remainingCapacity: 7000000,
      targetAllocation: { IOS: 0.6, TRUCK_PARKING: 0.4 },
    });

    const res = await GET(new NextRequest("http://localhost/api/portfolio/capital-deployment"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deployedByQuarter: [{ quarter: "2026-Q1", equity: 3000000 }],
      remainingCapacity: 7000000,
      targetAllocation: { IOS: 0.6, TRUCK_PARKING: 0.4 },
    });
    expect(getCapitalDeploymentAnalyticsMock).toHaveBeenCalledWith("org-1");
  });

  it("returns 500 for unexpected analytics failures", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    const error = new Error("deployment failed");
    getCapitalDeploymentAnalyticsMock.mockRejectedValue(error);

    const res = await GET(new NextRequest("http://localhost/api/portfolio/capital-deployment"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to compute capital deployment analytics" });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ tags: { route: "api.portfolio.capital-deployment", method: "GET" } }),
    );
  });
});