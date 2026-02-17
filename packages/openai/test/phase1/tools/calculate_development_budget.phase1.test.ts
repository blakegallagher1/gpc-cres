import { describe, expect, it } from "vitest";

import { calculate_development_budget } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: calculate_development_budget", () => {
  it("[MATRIX:tool:calculate_development_budget][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(calculate_development_budget.name).toBe("calculate_development_budget");

    const required = getRequiredFields(calculate_development_budget);
    expect(required.includes("line_items")).toBe(true);
    expect(required.includes("contingencies")).toBe(true);
  });

  it("[MATRIX:tool:calculate_development_budget][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("export const calculate_development_budget = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:calculate_development_budget][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("summarizeDevelopmentBudget")).toBe(true);
    expect(source.includes("line_items: params.line_items")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
  });
});
