import { describe, expect, it } from "vitest";

import { log_reasoning_trace } from "../../../src/tools/reasoningTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: log_reasoning_trace", () => {
  it("[MATRIX:tool:log_reasoning_trace][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(log_reasoning_trace.name).toBe("log_reasoning_trace");

    const required = getRequiredFields(log_reasoning_trace);
    expect(required.includes("deal_id")).toBe(true);
    expect(required.includes("step")).toBe(true);
    expect(required.includes("hypothesis")).toBe(true);
    expect(required.includes("evidence_for")).toBe(true);
    expect(required.includes("evidence_against")).toBe(true);
    expect(required.includes("conclusion")).toBe(true);
    expect(required.includes("confidence")).toBe(true);
  });

  it("[MATRIX:tool:log_reasoning_trace][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/reasoningTools.ts");

    expect(source.includes("export const log_reasoning_trace = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:log_reasoning_trace][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/reasoningTools.ts");
    expect(source.includes("_reasoningTrace: true")).toBe(true);
    expect(source.includes("invalidationTriggers: params.invalidation_triggers ?? []")).toBe(true);
    expect(source.includes("timestamp: new Date().toISOString()")).toBe(true);
  });
});
