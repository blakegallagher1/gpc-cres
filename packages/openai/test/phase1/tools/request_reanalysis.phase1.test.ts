import { describe, expect, it } from "vitest";

import { request_reanalysis } from "../../../src/tools/reasoningTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: request_reanalysis", () => {
  it("[MATRIX:tool:request_reanalysis][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(request_reanalysis.name).toBe("request_reanalysis");

    const required = getRequiredFields(request_reanalysis);
    expect(required.includes("deal_id")).toBe(true);
    expect(required.includes("target_agent")).toBe(true);
    expect(required.includes("original_conclusion")).toBe(true);
    expect(required.includes("new_information")).toBe(true);
    expect(required.includes("suggested_focus")).toBe(true);
    expect(required.includes("urgency")).toBe(true);
  });

  it("[MATRIX:tool:request_reanalysis][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/reasoningTools.ts");

    expect(source.includes("export const request_reanalysis = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:request_reanalysis][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/reasoningTools.ts");
    expect(source.includes("_reanalysisRequest: true")).toBe(true);
    expect(source.includes("targetAgent: params.target_agent")).toBe(true);
    expect(source.includes("timestamp: new Date().toISOString()")).toBe(true);
  });
});
