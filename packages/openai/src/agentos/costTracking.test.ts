import { describe, expect, it } from "vitest";
import { extractUsageSummary } from "./costTracking.js";

describe("cost tracking usage extraction", () => {
  it("extracts tokens from responses-style usage", () => {
    const usage = extractUsageSummary({
      usage: {
        input_tokens: 1200,
        output_tokens: 340,
        total_tokens: 1540,
      },
    });

    expect(usage).toEqual({
      inputTokens: 1200,
      outputTokens: 340,
      totalTokens: 1540,
      estimatedCostUsd: null,
    });
  });
});

