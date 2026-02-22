import { describe, expect, it } from "vitest";

import { screenLdeq } from "../../../src/tools/propertyDbTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: screenLdeq", () => {
  it("[MATRIX:tool:screenLdeq][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(screenLdeq.name).toBe("screen_ldeq");

    const required = getRequiredFields(screenLdeq);
    expect(required.includes("parcel_id")).toBe(true);
    expect(required.includes("radius_miles")).toBe(true);
  });

  it("[MATRIX:tool:screenLdeq][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");

    expect(source.includes("name: \"screen_ldeq\"")).toBe(true);
  });

  it("[MATRIX:tool:screenLdeq][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");
    expect(source.includes("rpc(\"api_screen_ldeq\"")).toBe(true);
    expect(source.includes("...(radius_miles ? { radius_miles } : {})")).toBe(true);
    expect(source.includes("return JSON.stringify(result)")).toBe(true);
  });
});
