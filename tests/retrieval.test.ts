/**
 * Unit tests for the retrieval service wrapper.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBuildDataAgentRetrievalContext } = vi.hoisted(() => ({
  mockBuildDataAgentRetrievalContext: vi.fn(),
}));

vi.mock("@entitlement-os/openai", () => ({
  buildDataAgentRetrievalContext: mockBuildDataAgentRetrievalContext,
}));

import * as retrieval from "../services/retrieval.service.ts";

beforeEach(() => {
  vi.restoreAllMocks();
  mockBuildDataAgentRetrievalContext.mockReset();
});

describe("retrieval.service", () => {
  it("maps orchestrated retrieval results into the legacy record shape", async () => {
    mockBuildDataAgentRetrievalContext.mockResolvedValue({
      query: "permit review",
      subjectId: "run-1",
      generatedAt: new Date().toISOString(),
      sources: {
        semantic: 1,
        sparse: 1,
        graph: 1,
      },
      results: [
        {
          id: "k1",
          source: "sparse",
          text: "permit review note",
          score: 0.91,
          metadata: {
            subjectId: "run-1",
            retrieval: {
              sparseScore: 0.91,
              semanticScore: 0.22,
              graphScore: 0,
              recencyScore: 0.73,
            },
          },
        },
      ],
    });

    const result = await retrieval.unifiedRetrieval("permit review", "run-1", "org-1");

    expect(mockBuildDataAgentRetrievalContext).toHaveBeenCalledWith("permit review", "run-1", {
      orgId: "org-1",
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "k1",
        source: "sparse",
        text: "permit review note",
        confidence: 0.91,
        sparseScore: 0.91,
        semanticScore: 0.22,
        recencyScore: 0.73,
        subjectId: "run-1",
      }),
    ]);
  });

  it("requires non-empty query", async () => {
    await expect(retrieval.unifiedRetrieval("   ")).rejects.toThrow("query is required");
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
