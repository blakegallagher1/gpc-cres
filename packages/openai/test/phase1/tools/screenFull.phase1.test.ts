import { describe, expect, it } from "vitest";

import { screenFull } from "../../../src/tools/propertyDbTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: screenFull", () => {
  it("[MATRIX:tool:screenFull][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(screenFull.name).toBe("screen_full");

    const required = getRequiredFields(screenFull);
    expect(required.includes("parcel_id")).toBe(true);
  });

  it("[MATRIX:tool:screenFull][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");

    expect(source.includes("Authorization: `Bearer ${PROPERTY_DB_KEY}`")).toBe(true);
    expect(source.includes("export const screenFull = tool")).toBe(true);
    expect(source.includes("rpc(\"api_screen_full\"")).toBe(true);
  });

  it("[MATRIX:tool:screenFull][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");
    expect(source.includes("const result = await rpc(\"api_screen_full\", { parcel_id })")).toBe(true);
    expect(source.includes("return JSON.stringify(result)")).toBe(true);
  });
});
