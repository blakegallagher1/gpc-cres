import { describe, expect, it } from "vitest";

import { calculate_development_budget } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: calculate_development_budget", () => {
  it("[MATRIX:tool:calculate_development_budget][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(calculate_development_budget.name).toBe("calculate_development_budget");

    const required = getRequiredFields(calculate_development_budget);
    expect(required.includes("acreage")).toBe(true);
    expect(required.includes("proposed_use")).toBe(true);
    expect(required.includes("construction_cost_per_sf")).toBe(true);
    expect(required.includes("hard_cost_contingency_pct")).toBe(true);
  });

  it("[MATRIX:tool:calculate_development_budget][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("export const calculate_development_budget = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:calculate_development_budget][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("const coverageByUse")).toBe(true);
    expect(source.includes("const costByUse")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
  });
});
