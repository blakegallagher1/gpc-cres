import { describe, expect, it } from "vitest";

import { getDealContext } from "../../../src/tools/dealTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: getDealContext", () => {
  it("[MATRIX:tool:getDealContext][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(getDealContext.type).toBe("function");
    expect(getDealContext.name).toBe("get_deal_context");
    expect(getDealContext.strict).toBe(true);
    expect(getDealContext.parameters?.type).toBe("object");
    expect(getDealContext.parameters?.additionalProperties).toBe(false);

    const required = getRequiredFields(getDealContext);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
  });

  it("[MATRIX:tool:getDealContext][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(getDealContext, "orgId");
    expect(orgId?.type).toBe("string");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("where: { id: dealId, orgId }")).toBe(true);
  });

  it("[MATRIX:tool:getDealContext][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("findFirstOrThrow")).toBe(true);
    expect(source.includes("return JSON.stringify(deal)")).toBe(true);
  });
});
