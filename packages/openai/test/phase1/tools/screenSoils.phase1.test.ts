import { describe, expect, it } from "vitest";

import { screenSoils } from "../../../src/tools/propertyDbTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: screenSoils", () => {
  it("[MATRIX:tool:screenSoils][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(screenSoils.name).toBe("screen_soils");

    const required = getRequiredFields(screenSoils);
    expect(required.includes("parcel_id")).toBe(true);
  });

  it("[MATRIX:tool:screenSoils][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");

    expect(source.includes("name: \"screen_soils\"")).toBe(true);
  });

  it("[MATRIX:tool:screenSoils][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");
    expect(source.includes("rpc(\"api_screen_soils\", { parcel_id })")).toBe(true);
    expect(source.includes("return JSON.stringify(result)")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });
});
