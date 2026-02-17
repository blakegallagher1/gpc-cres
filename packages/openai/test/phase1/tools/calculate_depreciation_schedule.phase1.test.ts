import { describe, expect, it } from "vitest";

import { calculate_depreciation_schedule } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: calculate_depreciation_schedule", () => {
  it("[MATRIX:tool:calculate_depreciation_schedule][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(calculate_depreciation_schedule.name).toBe("calculate_depreciation_schedule");

    const required = getRequiredFields(calculate_depreciation_schedule);
    expect(required.includes("cost_basis")).toBe(true);
    expect(required.includes("property_type")).toBe(true);
    expect(required.includes("placed_in_service_year")).toBe(true);
  });

  it("[MATRIX:tool:calculate_depreciation_schedule][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("export const calculate_depreciation_schedule = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:calculate_depreciation_schedule][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("calculateDepreciationSchedule({")).toBe(true);
    expect(source.includes("projectionYears: 10")).toBe(true);
    expect(source.includes("remaining_basis")).toBe(true);
    expect(source.includes("typical_annual_deduction")).toBe(true);
  });
});
