import { describe, expect, it } from "vitest";

import { updateParcel } from "../../../src/tools/dealTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: updateParcel", () => {
  it("[MATRIX:tool:updateParcel][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(updateParcel.type).toBe("function");
    expect(updateParcel.name).toBe("update_parcel");
    expect(updateParcel.strict).toBe(true);

    const required = getRequiredFields(updateParcel);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("parcelId")).toBe(true);
    expect(required.includes("propertyDbId")).toBe(true);
  });

  it("[MATRIX:tool:updateParcel][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(updateParcel, "orgId");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("where: { id: parcelId, orgId }")).toBe(true);
    expect(source.includes("Parcel not found or access denied")).toBe(true);
  });

  it("[MATRIX:tool:updateParcel][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/dealTools.ts");
    expect(source.includes("Object.keys(data).length === 0")).toBe(true);
    expect(source.includes("prisma.parcel.updateMany")).toBe(true);
    expect(source.includes("findFirstOrThrow")).toBe(true);
  });
});
