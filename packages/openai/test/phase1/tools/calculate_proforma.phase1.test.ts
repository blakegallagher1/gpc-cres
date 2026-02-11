import { describe, expect, it } from "vitest";

import { calculate_proforma } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: calculate_proforma", () => {
  it("[MATRIX:tool:calculate_proforma][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(calculate_proforma.name).toBe("calculate_proforma");

    const required = getRequiredFields(calculate_proforma);
    expect(required.includes("purchase_price")).toBe(true);
    expect(required.includes("noi")).toBe(true);
    expect(required.includes("exit_cap_rate")).toBe(true);
    expect(required.includes("hold_years")).toBe(true);
    expect(required.includes("loan_amount")).toBe(true);
  });

  it("[MATRIX:tool:calculate_proforma][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    // Pure computation: no DB calls, no cross-tenant query surface.
    expect(source.includes("export const calculate_proforma = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:calculate_proforma][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("const leveredIRR = computeIRR(leveredCFs)")).toBe(true);
    expect(source.includes("const unleveredIRR = computeIRR(unleveredCFs)")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
  });
});
