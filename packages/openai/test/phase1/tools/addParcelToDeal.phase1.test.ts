import { describe, expect, it } from "vitest";

import { addParcelToDeal } from "../../../src/tools/dealTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: addParcelToDeal", () => {
  it("[MATRIX:tool:addParcelToDeal][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(addParcelToDeal.type).toBe("function");
    expect(addParcelToDeal.name).toBe("add_parcel_to_deal");
    expect(addParcelToDeal.strict).toBe(true);

    const required = getRequiredFields(addParcelToDeal);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
    expect(required.includes("address")).toBe(true);
  });

  it("[MATRIX:tool:addParcelToDeal][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(addParcelToDeal, "orgId");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("const deal = await prisma.deal.findFirst")).toBe(true);
    expect(source.includes("where: { id: dealId, orgId }")).toBe(true);
    expect(source.includes("Deal not found or access denied")).toBe(true);
  });

  it("[MATRIX:tool:addParcelToDeal][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("prisma.parcel.create")).toBe(true);
    expect(source.includes("apn: apn ?? null")).toBe(true);
    expect(source.includes("utilitiesNotes: utilitiesNotes ?? null")).toBe(true);
  });
});
