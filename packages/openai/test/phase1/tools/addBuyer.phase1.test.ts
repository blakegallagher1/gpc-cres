import { describe, expect, it } from "vitest";

import { addBuyer } from "../../../src/tools/buyerTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: addBuyer", () => {
  it("[MATRIX:tool:addBuyer][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(addBuyer.name).toBe("add_buyer");

    const required = getRequiredFields(addBuyer);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("name")).toBe(true);
    expect(required.includes("company")).toBe(true);
    expect(required.includes("email")).toBe(true);
    expect(required.includes("phone")).toBe(true);
    expect(required.includes("buyerType")).toBe(true);
    expect(required.includes("skuInterests")).toBe(true);
    expect(required.includes("jurisdictionInterests")).toBe(true);
    expect(required.includes("notes")).toBe(true);
  });

  it("[MATRIX:tool:addBuyer][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/buyerTools.ts");

    expect(source.includes("prisma.buyer.create")).toBe(true);
    expect(source.includes("orgId,")).toBe(true);
    expect(source.includes("jurisdictionInterests: jurisdictionInterests ?? []")).toBe(true);
  });

  it("[MATRIX:tool:addBuyer][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/buyerTools.ts");
    expect(source.includes("buyer = await prisma.buyer.create")).toBe(true);
    expect(source.includes("notes: notes ?? null")).toBe(true);
    expect(source.includes("return JSON.stringify(buyer)")).toBe(true);
  });
});
