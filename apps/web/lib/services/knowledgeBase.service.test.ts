import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaQueryRawUnsafeMock,
  prismaExecuteRawUnsafeMock,
  embeddingsCreateMock,
  fetchMock,
} = vi.hoisted(() => ({
  prismaQueryRawUnsafeMock: vi.fn(),
  prismaExecuteRawUnsafeMock: vi.fn(),
  embeddingsCreateMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRawUnsafe: prismaQueryRawUnsafeMock,
    $executeRawUnsafe: prismaExecuteRawUnsafeMock,
  },
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    embeddings = {
      create: embeddingsCreateMock,
    };
  },
}));

import {
  deleteKnowledge,
  ingestKnowledge,
  isKnowledgeSearchError,
  resolveKnowledgeSearchMode,
  searchKnowledgeBase,
} from "./knowledgeBase.service";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("knowledgeBase.service", () => {
  beforeEach(() => {
    prismaQueryRawUnsafeMock.mockReset();
    prismaExecuteRawUnsafeMock.mockReset();
    embeddingsCreateMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);

    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.QDRANT_URL = "https://qdrant.example.com";
    process.env.QDRANT_API_KEY = "qdrant-key";
    process.env.AGENTOS_QDRANT_COLLECTION_INSTITUTIONAL_KNOWLEDGE = "institutional_knowledge";
    process.env.AGENTOS_QDRANT_DENSE_VECTOR_NAME = "dense";

    embeddingsCreateMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it("classifies precise identifiers as exact and broad questions as semantic", () => {
    expect(resolveKnowledgeSearchMode("memo-123", "auto")).toBe("exact");
    expect(
      resolveKnowledgeSearchMode("What prior deal memos mention drainage risk near Gonzales?", "auto")
    ).toBe("semantic");
  });

  it("uses Postgres exact search without calling Qdrant", async () => {
    prismaQueryRawUnsafeMock.mockResolvedValue([
      {
        id: "knowledge-1",
        contentType: "deal_memo",
        sourceId: "memo-123",
        contentText: "memo text",
        metadata: { stage: "screening" },
        similarity: 1,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    ]);

    const results = await searchKnowledgeBase(
      "org-1",
      "memo-123",
      ["deal_memo"],
      5,
      "exact"
    );

    expect(results).toEqual([
      {
        id: "knowledge-1",
        contentType: "deal_memo",
        sourceId: "memo-123",
        contentText: "memo text",
        metadata: { stage: "screening" },
        similarity: 1,
        createdAt: "2026-03-01T00:00:00.000Z",
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaQueryRawUnsafeMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed for semantic search when Qdrant is unavailable", async () => {
    delete process.env.QDRANT_URL;

    await expect(
      searchKnowledgeBase("org-1", "find similar drainage issues across prior deals", undefined, 5, "semantic")
    ).rejects.toSatisfy((error: unknown) => {
      expect(isKnowledgeSearchError(error)).toBe(true);
      expect((error as Error).message).toContain("Semantic knowledge search is unavailable");
      return true;
    });

    expect(prismaQueryRawUnsafeMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes semantic search to Qdrant and applies content type filtering", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        result: {
          points: [
            {
              id: "knowledge-1",
              score: 0.91,
              payload: {
                knowledgeId: "knowledge-1",
                contentType: "deal_memo",
                sourceId: "memo-123",
                contentText: "Drainage issue summary",
                metadata: { stage: "screening" },
                createdAt: "2026-03-02T00:00:00.000Z",
              },
            },
            {
              id: "knowledge-2",
              score: 0.75,
              payload: {
                knowledgeId: "knowledge-2",
                contentType: "user_note",
                sourceId: "note-1",
                contentText: "Irrelevant note",
                metadata: {},
                createdAt: "2026-03-02T00:00:00.000Z",
              },
            },
          ],
        },
      })
    );

    const results = await searchKnowledgeBase(
      "org-1",
      "find similar drainage issues across prior deals",
      ["deal_memo"],
      5,
      "semantic"
    );

    expect(results).toEqual([
      {
        id: "knowledge-1",
        contentType: "deal_memo",
        sourceId: "memo-123",
        contentText: "Drainage issue summary",
        metadata: { stage: "screening" },
        similarity: 0.91,
        createdAt: "2026-03-02T00:00:00.000Z",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/collections/institutional_knowledge/points/query");
    expect(options.method).toBe("POST");
  });

  it("mirrors ingested knowledge into Qdrant when configured", async () => {
    prismaQueryRawUnsafeMock.mockResolvedValue([{ id: "knowledge-1" }]);
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    const ids = await ingestKnowledge(
      "org-1",
      "deal_memo",
      "memo-123",
      "Important memo content",
      { source: "upload" }
    );

    expect(ids).toEqual(["knowledge-1"]);
    expect(prismaQueryRawUnsafeMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("PUT");
  });

  it("deletes mirrored knowledge from Qdrant when removing a source", async () => {
    prismaExecuteRawUnsafeMock.mockResolvedValue(2);
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    const deleted = await deleteKnowledge("org-1", "memo-123");

    expect(deleted).toBe(2);
    expect(prismaExecuteRawUnsafeMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/points/delete");
    expect(options.method).toBe("POST");
  });
});
