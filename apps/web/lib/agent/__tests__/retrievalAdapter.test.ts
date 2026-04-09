import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUnifiedRetrieval } = vi.hoisted(() => ({
  mockUnifiedRetrieval: vi.fn(),
}));

vi.mock("@entitlement-os/openai", () => ({
  unifiedRetrieval: mockUnifiedRetrieval,
}));

import { unifiedRetrieval } from "../retrievalAdapter";

beforeEach(() => {
  mockUnifiedRetrieval.mockReset();
});

describe("retrievalAdapter", () => {
  it("delegates retrieval to the package contract", async () => {
    mockUnifiedRetrieval.mockResolvedValue([
      {
        id: "r1",
        source: "sparse",
        text: "permit review note",
        score: 0.88,
        metadata: { lane: "postgres-exact" },
      },
    ]);

    await expect(unifiedRetrieval("permit review", "run-1", "org-1")).resolves.toEqual([
      {
        id: "r1",
        source: "sparse",
        text: "permit review note",
        score: 0.88,
        metadata: { lane: "postgres-exact" },
      },
    ]);
    expect(mockUnifiedRetrieval).toHaveBeenCalledWith("permit review", "run-1", "org-1");
  });

  it("preserves package retrieval failures", async () => {
    mockUnifiedRetrieval.mockRejectedValue(new Error("qdrant unavailable"));

    await expect(unifiedRetrieval("similar parcels", "run-1", "org-1")).rejects.toThrow(
      "qdrant unavailable",
    );
    expect(mockUnifiedRetrieval).toHaveBeenCalledWith("similar parcels", "run-1", "org-1");
  });
});
