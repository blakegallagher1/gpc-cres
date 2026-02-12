import { describe, expect, it } from "vitest";

import { predict_entitlement_path } from "../../../src/tools/entitlementIntelligenceTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: predict_entitlement_path", () => {
  it("[MATRIX:tool:predict_entitlement_path][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(predict_entitlement_path.name).toBe("predict_entitlement_path");

    const required = getRequiredFields(predict_entitlement_path);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("jurisdictionId")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
    expect(required.includes("lookbackMonths")).toBe(true);
    expect(required.includes("minSampleSize")).toBe(true);
    expect(required.includes("persistSnapshot")).toBe(true);
  });

  it("[MATRIX:tool:predict_entitlement_path][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/entitlementIntelligenceTools.ts");

    expect(source.includes("where: { id: jurisdictionId, orgId }")).toBe(true);
    expect(source.includes("where: { id: dealId, orgId, jurisdictionId }")).toBe(true);
    expect(source.includes("error: \"Jurisdiction not found or access denied.\"")).toBe(true);
    expect(source.includes("error: \"Deal not found or out of scope for this jurisdiction.\"")).toBe(true);
  });

  it("[MATRIX:tool:predict_entitlement_path][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/entitlementIntelligenceTools.ts");

    expect(source.includes("const inputHash = hashJsonSha256({")).toBe(true);
    expect(source.includes("orgId_jurisdictionId_strategyKey_inputHash")).toBe(true);
    expect(source.includes("prisma.entitlementPredictionSnapshot.upsert")).toBe(true);
  });
});
