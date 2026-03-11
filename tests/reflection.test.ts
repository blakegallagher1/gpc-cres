/**
 * Unit tests for reflection and memory update pipeline.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEmbeddingCreate,
  mockKGEventCreate,
  mockKGEventFindFirst,
  mockTemporalEdgeCreate,
  mockKnowledgeExecuteRaw,
  mockOpenAIEmbeddingCreate,
} = vi.hoisted(() => ({
  mockEmbeddingCreate: vi.fn(),
  mockKGEventCreate: vi.fn(),
  mockKGEventFindFirst: vi.fn(),
  mockTemporalEdgeCreate: vi.fn(),
  mockKnowledgeExecuteRaw: vi.fn(),
  mockOpenAIEmbeddingCreate: vi
    .fn()
    .mockResolvedValue({ data: [{ embedding: [0.01, 0.02, 0.03] }] }),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    knowledgeEmbedding: {
      create: mockEmbeddingCreate,
      deleteMany: vi.fn(),
    },
    kGEvent: {
      create: mockKGEventCreate,
      findFirst: mockKGEventFindFirst,
    },
    temporalEdge: {
      create: mockTemporalEdgeCreate,
    },
    $queryRawUnsafe: mockKnowledgeExecuteRaw,
  },
}));

vi.mock("node:module", () => ({
  createRequire: () => (moduleName: string) => {
    if (moduleName !== "openai") {
      throw new Error(`Unexpected module request: ${moduleName}`);
    }

    return {
      default: class OpenAI {
        public embeddings = {
          create: mockOpenAIEmbeddingCreate,
        };

        constructor(_options: unknown) {}
      },
    };
  },
}));

vi.mock("../openTelemetry/setup.ts", () => ({
  withSpan: async (_name: string, fn: () => Promise<unknown> | unknown) => fn(),
}));

import { reflectAndUpdateMemory } from "../services/reflection.service.ts";

const originalOpenAIKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-openai-key";
  mockEmbeddingCreate.mockReset();
  mockKGEventCreate.mockReset();
  mockKGEventFindFirst.mockReset();
  mockTemporalEdgeCreate.mockReset();
  mockKnowledgeExecuteRaw.mockReset();
  mockOpenAIEmbeddingCreate.mockReset();
  mockOpenAIEmbeddingCreate.mockResolvedValue({ data: [{ embedding: [0.01, 0.02, 0.03] }] });
});

afterAll(() => {
  if (typeof originalOpenAIKey === "string") {
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    return;
  }
  delete process.env.OPENAI_API_KEY;
});

describe("reflection.service", () => {
  it("persists embedding and graph data for high-confidence episodes", async () => {
    mockEmbeddingCreate.mockResolvedValue({ id: "ke-1", sourceId: "ep-1" });
    mockKGEventCreate.mockResolvedValue({ id: "e1" });
    mockKnowledgeExecuteRaw.mockResolvedValue({ count: 1 });

    const episode = {
      id: "ep-1",
      runId: "run-1",
      createdAt: new Date().toISOString(),
      agentIntent: "evaluate zoning case",
      evidenceHash: "hash-1",
      retrievalMeta: {},
      modelOutputs: {
        knowledgeTriples: [
          { subjectId: "subject-1", predicate: "implies", objectId: "permit-granted" },
        ],
      },
      confidence: 0.82,
      outcomeSignal: null,
      nextStateHash: null,
      summary: "Permit was granted",
    };

    const result = await reflectAndUpdateMemory(episode);

    expect(mockEmbeddingCreate).toHaveBeenCalledTimes(1);
    expect(mockKGEventCreate).toHaveBeenCalledTimes(1);
    expect(result.graphEventsCreated).toBe(1);
    expect(result.temporalEdgesCreated).toBe(0);
    expect(result.lowConfidenceTicketCreated).toBe(false);
  });

  it("creates a low-confidence review ticket", async () => {
    mockEmbeddingCreate.mockResolvedValue({ id: "ke-2", sourceId: "ep-2" });
    mockKGEventCreate.mockResolvedValue({ id: "e2" });
    mockKnowledgeExecuteRaw.mockResolvedValue({ count: 1 });

    const episode = {
      id: "ep-2",
      runId: "run-2",
      createdAt: new Date().toISOString(),
      agentIntent: "analyze permit",
      evidenceHash: "hash-2",
      retrievalMeta: {},
      modelOutputs: {},
      confidence: 0.22,
      outcomeSignal: null,
      nextStateHash: null,
      summary: "Need review",
    };

    const result = await reflectAndUpdateMemory(episode as never);

    expect(mockKGEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          predicate: "LOW_CONFIDENCE_TICKET",
        }),
      }),
    );
    expect(result.lowConfidenceTicketCreated).toBe(true);
  });
});
