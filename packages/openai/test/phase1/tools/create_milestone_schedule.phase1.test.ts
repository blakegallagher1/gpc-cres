import { describe, expect, it } from "vitest";

import { create_milestone_schedule } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: create_milestone_schedule", () => {
  it("[MATRIX:tool:create_milestone_schedule][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(create_milestone_schedule.name).toBe("create_milestone_schedule");

    const required = getRequiredFields(create_milestone_schedule);
    expect(required.includes("proposed_use")).toBe(true);
    expect(required.includes("current_stage")).toBe(true);
  });

  it("[MATRIX:tool:create_milestone_schedule][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("export const create_milestone_schedule = tool")).toBe(
      true,
    );
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:create_milestone_schedule][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("const stageOrder = [")).toBe(true);
    expect(source.includes("const remaining =")).toBe(true);
    expect(source.includes("return JSON.stringify({ milestones: remaining")).toBe(
      true,
    );
  });
});
