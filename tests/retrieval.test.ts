/**
 * Unit tests for hybrid retrieval.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockQueryRawUnsafe, mockTemporalFindMany } = vi.hoisted(() => ({
  mockQueryRawUnsafe: vi.fn(),
  mockTemporalFindMany: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
    temporalEdge: {
      findMany: mockTemporalFindMany,
    },
  },
}));

vi.mock("../openTelemetry/setup.ts", () => ({
  withSpan: async (_name: string, fn: () => Promise<unknown> | unknown) => fn(),
}));

import * as retrieval from "../services/retrieval.service.ts";

beforeEach(() => {
  vi.restoreAllMocks();
  mockQueryRawUnsafe.mockReset();
  mockTemporalFindMany.mockReset();
});

describe("retrieval.service", () => {
  it("combines semantic, sparse, and graph results with reranking", async () => {
    vi.spyOn(retrieval, "createQueryEmbedding").mockResolvedValue(Array(4).fill(0.11));

    const semanticRows = [
      {
        id: "v1",
        contentText: "semantic memory about permits",
        metadata: {},
        semanticScore: 0.99,
        sourceTimestamp: new Date(),
      },
    ];
    const sparseRows = [
      {
        id: "s1",
        contentText: "permit review note",
        metadata: {},
        sparseScore: 0.01,
        sourceTimestamp: new Date(),
      },
    ];
    const graphRows = [
      {
        id: "g1",
        subjectId: "run-1",
        predicate: "depends_on",
        objectId: "permit-license",
        confidence: 0.7,
        timestamp: new Date(),
        sourceHash: "hash",
      },
    ];

    mockQueryRawUnsafe.mockImplementation((query: string) => {
      if (typeof query === "string" && query.includes("vector_embedding")) {
        return Promise.resolve(semanticRows);
      }
      if (typeof query === "string" && query.includes("pg_extension")) {
        return Promise.resolve([{ available: true }]);
      }
      if (typeof query === "string" && query.includes("similarity(ke.content_text")) {
        return Promise.resolve(sparseRows);
      }
      if (typeof query === "string" && query.includes("FROM \"KGEvent\"")) {
        return Promise.resolve(graphRows);
      }
      return Promise.resolve([]);
    });

    mockTemporalFindMany.mockResolvedValue([]);

    const result = await retrieval.unifiedRetrieval("permit review", undefined, "org-1");

    expect(result).toHaveLength(3);
    expect(result[0].source).toBe("semantic");
    expect(result[0].id).toBe("v1");
    expect(result.map((r) => r.source)).toContain("sparse");
    expect(result.map((r) => r.source)).toContain("graph");
  });

  it("requires non-empty query", async () => {
    await expect(retrieval.unifiedRetrieval("   ")).rejects.toThrow("query is required");
  });

  it("applies orgId scoping to KG graph queries on happy path", async () => {
    vi.spyOn(retrieval, "createQueryEmbedding").mockResolvedValue(Array(4).fill(0.11));

    mockQueryRawUnsafe.mockImplementation((query: string, ...params: unknown[]) => {
      if (typeof query === "string" && query.includes("pg_extension")) {
        return Promise.resolve([{ available: true }]);
      }
      if (typeof query === "string" && query.includes("vector_embedding")) {
        return Promise.resolve([]);
      }
      if (typeof query === "string" && query.includes("similarity(ke.content_text")) {
        return Promise.resolve([]);
      }
      if (typeof query === "string" && query.includes("FROM \"KGEvent\"")) {
        expect(query).toContain("WHERE ge.org_id = $2");
        expect(params[0]).toBe("permit");
        expect(params[1]).toBe("org-1");
        return Promise.resolve([
          {
            id: "g1",
            subjectId: "s",
            predicate: "relates_to",
            objectId: "o",
            confidence: 0.7,
            timestamp: new Date(),
            sourceHash: "hash",
          },
        ]);
      }
      if (typeof query === "string" && query.includes("FROM \"TemporalEdge\"")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const result = await retrieval.unifiedRetrieval("permit", undefined, "org-1");
    expect(result.some((entry) => entry.source === "graph")).toBe(true);
  });

  it("rejects cross-tenant graph access by requiring orgId for KG search", async () => {
    vi.spyOn(retrieval, "createQueryEmbedding").mockResolvedValue(Array(4).fill(0.11));

    mockQueryRawUnsafe.mockImplementation((query: string) => {
      if (typeof query === "string" && query.includes("pg_extension")) {
        return Promise.resolve([{ available: true }]);
      }
      if (typeof query === "string" && query.includes("vector_embedding")) {
        return Promise.resolve([]);
      }
      if (typeof query === "string" && query.includes("similarity(ke.content_text")) {
        return Promise.resolve([]);
      }
      if (typeof query === "string" && query.includes("FROM \"KGEvent\"")) {
        throw new Error("graph query should not run without orgId");
      }
      return Promise.resolve([]);
    });

    const result = await retrieval.unifiedRetrieval("permit");
    expect(result).toEqual([]);
  });

  it("throws when OPENAI_API_KEY is missing for embedding generation", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    await expect(retrieval.createQueryEmbedding("permit")).rejects.toThrow(
      "OPENAI_API_KEY is required for semantic retrieval",
    );

    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });
});
