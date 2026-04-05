import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getDealVelocityAnalyticsMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getDealVelocityAnalyticsMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/portfolioAnalytics.service", () => ({
  getDealVelocityAnalytics: getDealVelocityAnalyticsMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET } from "./route";

describe("GET /api/portfolio/velocity", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getDealVelocityAnalyticsMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/portfolio/velocity"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns deal velocity analytics for the scoped org", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getDealVelocityAnalyticsMock.mockResolvedValue({
      avgDaysInStage: { INTAKE: 12, PREAPP: 34 },
      closedPerQuarter: [{ quarter: "2026-Q1", count: 3 }],
      stalledDeals: 2,
    });

    const res = await GET(new NextRequest("http://localhost/api/portfolio/velocity"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      avgDaysInStage: { INTAKE: 12, PREAPP: 34 },
      closedPerQuarter: [{ quarter: "2026-Q1", count: 3 }],
      stalledDeals: 2,
    });
    expect(getDealVelocityAnalyticsMock).toHaveBeenCalledWith("org-1");
  });

  it("returns 500 for unexpected analytics failures", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    const error = new Error("velocity failed");
    getDealVelocityAnalyticsMock.mockRejectedValue(error);

    const res = await GET(new NextRequest("http://localhost/api/portfolio/velocity"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to compute deal velocity analytics" });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ tags: { route: "api.portfolio.velocity", method: "GET" } }),
    );
  });
});