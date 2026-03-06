import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockQueryRawUnsafe,
  mockRecordDataAgentRetrieval,
  mockCanUseQdrantHybridRetrieval,
  mockHybridSearchQdrant,
} = vi.hoisted(() => ({
  mockQueryRawUnsafe: vi.fn(),
  mockRecordDataAgentRetrieval: vi.fn(),
  mockCanUseQdrantHybridRetrieval: vi.fn(),
  mockHybridSearchQdrant: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
  },
}));

vi.mock("@entitlement-os/shared", () => ({
  recordDataAgentRetrieval: mockRecordDataAgentRetrieval,
}));

vi.mock("../agentos/qdrant.js", () => ({
  canUseQdrantHybridRetrieval: mockCanUseQdrantHybridRetrieval,
  hybridSearchQdrant: mockHybridSearchQdrant,
}));

import { buildDataAgentRetrievalContext } from "./retrieval";

beforeEach(() => {
  mockQueryRawUnsafe.mockReset();
  mockRecordDataAgentRetrieval.mockReset();
  mockCanUseQdrantHybridRetrieval.mockReset();
  mockHybridSearchQdrant.mockReset();
});

describe("buildDataAgentRetrievalContext", () => {
  it("keeps precise queries on Postgres exact-first retrieval", async () => {
    mockCanUseQdrantHybridRetrieval.mockReturnValue(true);
    mockQueryRawUnsafe.mockImplementation((query: string, ...params: unknown[]) => {
      if (query.includes("FROM knowledge_embeddings")) {
        expect(params[0]).toBe("org-1");
        return Promise.resolve([
          {
            id: "k1",
            contentText: "Parcel 015-4249-4 zoning note",
            metadata: { subjectId: "run-1" },
            sourceTimestamp: new Date("2026-03-01T00:00:00.000Z"),
          },
        ]);
      }
      if (query.includes('FROM "KGEvent"')) {
        expect(query).toContain("WHERE ge.org_id = $2");
        expect(params[1]).toBe("org-1");
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const context = await buildDataAgentRetrievalContext("parcel 015-4249-4", "run-1", {
      orgId: "org-1",
    });

    expect(mockHybridSearchQdrant).not.toHaveBeenCalled();
    expect(context.sources).toEqual({
      semantic: 0,
      sparse: 1,
      graph: 0,
    });
    expect(context.results[0]).toEqual(
      expect.objectContaining({
        id: "k1",
        source: "sparse",
      }),
    );
  });

  it("adds Qdrant augmentation for semantic queries and keeps deterministic ranking", async () => {
    mockCanUseQdrantHybridRetrieval.mockReturnValue(true);
    mockQueryRawUnsafe.mockImplementation((query: string) => {
      if (query.includes("FROM knowledge_embeddings")) {
        return Promise.resolve([
          {
            id: "k1",
            contentText: "wetlands risk note",
            metadata: {},
            sourceTimestamp: new Date("2026-03-01T00:00:00.000Z"),
          },
        ]);
      }
      if (query.includes('FROM "KGEvent"')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    mockHybridSearchQdrant.mockResolvedValue([
      {
        id: "q1",
        source: "semantic",
        text: "similar wetlands issue in nearby parcel",
        score: 0.81,
        payload: { subjectId: "run-1" },
      },
    ]);

    const context = await buildDataAgentRetrievalContext(
      "explain similar wetlands risk patterns",
      "run-1",
      {
        orgId: "org-1",
      },
    );

    expect(mockHybridSearchQdrant).toHaveBeenCalledWith({
      query: "explain similar wetlands risk patterns",
      orgId: "org-1",
      limit: 40,
    });
    expect(context.sources).toEqual({
      semantic: 1,
      sparse: 1,
      graph: 0,
    });
    expect(context.results.map((item) => item.id)).toEqual(["k1", "q1"]);
    expect(context.results[0]?.score).toBeGreaterThanOrEqual(context.results[1]?.score ?? 0);
  });
});
