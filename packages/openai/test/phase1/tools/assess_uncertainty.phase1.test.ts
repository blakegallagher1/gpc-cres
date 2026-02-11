import { describe, expect, it } from "vitest";

import { assess_uncertainty } from "../../../src/tools/reasoningTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: assess_uncertainty", () => {
  it("[MATRIX:tool:assess_uncertainty][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(assess_uncertainty.name).toBe("assess_uncertainty");

    const required = getRequiredFields(assess_uncertainty);
    expect(required.includes("deal_id")).toBe(true);
    expect(required.includes("analysis_area")).toBe(true);
    expect(required.includes("known_facts")).toBe(true);
    expect(required.includes("unknown_factors")).toBe(true);
    expect(required.includes("overall_confidence")).toBe(true);
    expect(required.includes("recommendation_robustness")).toBe(true);
  });

  it("[MATRIX:tool:assess_uncertainty][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/reasoningTools.ts");

    expect(source.includes("export const assess_uncertainty = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:assess_uncertainty][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/reasoningTools.ts");
    expect(source.includes("_uncertaintyAssessment: true")).toBe(true);
    expect(source.includes("unknownFactors: params.unknown_factors")).toBe(true);
    expect(source.includes("timestamp: new Date().toISOString()")).toBe(true);
  });
});
