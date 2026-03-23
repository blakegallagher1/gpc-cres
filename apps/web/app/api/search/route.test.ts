import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, searchKnowledgeBaseMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  searchKnowledgeBaseMock: vi.fn(),
}));

const {
  dealFindManyMock,
  runFindManyMock,
  conversationFindManyMock,
} = vi.hoisted(() => ({
  dealFindManyMock: vi.fn(),
  runFindManyMock: vi.fn(),
  conversationFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/knowledgeBase.service", () => ({
  searchKnowledgeBase: searchKnowledgeBaseMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: { findMany: dealFindManyMock },
    run: { findMany: runFindManyMock },
    conversation: { findMany: conversationFindManyMock },
  },
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/search route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    searchKnowledgeBaseMock.mockReset();
    dealFindManyMock.mockReset();
    runFindManyMock.mockReset();
    conversationFindManyMock.mockReset();
    vi.restoreAllMocks();

    process.env.LOCAL_API_URL = "https://gateway.example.com";
    process.env.LOCAL_API_KEY = "test-gateway-key";
  });

  afterEach(() => {
    delete process.env.LOCAL_API_URL;
    delete process.env.LOCAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/search?q=oak"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for too-short queries", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await GET(new NextRequest("http://localhost/api/search?q=o"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "q: q must be at least 2 characters",
    });
  });

  it("returns grouped org-scoped results", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    dealFindManyMock.mockResolvedValue([
      {
        id: "deal-1",
        name: "Oak Assembly",
        status: "INTAKE",
        sku: "SITE_CONTROL",
        jurisdiction: { name: "Baton Rouge" },
      },
    ]);
    runFindManyMock.mockResolvedValue([
      {
        id: "run-1",
        runType: "TRIAGE",
        status: "succeeded",
        dealId: "deal-1",
        error: null,
      },
    ]);
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conversation-1",
        title: "Oak zoning review",
        dealId: "deal-1",
        _count: { messages: 4 },
      },
    ]);
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        id: "knowledge-1",
        contentType: "deal_memo",
        sourceId: "memo-1",
        contentText: "Oak memo excerpt",
        metadata: { sourceTitle: "Oak memo" },
      },
    ]);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        parcels: [
          {
            id: "parcel-1",
            address: "123 Oak St",
            apn: "123-456",
            zoning: "C-2",
          },
        ],
      }),
    );

    const res = await GET(new NextRequest("http://localhost/api/search?q=oak&limit=3"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      query: "oak",
      limit: 3,
      groups: {
        deals: [{ id: "deal-1", href: "/deals/deal-1" }],
        parcels: [{ id: "parcel-1", href: "/map?parcel=parcel-1" }],
        knowledge: [{ id: "knowledge-1", title: "Oak memo", href: "/admin?tab=knowledge&search=memo-1" }],
        runs: [{ id: "run-1", href: "/runs/run-1" }],
        conversations: [
          {
            id: "conversation-1",
            href: "/chat?conversationId=conversation-1&dealId=deal-1",
          },
        ],
      },
      errors: {},
    });
    expect(dealFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: ORG_ID }),
        take: 3,
      }),
    );
    expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
      ORG_ID,
      "oak",
      undefined,
      3,
      "auto",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.com/api/parcel/search?q=oak&limit=3",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-gateway-key",
        }),
      }),
    );
  });

  it("returns partial failures without failing the whole response", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    dealFindManyMock.mockResolvedValue([]);
    runFindManyMock.mockResolvedValue([]);
    conversationFindManyMock.mockResolvedValue([]);
    searchKnowledgeBaseMock.mockRejectedValue(new Error("qdrant down"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "bad gateway" }, 502));

    const res = await GET(new NextRequest("http://localhost/api/search?q=oak"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      groups: {
        deals: [],
        parcels: [],
        knowledge: [],
        runs: [],
        conversations: [],
      },
      errors: {
        knowledge: "Knowledge search is unavailable right now.",
        parcels: "Parcel search is unavailable right now.",
      },
    });
  });
});
