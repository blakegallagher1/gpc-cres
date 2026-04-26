import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  listConversationsForOrgMock,
  shouldUseAppDatabaseDevFallbackMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  listConversationsForOrgMock: vi.fn(),
  shouldUseAppDatabaseDevFallbackMock: vi.fn(() => false),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server/chat/conversation-route.service", () => ({
  listConversationsForOrg: listConversationsForOrgMock,
}));

vi.mock("@/lib/server/appDbEnv", () => ({
  shouldUseAppDatabaseDevFallback: shouldUseAppDatabaseDevFallbackMock,
}));

import { GET } from "./route";

describe("GET /api/chat/conversations", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    listConversationsForOrgMock.mockReset();
    shouldUseAppDatabaseDevFallbackMock.mockReset();
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(false);
  });

  it("returns 401 when unauthorized", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: null,
    });

    const req = new NextRequest("http://localhost/api/chat/conversations");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(listConversationsForOrgMock).not.toHaveBeenCalled();
  });

  it("returns the delegated conversation summaries", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    listConversationsForOrgMock.mockResolvedValue([
      {
        id: "conv-1",
        title: "Downtown zoning follow-up",
        dealId: "deal-1",
        updatedAt: "2026-03-12T00:00:00.000Z",
        messageCount: 4,
      },
    ]);

    const req = new NextRequest("http://localhost/api/chat/conversations");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversations: [
        {
          id: "conv-1",
          title: "Downtown zoning follow-up",
          dealId: "deal-1",
          updatedAt: "2026-03-12T00:00:00.000Z",
          messageCount: 4,
        },
      ],
    });
    expect(listConversationsForOrgMock).toHaveBeenCalledWith("org-1");
  });

  it("returns the dev fallback payload before service access", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(true);

    const req = new NextRequest("http://localhost/api/chat/conversations");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [], degraded: true });
    expect(listConversationsForOrgMock).not.toHaveBeenCalled();
  });

  it("degrades when persistence is unavailable", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    listConversationsForOrgMock.mockRejectedValue(
      new Error("Can't reach database server at localhost:5432"),
    );

    const req = new NextRequest("http://localhost/api/chat/conversations");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [], degraded: true });
  });

  it("degrades when the gateway DB proxy is unavailable", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    listConversationsForOrgMock.mockRejectedValue(
      new Error('Gateway DB proxy failed across 1 target(s): gateway-proxy (https://gateway.gallagherpropco.com) gateway DB proxy error (530): "error code: 1033"'),
    );

    const req = new NextRequest("http://localhost/api/chat/conversations");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [], degraded: true });
  });

  it("returns the authorization response when auth resolution fails upstream", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const req = new NextRequest("http://localhost/api/chat/conversations");
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});
