import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBuildDataAgentRetrievalContext } = vi.hoisted(() => ({
  mockBuildDataAgentRetrievalContext: vi.fn(),
}));

vi.mock("@entitlement-os/openai", () => ({
  buildDataAgentRetrievalContext: mockBuildDataAgentRetrievalContext,
}));

import { unifiedRetrieval } from "../retrievalAdapter";

beforeEach(() => {
  mockBuildDataAgentRetrievalContext.mockReset();
});

describe("retrievalAdapter", () => {
  it("maps orchestrator results directly", async () => {
    mockBuildDataAgentRetrievalContext.mockResolvedValue({
      query: "permit review",
      subjectId: "run-1",
      generatedAt: new Date().toISOString(),
      sources: {
        semantic: 0,
        sparse: 1,
        graph: 0,
      },
      results: [
        {
          id: "r1",
          source: "sparse",
          text: "permit review note",
          score: 0.88,
          metadata: { lane: "postgres-exact" },
        },
      ],
    });

    await expect(unifiedRetrieval("permit review", "run-1", "org-1")).resolves.toEqual([
      {
        id: "r1",
        source: "sparse",
        text: "permit review note",
        score: 0.88,
        metadata: { lane: "postgres-exact" },
      },
    ]);
  });

  it("does not silently fall back when orchestrated retrieval fails", async () => {
    mockBuildDataAgentRetrievalContext.mockRejectedValue(new Error("qdrant unavailable"));

    await expect(unifiedRetrieval("similar parcels", "run-1", "org-1")).rejects.toThrow(
      "qdrant unavailable",
    );
  });
});
