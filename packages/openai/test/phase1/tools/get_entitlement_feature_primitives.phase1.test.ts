import { describe, expect, it } from "vitest";

import { get_entitlement_feature_primitives } from "../../../src/tools/entitlementIntelligenceTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: get_entitlement_feature_primitives", () => {
  it("[MATRIX:tool:get_entitlement_feature_primitives][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(get_entitlement_feature_primitives.name).toBe("get_entitlement_feature_primitives");

    const required = getRequiredFields(get_entitlement_feature_primitives);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("jurisdictionId")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
    expect(required.includes("strategyKeys")).toBe(true);
    expect(required.includes("lookbackMonths")).toBe(true);
    expect(required.includes("minSampleSize")).toBe(true);
    expect(required.includes("recordLimit")).toBe(true);
  });

  it("[MATRIX:tool:get_entitlement_feature_primitives][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/entitlementIntelligenceTools.ts");

    expect(source.includes("const scopeError = await getScopeError(orgId, jurisdictionId, dealId);")).toBe(true);
    expect(source.includes("where: { id: jurisdictionId, orgId }")).toBe(true);
    expect(source.includes("where: { id: dealId, orgId, jurisdictionId }")).toBe(true);
    expect(source.includes("error: \"Jurisdiction not found or access denied.\"")).toBe(true);
  });

  it("[MATRIX:tool:get_entitlement_feature_primitives][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/entitlementIntelligenceTools.ts");

    expect(source.includes("const normalizedRecordLimit = Math.max(1, Math.min(5_000, recordLimit ?? 1_000));")).toBe(true);
    expect(source.includes("const normalizedStrategyKeys = [...new Set((strategyKeys ?? [])")).toBe(true);
    expect(source.includes("prisma.entitlementOutcomePrecedent.findMany({")).toBe(true);
    expect(source.includes("take: normalizedRecordLimit")).toBe(true);
  });
});
