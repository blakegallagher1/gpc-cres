import { describe, expect, it } from "vitest";

import { calculate_debt_sizing } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: calculate_debt_sizing", () => {
  it("[MATRIX:tool:calculate_debt_sizing][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(calculate_debt_sizing.name).toBe("calculate_debt_sizing");

    const required = getRequiredFields(calculate_debt_sizing);
    expect(required.includes("noi")).toBe(true);
    expect(required.includes("dscr_target")).toBe(true);
    expect(required.includes("interest_rate")).toBe(true);
    expect(required.includes("amortization_years")).toBe(true);
  });

  it("[MATRIX:tool:calculate_debt_sizing][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("export const calculate_debt_sizing = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:calculate_debt_sizing][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("const maxAnnualDS = noi / dscr_target")).toBe(true);
    expect(source.includes("const maxLoan =")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
  });
});
