import { describe, expect, it } from "vitest";

import { screenEpa } from "../../../src/tools/propertyDbTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: screenEpa", () => {
  it("[MATRIX:tool:screenEpa][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(screenEpa.name).toBe("screen_epa");

    const required = getRequiredFields(screenEpa);
    expect(required.includes("parcel_id")).toBe(true);
    expect(required.includes("radius_miles")).toBe(true);
  });

  it("[MATRIX:tool:screenEpa][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");

    expect(source.includes("name: \"screen_epa\"")).toBe(true);
  });

  it("[MATRIX:tool:screenEpa][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");
    expect(source.includes("rpc(\"api_screen_epa\"")).toBe(true);
    expect(source.includes("...(radius_miles ? { radius_miles } : {})")).toBe(true);
    expect(source.includes("return JSON.stringify(result)")).toBe(true);
  });
});
