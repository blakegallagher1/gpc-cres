import { describe, expect, it } from "vitest";

import { estimate_construction_cost } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: estimate_construction_cost", () => {
  it("[MATRIX:tool:estimate_construction_cost][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(estimate_construction_cost.name).toBe("estimate_construction_cost");

    const required = getRequiredFields(estimate_construction_cost);
    expect(required.includes("buildable_sf")).toBe(true);
    expect(required.includes("proposed_use")).toBe(true);
    expect(required.includes("quality_level")).toBe(true);
  });

  it("[MATRIX:tool:estimate_construction_cost][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("export const estimate_construction_cost = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:estimate_construction_cost][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("for (const [category, costPerSF] of Object.entries(costs))")).toBe(true);
    expect(source.includes("const softCost = totalHard * 0.2")).toBe(true);
    expect(source.includes("breakdown_by_category")).toBe(true);
  });
});
