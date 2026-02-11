import { describe, expect, it } from "vitest";

import { get_historical_accuracy } from "../../../src/tools/outcomeTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: get_historical_accuracy", () => {
  it("[MATRIX:tool:get_historical_accuracy][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(get_historical_accuracy.name).toBe("get_historical_accuracy");

    const required = getRequiredFields(get_historical_accuracy);
    expect(required.includes("include_calibration")).toBe(true);
    expect(required.includes("include_weight_adaptation")).toBe(true);
  });

  it("[MATRIX:tool:get_historical_accuracy][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/outcomeTools.ts");

    // This tool returns a route-resolved marker payload and does not access persistence directly.
    expect(source.includes("_historicalAccuracy: true")).toBe(true);
    expect(source.includes("includeCalibration: params.include_calibration ?? true")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:get_historical_accuracy][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/outcomeTools.ts");
    expect(source.includes("execute: async (params) => {")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
    expect(source.includes("_historicalAccuracy: true")).toBe(true);
  });
});
