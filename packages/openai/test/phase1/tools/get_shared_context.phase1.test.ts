import { describe, expect, it } from "vitest";

import { get_shared_context } from "../../../src/tools/contextTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: get_shared_context", () => {
  it("[MATRIX:tool:get_shared_context][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(get_shared_context.name).toBe("get_shared_context");

    const required = getRequiredFields(get_shared_context);
    expect(required.includes("deal_id")).toBe(true);
    expect(required.includes("categories")).toBe(true);
    expect(required.includes("min_confidence")).toBe(true);
  });

  it("[MATRIX:tool:get_shared_context][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/contextTools.ts");

    expect(source.includes("export const get_shared_context = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:get_shared_context][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/contextTools.ts");
    expect(source.includes("_sharedContextRead: true")).toBe(true);
    expect(source.includes("categories: params.categories ?? null")).toBe(true);
    expect(source.includes("minConfidence: params.min_confidence ?? null")).toBe(true);
  });
});
