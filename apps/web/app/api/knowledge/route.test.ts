import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  searchKnowledgeBaseMock,
  ingestKnowledgeMock,
  getKnowledgeStatsMock,
  getRecentEntriesMock,
  deleteKnowledgeMock,
  resolveKnowledgeSearchModeMock,
  isKnowledgeSearchErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  searchKnowledgeBaseMock: vi.fn(),
  ingestKnowledgeMock: vi.fn(),
  getKnowledgeStatsMock: vi.fn(),
  getRecentEntriesMock: vi.fn(),
  deleteKnowledgeMock: vi.fn(),
  resolveKnowledgeSearchModeMock: vi.fn(),
  isKnowledgeSearchErrorMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/knowledgeBase.service", () => ({
  searchKnowledgeBase: searchKnowledgeBaseMock,
  ingestKnowledge: ingestKnowledgeMock,
  getKnowledgeStats: getKnowledgeStatsMock,
  getRecentEntries: getRecentEntriesMock,
  deleteKnowledge: deleteKnowledgeMock,
  resolveKnowledgeSearchMode: resolveKnowledgeSearchModeMock,
  isKnowledgeSearchError: isKnowledgeSearchErrorMock,
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/knowledge route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    searchKnowledgeBaseMock.mockReset();
    ingestKnowledgeMock.mockReset();
    getKnowledgeStatsMock.mockReset();
    getRecentEntriesMock.mockReset();
    deleteKnowledgeMock.mockReset();
    resolveKnowledgeSearchModeMock.mockReset();
    isKnowledgeSearchErrorMock.mockReset();

    resolveKnowledgeSearchModeMock.mockImplementation((_query: string, mode: string) =>
      mode === "auto" ? "semantic" : mode
    );
    isKnowledgeSearchErrorMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated GET requests", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/knowledge?view=stats"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid search mode", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await GET(
      new NextRequest("http://localhost/api/knowledge?view=search&q=test&mode=bogus")
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "mode must be one of: auto, exact, semantic",
    });
    expect(searchKnowledgeBaseMock).not.toHaveBeenCalled();
  });

  it("returns resolved mode and delegates semantic search", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    searchKnowledgeBaseMock.mockResolvedValue([{ id: "knowledge-1" }]);
    resolveKnowledgeSearchModeMock.mockReturnValue("semantic");

    const res = await GET(
      new NextRequest(
        "http://localhost/api/knowledge?view=search&q=find%20similar%20drainage%20issues&mode=auto&types=deal_memo&limit=3"
      )
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      mode: "semantic",
      results: [{ id: "knowledge-1" }],
    });
    expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
      ORG_ID,
      "find similar drainage issues",
      ["deal_memo"],
      3,
      "auto"
    );
  });

  it("maps knowledge search errors to their explicit status", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    const error = Object.assign(
      new Error("Semantic knowledge search is unavailable because Qdrant is not configured"),
      { status: 503 }
    );
    searchKnowledgeBaseMock.mockRejectedValue(error);
    isKnowledgeSearchErrorMock.mockImplementation((candidate: unknown) => candidate === error);

    const res = await GET(
      new NextRequest(
        "http://localhost/api/knowledge?view=search&q=find%20similar%20drainage%20issues&mode=semantic"
      )
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Semantic knowledge search is unavailable because Qdrant is not configured",
    });
  });

  it("returns 400 for invalid ingest payloads", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "ingest", sourceId: "memo-1" }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "contentType, sourceId, and contentText are required",
    });
  });

  it("deletes knowledge for the authenticated org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    deleteKnowledgeMock.mockResolvedValue(2);

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "delete", sourceId: "memo-1" }),
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: 2 });
    expect(deleteKnowledgeMock).toHaveBeenCalledWith(ORG_ID, "memo-1");
  });
});
