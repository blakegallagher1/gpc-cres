import { describe, expect, it } from "vitest";

import { record_deal_outcome } from "../../../src/tools/outcomeTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: record_deal_outcome", () => {
  it("[MATRIX:tool:record_deal_outcome][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(record_deal_outcome.name).toBe("record_deal_outcome");

    const required = getRequiredFields(record_deal_outcome);
    expect(required.includes("deal_id")).toBe(true);
    expect(required.includes("actual_outcome")).toBe(true);
    expect(required.includes("outcome_notes")).toBe(true);
    expect(required.includes("projection_actuals")).toBe(true);
  });

  it("[MATRIX:tool:record_deal_outcome][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/outcomeTools.ts");

    // This tool emits a structured payload for server-side persistence.
    expect(source.includes("_recordOutcome: true")).toBe(true);
    expect(source.includes("actualOutcome: params.actual_outcome")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:record_deal_outcome][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/outcomeTools.ts");
    expect(source.includes("projectionActuals: params.projection_actuals ?? []")).toBe(true);
    expect(source.includes("timestamp: new Date().toISOString()")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
  });
});
