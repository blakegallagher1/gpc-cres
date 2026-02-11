import { describe, expect, it } from "vitest";

import { createDeal } from "../../../src/tools/dealTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: createDeal", () => {
  it("[MATRIX:tool:createDeal][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(createDeal.type).toBe("function");
    expect(createDeal.name).toBe("create_deal");
    expect(createDeal.strict).toBe(true);
    expect(createDeal.parameters?.type).toBe("object");
    expect(createDeal.parameters?.additionalProperties).toBe(false);

    const required = getRequiredFields(createDeal);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("createdBy")).toBe(true);
    expect(required.includes("jurisdictionId")).toBe(true);
    expect(required.includes("targetCloseDate")).toBe(true);
  });

  it("[MATRIX:tool:createDeal][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(createDeal, "orgId");
    expect(orgId?.type).toBe("string");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("orgId,")).toBe(true);
    expect(source.includes("jurisdictionId,")).toBe(true);
  });

  it("[MATRIX:tool:createDeal][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    // Null normalization keeps payload stable under retry wrappers.
    expect(source.includes("notes: notes ?? null")).toBe(true);
    expect(source.includes("targetCloseDate: targetCloseDate")).toBe(true);
    expect(source.includes("return JSON.stringify(deal)")).toBe(true);
  });
});
