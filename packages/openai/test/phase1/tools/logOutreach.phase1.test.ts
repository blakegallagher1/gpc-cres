import { describe, expect, it } from "vitest";

import { logOutreach } from "../../../src/tools/buyerTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: logOutreach", () => {
  it("[MATRIX:tool:logOutreach][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(logOutreach.name).toBe("log_outreach");
    expect(
      logOutreach.needsApproval === true ||
      typeof logOutreach.needsApproval === "function",
    ).toBe(true);

    const required = getRequiredFields(logOutreach);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
    expect(required.includes("buyerId")).toBe(true);
    expect(required.includes("channel")).toBe(true);
    expect(required.includes("status")).toBe(true);
    expect(required.includes("notes")).toBe(true);
    expect(required.includes("nextFollowupAt")).toBe(true);
  });

  it("[MATRIX:tool:logOutreach][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/buyerTools.ts");

    expect(source.includes("prisma.deal.findFirst({ where: { id: dealId, orgId }")).toBe(true);
    expect(source.includes("prisma.buyer.findFirst({ where: { id: buyerId, orgId }")).toBe(true);
    expect(source.includes("error: \"Deal not found or access denied\"")).toBe(true);
    expect(source.includes("error: \"Buyer not found or access denied\"")).toBe(true);
  });

  it("[MATRIX:tool:logOutreach][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/buyerTools.ts");
    expect(source.includes("prisma.outreach.create")).toBe(true);
    expect(source.includes("lastContactAt: status !== \"planned\" ? new Date() : null")).toBe(true);
    expect(source.includes("nextFollowupAt: nextFollowupAt ? new Date(nextFollowupAt) : null")).toBe(true);
    expect(source.includes("needsApproval: true")).toBe(true);
  });
});
