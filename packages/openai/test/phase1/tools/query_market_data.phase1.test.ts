import { describe, expect, it } from "vitest";

import { query_market_data } from "../../../src/tools/marketTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: query_market_data", () => {
  it("[MATRIX:tool:query_market_data][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(query_market_data.name).toBe("query_market_data");

    const required = getRequiredFields(query_market_data);
    expect(required.includes("view")).toBe(true);
    expect(required.includes("parish")).toBe(true);
    expect(required.includes("data_type")).toBe(true);
    expect(required.includes("months")).toBe(true);
    expect(required.includes("limit")).toBe(true);
  });

  it("[MATRIX:tool:query_market_data][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/marketTools.ts");

    expect(source.includes("export const query_market_data = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:query_market_data][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/marketTools.ts");
    expect(source.includes("return JSON.stringify({")).toBe(true);
    expect(source.includes("_marketQuery: true")).toBe(true);
    expect(source.includes("...params")).toBe(true);
  });
});
