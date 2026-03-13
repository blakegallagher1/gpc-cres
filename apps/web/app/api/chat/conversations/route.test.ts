import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, conversationFindManyMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  conversationFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    conversation: {
      findMany: conversationFindManyMock,
    },
  },
}));

vi.mock("@/lib/server/appDbEnv", () => ({
  shouldUseAppDatabaseDevFallback: vi.fn(() => false),
}));

import { GET } from "./route";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";

describe("GET /api/chat/conversations", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    conversationFindManyMock.mockReset();
    vi.mocked(shouldUseAppDatabaseDevFallback).mockReturnValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/chat/conversations");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(conversationFindManyMock).not.toHaveBeenCalled();
  });

  it("returns org-scoped conversation summaries", async () => {
    const updatedAt = new Date("2026-03-12T00:00:00.000Z");
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        title: "Downtown zoning follow-up",
        dealId: "deal-1",
        updatedAt,
        _count: { messages: 4 },
      },
    ]);

    const req = new NextRequest("http://localhost/api/chat/conversations");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      conversations: [
        {
          id: "conv-1",
          title: "Downtown zoning follow-up",
          dealId: "deal-1",
          updatedAt: updatedAt.toISOString(),
          messageCount: 4,
        },
      ],
    });
    expect(conversationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "11111111-1111-4111-8111-111111111111" },
        orderBy: { updatedAt: "desc" },
      }),
    );
  });

  it("degrades to an empty list when chat persistence is unavailable", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    conversationFindManyMock.mockRejectedValue(
      new Error("Can't reach database server at localhost:5432"),
    );

    const req = new NextRequest("http://localhost/api/chat/conversations");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ conversations: [], degraded: true });
  });

  it("short-circuits before Prisma when dev fallback is active", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    vi.mocked(shouldUseAppDatabaseDevFallback).mockReturnValue(true);

    const req = new NextRequest("http://localhost/api/chat/conversations");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ conversations: [], degraded: true });
    expect(conversationFindManyMock).not.toHaveBeenCalled();
  });
});
