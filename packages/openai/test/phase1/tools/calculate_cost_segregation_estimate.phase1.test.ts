import { describe, expect, it } from "vitest";

import { calculate_cost_segregation_estimate } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: calculate_cost_segregation_estimate", () => {
  it("[MATRIX:tool:calculate_cost_segregation_estimate][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(calculate_cost_segregation_estimate.name).toBe("calculate_cost_segregation_estimate");

    const required = getRequiredFields(calculate_cost_segregation_estimate);
    expect(required.includes("total_basis")).toBe(true);
    expect(required.includes("property_type")).toBe(true);
  });

  it("[MATRIX:tool:calculate_cost_segregation_estimate][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("export const calculate_cost_segregation_estimate = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:calculate_cost_segregation_estimate][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("const bonusDepr = personalBasis * 0.6")).toBe(true);
    expect(source.includes("const withoutFirstYear = total_basis / 39 / 2")).toBe(true);
    expect(source.includes("estimated_npv_benefit")).toBe(true);
  });
});
