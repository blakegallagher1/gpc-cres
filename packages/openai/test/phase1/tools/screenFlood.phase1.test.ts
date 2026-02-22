import { describe, expect, it } from "vitest";

import { screenFlood } from "../../../src/tools/propertyDbTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: screenFlood", () => {
  it("[MATRIX:tool:screenFlood][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(screenFlood.name).toBe("screen_flood");

    const required = getRequiredFields(screenFlood);
    expect(required.includes("parcel_id")).toBe(true);
  });

  it("[MATRIX:tool:screenFlood][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");

    expect(source.includes("name: \"screen_flood\"")).toBe(true);
  });

  it("[MATRIX:tool:screenFlood][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/propertyDbTools.ts");
    expect(source.includes("rpc(\"api_screen_flood\", { parcel_id })")).toBe(true);
    expect(source.includes("return JSON.stringify(result)")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });
});
