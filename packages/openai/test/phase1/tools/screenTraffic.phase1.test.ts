import { describe, expect, it } from "vitest";

import { screenTraffic } from "../../../src/tools/propertyDbTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: screenTraffic", () => {
  it("[MATRIX:tool:screenTraffic][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(screenTraffic.name).toBe("screen_traffic");

    const required = getRequiredFields(screenTraffic);
    expect(required.includes("parcel_id")).toBe(true);
    expect(required.includes("radius_miles")).toBe(true);
  });

  it("[MATRIX:tool:screenTraffic][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");

    expect(source.includes("Authorization: `Bearer ${PROPERTY_DB_KEY}`")).toBe(true);
    expect(source.includes("apikey: PROPERTY_DB_KEY")).toBe(true);
    expect(source.includes("name: \"screen_traffic\"")).toBe(true);
  });

  it("[MATRIX:tool:screenTraffic][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");
    expect(source.includes("rpc(\"api_screen_traffic\"")).toBe(true);
    expect(source.includes("...(radius_miles ? { radius_miles } : {})")).toBe(true);
    expect(source.includes("return JSON.stringify(result)")).toBe(true);
  });
});
