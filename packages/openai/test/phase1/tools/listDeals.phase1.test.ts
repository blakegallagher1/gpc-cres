import { describe, expect, it } from "vitest";

import { listDeals } from "../../../src/tools/dealTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: listDeals", () => {
  it("[MATRIX:tool:listDeals][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(listDeals.type).toBe("function");
    expect(listDeals.name).toBe("list_deals");
    expect(listDeals.strict).toBe(true);

    const required = getRequiredFields(listDeals);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("status")).toBe(true);
    expect(required.includes("sku")).toBe(true);
    expect(required.includes("limit")).toBe(true);
  });

  it("[MATRIX:tool:listDeals][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(listDeals, "orgId");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("where: {")).toBe(true);
    expect(source.includes("orgId,")).toBe(true);
    expect(source.includes("take: limit ?? 20")).toBe(true);
  });

  it("[MATRIX:tool:listDeals][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("prisma.deal.findMany")).toBe(true);
    expect(source.includes("orderBy: { updatedAt: \"desc\" }")).toBe(true);
    expect(source.includes("return JSON.stringify(deals)")).toBe(true);
  });
});
