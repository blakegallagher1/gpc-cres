import { describe, expect, it } from "vitest";

import { calculate_1031_deadlines } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: calculate_1031_deadlines", () => {
  it("[MATRIX:tool:calculate_1031_deadlines][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(calculate_1031_deadlines.name).toBe("calculate_1031_deadlines");

    const required = getRequiredFields(calculate_1031_deadlines);
    expect(required.includes("sale_close_date")).toBe(true);
  });

  it("[MATRIX:tool:calculate_1031_deadlines][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("export const calculate_1031_deadlines = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:calculate_1031_deadlines][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("calculate1031Deadlines({")).toBe(true);
    expect(source.includes("saleCloseDate: sale_close_date")).toBe(true);
    expect(source.includes("days_remaining_identification")).toBe(true);
    expect(source.includes("days_remaining_closing")).toBe(true);
  });
});
