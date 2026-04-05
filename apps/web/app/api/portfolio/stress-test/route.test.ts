import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getPortfolioStressTestMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getPortfolioStressTestMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/portfolioAnalytics.service", () => ({
  getPortfolioStressTest: getPortfolioStressTestMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { POST } from "./route";

describe("POST /api/portfolio/stress-test", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getPortfolioStressTestMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await POST(new NextRequest("http://localhost/api/portfolio/stress-test", {
      method: "POST",
      body: JSON.stringify({ scenario: { name: "Rates +200bps" } }),
    }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when scenario name is missing", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });

    const res = await POST(new NextRequest("http://localhost/api/portfolio/stress-test", {
      method: "POST",
      body: JSON.stringify({ scenario: {} }),
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "scenario with name is required" });
  });

  it("runs the stress test for the scoped org", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getPortfolioStressTestMock.mockResolvedValue({
      scenario: { name: "Rates +200bps" },
      portfolioIrrDelta: -2.1,
      dealImpacts: [],
    });

    const res = await POST(new NextRequest("http://localhost/api/portfolio/stress-test", {
      method: "POST",
      body: JSON.stringify({ scenario: { name: "Rates +200bps", interestRateDelta: 2 } }),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      scenario: { name: "Rates +200bps" },
      portfolioIrrDelta: -2.1,
      dealImpacts: [],
    });
    expect(getPortfolioStressTestMock).toHaveBeenCalledWith("org-1", {
      name: "Rates +200bps",
      interestRateDelta: 2,
    });
  });
});