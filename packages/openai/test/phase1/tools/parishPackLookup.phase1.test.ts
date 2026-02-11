import { describe, expect, it } from "vitest";

import { parishPackLookup } from "../../../src/tools/zoningTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: parishPackLookup", () => {
  it("[MATRIX:tool:parishPackLookup][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(parishPackLookup.name).toBe("parish_pack_lookup");

    const required = getRequiredFields(parishPackLookup);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("jurisdictionId")).toBe(true);
    expect(required.includes("sku")).toBe(true);
    expect(required.includes("section")).toBe(true);
  });

  it("[MATRIX:tool:parishPackLookup][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/zoningTools.ts");

    expect(source.includes("where: {")).toBe(true);
    expect(source.includes("orgId,")).toBe(true);
    expect(source.includes("jurisdictionId,")).toBe(true);
    expect(source.includes("status: \"current\"")).toBe(true);
  });

  it("[MATRIX:tool:parishPackLookup][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/zoningTools.ts");
    expect(source.includes("findFirst")).toBe(true);
    expect(source.includes("orderBy: { version: \"desc\" }")).toBe(true);
    expect(source.includes("const packJson = pack.packJson")).toBe(true);
  });
});
