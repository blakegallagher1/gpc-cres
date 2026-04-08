import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  getAdminStatsMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  getAdminStatsMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server/admin/stats.service", () => ({
  getAdminStats: getAdminStatsMock,
  VALID_TABS: ["overview", "knowledge", "memory", "agents", "system", "all"],
}));

import { GET } from "./route";

describe("GET /api/admin/stats", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    getAdminStatsMock.mockReset();

    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: {
        orgId: "22222222-2222-4222-8222-222222222222",
        userId: "11111111-1111-4111-8111-111111111111",
      },
      authorizedBy: "admin_session",
      rule: { routePattern: "/api/admin/stats", authMode: "session", scopes: [] },
      key: null,
    });
  });

  it("returns the authorization response when unauthenticated", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(new NextRequest("http://localhost/api/admin/stats"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(getAdminStatsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid tab names", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats?tab=invalid"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid tab parameter",
      detail: "Expected one of: overview, knowledge, memory, agents, system, all",
    });
    expect(getAdminStatsMock).not.toHaveBeenCalled();
  });

  it("delegates to getAdminStats and returns overview data", async () => {
    getAdminStatsMock.mockResolvedValue({
      overview: {
        knowledgeCount: 11,
        verifiedCount: 2,
        entityCount: 4,
        trajectoryLogCount: 6,
        episodicEntryCount: 7,
        proceduralSkillCount: 8,
        proceduralSkillEpisodeCount: 0,
        runs24h: 5,
        promotionBreakdown: { promoted: 3 },
        knowledgeByType: [{ contentType: "memory_note", count: 3 }],
        recentActivity: [],
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats?tab=overview"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.overview).toMatchObject({
      knowledgeCount: 11,
      verifiedCount: 2,
      entityCount: 4,
      trajectoryLogCount: 6,
      episodicEntryCount: 7,
      proceduralSkillCount: 8,
      proceduralSkillEpisodeCount: 0,
      runs24h: 5,
      promotionBreakdown: { promoted: 3 },
      knowledgeByType: [{ contentType: "memory_note", count: 3 }],
    });
    expect(getAdminStatsMock).toHaveBeenCalledOnce();
    expect(getAdminStatsMock).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      {
        tab: "overview",
        page: 1,
        limit: 25,
        offset: 0,
        search: "",
        contentType: "",
        subTab: "facts",
      },
    );
  });

  it("passes query params and returns partial errors with fallback values", async () => {
    getAdminStatsMock.mockResolvedValue({
      overview: {
        knowledgeCount: 11,
        verifiedCount: 0,
        entityCount: 4,
        proceduralSkillEpisodeCount: 9,
        runs24h: 0,
        trajectoryLogCount: 0,
        episodicEntryCount: 0,
        proceduralSkillCount: 0,
        promotionBreakdown: {},
        recentActivity: [],
        knowledgeByType: [],
      },
      errors: {
        overview: {
          message: "Unable to load this section",
          detail: "db unavailable",
        },
      },
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/admin/stats?tab=overview&page=2&limit=10&search=variance&contentType=memory_note&subTab=episodes",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.errors).toMatchObject({
      overview: {
        message: "Unable to load this section",
        detail: "db unavailable",
      },
    });
    expect(getAdminStatsMock).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      {
        tab: "overview",
        page: 2,
        limit: 10,
        offset: 10,
        search: "variance",
        contentType: "memory_note",
        subTab: "episodes",
      },
    );
  });

  it("returns 500 with the current error shape when the service throws", async () => {
    getAdminStatsMock.mockRejectedValue(new Error("stats failed"));

    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats?tab=overview"),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Internal server error",
      detail: "stats failed",
      tab: "overview",
    });
  });
});
