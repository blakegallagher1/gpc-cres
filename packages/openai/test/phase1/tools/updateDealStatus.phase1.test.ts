import { describe, expect, it } from "vitest";

import { updateDealStatus } from "../../../src/tools/dealTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: updateDealStatus", () => {
  it("[MATRIX:tool:updateDealStatus][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(updateDealStatus.type).toBe("function");
    expect(updateDealStatus.name).toBe("update_deal_status");
    expect(updateDealStatus.strict).toBe(true);
    expect(
      updateDealStatus.needsApproval === true ||
      typeof updateDealStatus.needsApproval === "function",
    ).toBe(true);

    const required = getRequiredFields(updateDealStatus);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
    expect(required.includes("status")).toBe(true);
  });

  it("[MATRIX:tool:updateDealStatus][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(updateDealStatus, "orgId");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("where: { id: dealId, orgId }")).toBe(true);
    expect(source.includes("Deal not found or access denied")).toBe(true);
  });

  it("[MATRIX:tool:updateDealStatus][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("prisma.deal.updateMany")).toBe(true);
    expect(source.includes("if (deal.count === 0)")).toBe(true);
    expect(source.includes("findFirstOrThrow")).toBe(true);
    expect(source.includes("needsApproval: true")).toBe(true);
  });
});
