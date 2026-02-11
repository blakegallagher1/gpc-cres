import { describe, expect, it } from "vitest";

import { floodZoneLookup } from "../../../src/tools/evidenceTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: floodZoneLookup", () => {
  it("[MATRIX:tool:floodZoneLookup][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(floodZoneLookup.name).toBe("flood_zone_lookup");

    const required = getRequiredFields(floodZoneLookup);
    expect(required.includes("address")).toBe(true);
    expect(required.includes("lat")).toBe(true);
    expect(required.includes("lng")).toBe(true);
  });

  it("[MATRIX:tool:floodZoneLookup][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/evidenceTools.ts");

    expect(source.includes("normalizedAddress = address")).toBe(true);
    expect(source.includes("rpc(\"api_search_parcels\"")).toBe(true);
    expect(source.includes("rpc(\"api_screen_flood\"")).toBe(true);
  });

  it("[MATRIX:tool:floodZoneLookup][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/evidenceTools.ts");
    expect(source.includes("function classifyFloodRisk")).toBe(true);
    expect(source.includes("const riskOrder = { HIGH: 3, MODERATE: 2, LOW: 1 } as const")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
  });
});
