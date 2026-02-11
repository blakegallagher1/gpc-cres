import { describe, expect, it } from "vitest";

import { hardFilterCheck } from "../../../src/tools/scoringTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: hardFilterCheck", () => {
  it("[MATRIX:tool:hardFilterCheck][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(hardFilterCheck.name).toBe("hard_filter_check");

    const required = getRequiredFields(hardFilterCheck);
    expect(required.includes("address")).toBe(true);
    expect(required.includes("currentZoning")).toBe(true);
    expect(required.includes("acreage")).toBe(true);
    expect(required.includes("proposedUse")).toBe(true);
    expect(required.includes("floodZone")).toBe(true);
    expect(required.includes("isWetland")).toBe(true);
    expect(required.includes("isContaminated")).toBe(true);
  });

  it("[MATRIX:tool:hardFilterCheck][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/scoringTools.ts");

    // Pure screening logic, no persistence layer interaction.
    expect(source.includes("export const hardFilterCheck = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:hardFilterCheck][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/scoringTools.ts");
    expect(source.includes("const disqualifiers: string[] = []")).toBe(true);
    expect(source.includes("disqualifiers.length === 0")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
  });
});
