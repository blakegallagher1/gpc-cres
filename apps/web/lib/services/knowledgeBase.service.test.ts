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

vi.mock("@entitlement-os/openai", () => ({
  createEmbedding: embeddingsCreateMock,
}));

import {
  __resetKnowledgeBaseTestState,
  deleteKnowledge,
  ensureInstitutionalKnowledgeCollectionReady,
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
    __resetKnowledgeBaseTestState();
    vi.stubGlobal("fetch", fetchMock);

    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.QDRANT_URL = "https://qdrant.example.com";
    process.env.QDRANT_API_KEY = "qdrant-key";
    process.env.AGENTOS_QDRANT_COLLECTION_INSTITUTIONAL_KNOWLEDGE = "institutional_knowledge";
    process.env.AGENTOS_QDRANT_DENSE_VECTOR_NAME = "dense";

    embeddingsCreateMock.mockResolvedValue([0.1, 0.2, 0.3]);
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
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "ok" })) // collection exists
      .mockResolvedValueOnce(jsonResponse({ status: "ok" })); // points upsert

    const ids = await ingestKnowledge(
      "org-1",
      "deal_memo",
      "memo-123",
      "Important memo content",
      { source: "upload" }
    );

    expect(ids).toEqual(["knowledge-1"]);
    expect(prismaQueryRawUnsafeMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [inspectUrl, inspectOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(inspectUrl).toContain("/collections/institutional_knowledge");
    expect(inspectOptions?.method ?? "GET").toBe("GET");
    const [upsertUrl, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(upsertUrl).toContain("/collections/institutional_knowledge/points");
    expect(options.method).toBe("PUT");
  });

  it("fails closed when workbook ingest requires Qdrant but it is not configured", async () => {
    delete process.env.QDRANT_URL;

    await expect(ensureInstitutionalKnowledgeCollectionReady()).rejects.toSatisfy(
      (error: unknown) => {
        expect(isKnowledgeSearchError(error)).toBe(true);
        expect((error as Error).message).toContain(
          "Institutional knowledge ingest requires Qdrant"
        );
        return true;
      }
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns collection readiness details when institutional knowledge Qdrant is configured", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    await expect(ensureInstitutionalKnowledgeCollectionReady()).resolves.toEqual({
      enabled: true,
      collection: "institutional_knowledge",
      denseVectorName: "dense",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/collections/institutional_knowledge");
    expect(options?.method ?? "GET").toBe("GET");
  });

  it("creates the institutional knowledge collection once when missing", async () => {
    prismaQueryRawUnsafeMock
      .mockResolvedValueOnce([{ id: "knowledge-1" }])
      .mockResolvedValueOnce([{ id: "knowledge-2" }]);

    const calls: Array<{ url: string; method: string }> = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });

      if (url.includes("/collections/") && method === "GET") {
        return Promise.resolve(new Response("", { status: 404 }));
      }

      if (url.endsWith("/index")) {
        return Promise.resolve(jsonResponse({ status: "indexed" }));
      }

      if (url.includes("/points")) {
        return Promise.resolve(jsonResponse({ status: "mirrored" }));
      }

      return Promise.resolve(jsonResponse({ status: "created" }));
    });

    const firstIds = await ingestKnowledge(
      "org-1",
      "deal_memo",
      "memo-123",
      "Important memo content",
      { source: "upload" }
    );

    const secondIds = await ingestKnowledge(
      "org-1",
      "deal_memo",
      "memo-456",
      "Follow-up memo content",
      { source: "upload" }
    );

    expect(firstIds).toEqual(["knowledge-1"]);
    expect(secondIds).toEqual(["knowledge-2"]);
    expect(fetchMock).toHaveBeenCalled();
    const getCalls = calls.filter((call) => call.method === "GET");
    expect(getCalls.length).toBeGreaterThanOrEqual(1);
    expect(getCalls[0]!.url).toContain("/collections/institutional_knowledge");
    const indexCalls = calls.filter((call) => call.url.endsWith("/index"));
    expect(indexCalls).toHaveLength(6);
    expect(indexCalls.every((call) =>
      call.url.includes("/collections/institutional_knowledge/index")
    )).toBe(true);
    const pointCalls = calls.filter((call) => call.url.includes("/points"));
    expect(pointCalls).toHaveLength(2);
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
