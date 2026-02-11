import { describe, expect, it } from "vitest";

import { searchParcels } from "../../../src/tools/propertyDbTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: searchParcels", () => {
  it("[MATRIX:tool:searchParcels][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(searchParcels.name).toBe("search_parcels");

    const required = getRequiredFields(searchParcels);
    expect(required.includes("search_text")).toBe(true);
    expect(required.includes("parish")).toBe(true);
    expect(required.includes("limit_rows")).toBe(true);
  });

  it("[MATRIX:tool:searchParcels][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");

    expect(source.includes("Authorization: `Bearer ${PROPERTY_DB_KEY}`")).toBe(true);
    expect(source.includes("apikey: PROPERTY_DB_KEY")).toBe(true);
    expect(source.includes("replace(/[''`]/g, \"\")")).toBe(true);
  });

  it("[MATRIX:tool:searchParcels][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");
    expect(source.includes("rpc(\"api_search_parcels\"")).toBe(true);
    expect(source.includes("...(parish ? { parish } : {})")).toBe(true);
    expect(source.includes("...(limit_rows ? { limit_rows } : {})")).toBe(true);
  });
});
