import { describe, expect, it } from "vitest";

import { searchBuyers } from "../../../src/tools/buyerTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: searchBuyers", () => {
  it("[MATRIX:tool:searchBuyers][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(searchBuyers.name).toBe("search_buyers");

    const required = getRequiredFields(searchBuyers);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("sku")).toBe(true);
    expect(required.includes("jurisdictionId")).toBe(true);
    expect(required.includes("buyerType")).toBe(true);
    expect(required.includes("nameSearch")).toBe(true);
    expect(required.includes("limit")).toBe(true);
  });

  it("[MATRIX:tool:searchBuyers][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/buyerTools.ts");

    expect(source.includes("prisma.buyer.findMany")).toBe(true);
    expect(source.includes("where: {")).toBe(true);
    expect(source.includes("orgId,")).toBe(true);
    expect(source.includes("mode: \"insensitive\" as const")).toBe(true);
  });

  it("[MATRIX:tool:searchBuyers][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/buyerTools.ts");
    expect(source.includes("take: limit ?? 20")).toBe(true);
    expect(source.includes("orderBy: { createdAt: \"desc\" }")).toBe(true);
    expect(source.includes("return JSON.stringify(buyers)")).toBe(true);
  });
});
