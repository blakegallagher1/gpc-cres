import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  get1031MatchesMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  get1031MatchesMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/portfolioAnalytics.service", () => ({
  get1031Matches: get1031MatchesMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET } from "./route";

describe("GET /api/portfolio/1031-matches/[dealId]", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    get1031MatchesMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/portfolio/1031-matches/deal-1"), {
      params: Promise.resolve({ dealId: "deal-1" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 1031 exchange matches for the scoped org and disposition deal", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    get1031MatchesMock.mockResolvedValue({ matches: [{ id: "deal-2" }], dispositionDealId: "deal-1" });
    const res = await GET(new NextRequest("http://localhost/api/portfolio/1031-matches/deal-1"), {
      params: Promise.resolve({ dealId: "deal-1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matches: [{ id: "deal-2" }], dispositionDealId: "deal-1" });
    expect(get1031MatchesMock).toHaveBeenCalledWith("org-1", "deal-1");
  });

  it("returns 500 when the matching service fails", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    const error = new Error("match failure");
    get1031MatchesMock.mockRejectedValue(error);
    const res = await GET(new NextRequest("http://localhost/api/portfolio/1031-matches/deal-1"), {
      params: Promise.resolve({ dealId: "deal-1" }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to find 1031 exchange matches" });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ tags: { route: "api.portfolio.1031-matches", method: "GET" } }),
    );
  });
});