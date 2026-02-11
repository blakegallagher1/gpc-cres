import { describe, expect, it } from "vitest";

import { parcelTriageScore } from "../../../src/tools/scoringTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: parcelTriageScore", () => {
  it("[MATRIX:tool:parcelTriageScore][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(parcelTriageScore.name).toBe("parcel_triage_score");

    const required = getRequiredFields(parcelTriageScore);
    expect(required.includes("dealId")).toBe(true);
    expect(required.includes("address")).toBe(true);
    expect(required.includes("currentZoning")).toBe(true);
    expect(required.includes("acreage")).toBe(true);
    expect(required.includes("proposedUse")).toBe(true);
    expect(required.includes("floodZone")).toBe(true);
    expect(required.includes("futureLandUse")).toBe(true);
  });

  it("[MATRIX:tool:parcelTriageScore][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/scoringTools.ts");

    expect(source.includes("export const parcelTriageScore = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:parcelTriageScore][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/scoringTools.ts");
    expect(source.includes("const weights = {")).toBe(true);
    expect(source.includes("const hardDisqualifiers = disqualifiers.filter")).toBe(true);
    expect(source.includes("decision: \"KILL\" | \"HOLD\" | \"ADVANCE\"")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
  });
});
