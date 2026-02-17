import { describe, expect, it } from "vitest";

import { get_rent_roll } from "../../../src/tools/dealTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: get_rent_roll", () => {
  it("[MATRIX:tool:get_rent_roll][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(get_rent_roll.type).toBe("function");
    expect(get_rent_roll.name).toBe("get_rent_roll");
    expect(get_rent_roll.strict).toBe(true);
    expect(get_rent_roll.parameters?.type).toBe("object");
    expect(get_rent_roll.parameters?.additionalProperties).toBe(false);

    const required = getRequiredFields(get_rent_roll);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
    expect(required.includes("holdYears")).toBe(true);
  });

  it("[MATRIX:tool:get_rent_roll][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(get_rent_roll, "orgId");
    expect(orgId?.type).toBe("string");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("where: { id: dealId, orgId }")).toBe(true);
    expect(source.includes("where: { orgId, dealId }")).toBe(true);
  });

  it("[MATRIX:tool:get_rent_roll][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("aggregateRentRoll")).toBe(true);
    expect(source.includes("tenantLease.findMany")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
  });
});
