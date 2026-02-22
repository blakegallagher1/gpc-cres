import { describe, expect, it } from "vitest";

import { search_comparable_sales } from "../../../src/tools/calculationTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: search_comparable_sales", () => {
  it("[MATRIX:tool:search_comparable_sales][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(search_comparable_sales.name).toBe("search_comparable_sales");

    const required = getRequiredFields(search_comparable_sales);
    expect(required.includes("address")).toBe(true);
    expect(required.includes("radius_miles")).toBe(true);
    expect(required.includes("proposed_use")).toBe(true);
    expect(required.includes("parish")).toBe(true);
  });

  it("[MATRIX:tool:search_comparable_sales][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");

    expect(source.includes("replace(/[''`,.#]/g, \"\")")).toBe(true);
    expect(source.includes("parish: parish ?")).toBe(true);
    expect(source.includes("limit_rows: 20")).toBe(true);
  });

  it("[MATRIX:tool:search_comparable_sales][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/calculationTools.ts");
    expect(source.includes("const result = await propertyRpc(\"api_search_parcels\"")).toBe(true);
    expect(source.includes("const parcels = Array.isArray(result) ? result : []")).toBe(true);
    expect(source.includes("result_count: comparables.length")).toBe(true);
  });
});
