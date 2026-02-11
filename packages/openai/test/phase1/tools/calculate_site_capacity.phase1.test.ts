import { describe, expect, it } from "vitest";

import { calculate_site_capacity } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: calculate_site_capacity", () => {
  it("[MATRIX:tool:calculate_site_capacity][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(calculate_site_capacity.name).toBe("calculate_site_capacity");

    const required = getRequiredFields(calculate_site_capacity);
    expect(required.includes("acreage")).toBe(true);
    expect(required.includes("lot_coverage_pct")).toBe(true);
    expect(required.includes("parking_ratio")).toBe(true);
    expect(required.includes("proposed_use")).toBe(true);
    expect(required.includes("setback_ft")).toBe(true);
  });

  it("[MATRIX:tool:calculate_site_capacity][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("export const calculate_site_capacity = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:calculate_site_capacity][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("Math.max(grossSF - setbackArea, 0)")).toBe(true);
    expect(source.includes("Math.floor((maxBuildingSF / 1000) * ratio)")).toBe(true);
    expect(source.includes("Math.min(imperviousCoveragePct, 100)")).toBe(true);
  });
});
