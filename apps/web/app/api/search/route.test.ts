import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, runGlobalSearchMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  runGlobalSearchMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server/search/global-search.service", () => ({
  runGlobalSearch: runGlobalSearchMock,
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
    runGlobalSearchMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
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
    runGlobalSearchMock.mockResolvedValue({
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
    expect(runGlobalSearchMock).toHaveBeenCalledWith({
      orgId: ORG_ID,
      query: "oak",
      limit: 3,
    });
  });

  it("returns partial failures without failing the whole response", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    runGlobalSearchMock.mockResolvedValue({
      query: "oak",
      limit: 10,
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
