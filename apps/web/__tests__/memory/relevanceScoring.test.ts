import { describe, expect, it } from "vitest";

import { computeRelevanceScore, rankMemories } from "@/lib/services/relevanceScoring";

describe("relevanceScoring", () => {
  it("computeRelevanceScore returns product of components", () => {
    const score = computeRelevanceScore({
      similarity: 1.0,
      ageInDays: 0,
      sourceWeight: 1.0,
      economicWeight: 1.0,
      volatilityClass: "stable",
    });

    expect(score).toBeCloseTo(1.0, 6);
  });

  it("computeRelevanceScore applies exponential decay for old stable records", () => {
    const score = computeRelevanceScore({
      similarity: 1.0,
      ageInDays: 730,
      sourceWeight: 1.0,
      economicWeight: 1.0,
      volatilityClass: "stable",
    });

    expect(score).toBeCloseTo(0.5, 3);
  });

  it("rankMemories returns topK sorted by score descending", () => {
    const items = [
      {
        record: { id: "item_a" },
        similarity: 0.9,
        ageInDays: 0,
        sourceWeight: 1,
        economicWeight: 1,
        volatilityClass: "stable",
      },
      {
        record: { id: "item_b" },
        similarity: 0.3,
        ageInDays: 0,
        sourceWeight: 1,
        economicWeight: 1,
        volatilityClass: "stable",
      },
      {
        record: { id: "item_c" },
        similarity: 0.6,
        ageInDays: 0,
        sourceWeight: 1,
        economicWeight: 1,
        volatilityClass: "stable",
      },
    ];

    const ranked = rankMemories(items, 2);

    expect(ranked).toHaveLength(2);
    expect(ranked[0].record.id).toBe("item_a");
    expect(ranked[1].record.id).toBe("item_c");
  });

  it("rankMemories with high_volatility class decays faster than stable", () => {
    const items = [
      {
        record: { id: "stable" },
        similarity: 1,
        ageInDays: 180,
        sourceWeight: 1,
        economicWeight: 1,
        volatilityClass: "stable",
      },
      {
        record: { id: "high" },
        similarity: 1,
        ageInDays: 180,
        sourceWeight: 1,
        economicWeight: 1,
        volatilityClass: "high_volatility",
      },
    ];

    const ranked = rankMemories(items, 2);

    expect(ranked).toHaveLength(2);
    expect(ranked[0].record.id).toBe("stable");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});
