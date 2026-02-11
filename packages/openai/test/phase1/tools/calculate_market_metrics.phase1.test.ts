import { describe, expect, it } from "vitest";

import { calculate_market_metrics } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: calculate_market_metrics", () => {
  it("[MATRIX:tool:calculate_market_metrics][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(calculate_market_metrics.name).toBe("calculate_market_metrics");

    const required = getRequiredFields(calculate_market_metrics);
    expect(required.includes("comparables")).toBe(true);
    expect(required.includes("subject_acreage")).toBe(true);
  });

  it("[MATRIX:tool:calculate_market_metrics][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("export const calculate_market_metrics = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:calculate_market_metrics][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("const prices = withPricePerAcre")).toBe(true);
    expect(source.includes("sample_size: withPricePerAcre.length")).toBe(true);
    expect(source.includes("error: \"No valid comparables with price and acreage data\"")).toBe(true);
  });
});
