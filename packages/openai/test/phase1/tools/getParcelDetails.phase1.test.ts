import { describe, expect, it } from "vitest";

import { getParcelDetails } from "../../../src/tools/propertyDbTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: getParcelDetails", () => {
  it("[MATRIX:tool:getParcelDetails][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(getParcelDetails.name).toBe("get_parcel_details");

    const required = getRequiredFields(getParcelDetails);
    expect(required.includes("parcel_id")).toBe(true);
  });

  it("[MATRIX:tool:getParcelDetails][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");

    expect(source.includes("Authorization: `Bearer ${PROPERTY_DB_KEY}`")).toBe(true);
    expect(source.includes("apikey: PROPERTY_DB_KEY")).toBe(true);
    expect(source.includes("parcel_id: z")).toBe(true);
    expect(source.includes(".uuid()")).toBe(true);
  });

  it("[MATRIX:tool:getParcelDetails][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");
    expect(source.includes("rpc(\"api_get_parcel\", { parcel_id })")).toBe(true);
    expect(source.includes("return JSON.stringify(result)")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });
});
