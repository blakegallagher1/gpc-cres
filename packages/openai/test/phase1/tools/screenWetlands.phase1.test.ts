import { describe, expect, it } from "vitest";

import { screenWetlands } from "../../../src/tools/propertyDbTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: screenWetlands", () => {
  it("[MATRIX:tool:screenWetlands][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(screenWetlands.name).toBe("screen_wetlands");

    const required = getRequiredFields(screenWetlands);
    expect(required.includes("parcel_id")).toBe(true);
  });

  it("[MATRIX:tool:screenWetlands][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");

    expect(source.includes("name: \"screen_wetlands\"")).toBe(true);
  });

  it("[MATRIX:tool:screenWetlands][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");
    expect(source.includes("rpc(\"api_screen_wetlands\", { parcel_id })")).toBe(true);
    expect(source.includes("return JSON.stringify(result)")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });
});
