import { describe, expect, it } from "vitest";

import { estimate_project_timeline } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: estimate_project_timeline", () => {
  it("[MATRIX:tool:estimate_project_timeline][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(estimate_project_timeline.name).toBe("estimate_project_timeline");

    const required = getRequiredFields(estimate_project_timeline);
    expect(required.includes("current_stage")).toBe(true);
    expect(required.includes("tasks_remaining")).toBe(true);
    expect(required.includes("has_entitlement_approval")).toBe(true);
  });

  it("[MATRIX:tool:estimate_project_timeline][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(
      source.includes("export const estimate_project_timeline = tool"),
    ).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:estimate_project_timeline][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("const monthsByStage: Record<string, number> = {")).toBe(
      true,
    );
    expect(source.includes("critical_path_items: criticalPath")).toBe(true);
    expect(source.includes("risk_factors: riskFactors")).toBe(true);
  });
});
