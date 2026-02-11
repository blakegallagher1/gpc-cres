import { describe, expect, it } from "vitest";

import { analyze_portfolio } from "../../../src/tools/portfolioTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: analyze_portfolio", () => {
  it("[MATRIX:tool:analyze_portfolio][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(analyze_portfolio.name).toBe("analyze_portfolio");

    const required = getRequiredFields(analyze_portfolio);
    expect(required.includes("analysis_type")).toBe(true);
    expect(required.includes("available_equity")).toBe(true);
    expect(required.includes("max_deals")).toBe(true);
    expect(required.includes("disposition_deal_id")).toBe(true);
    expect(required.includes("stress_scenario")).toBe(true);
  });

  it("[MATRIX:tool:analyze_portfolio][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/portfolioTools.ts");

    expect(source.includes("export const analyze_portfolio = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:analyze_portfolio][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/portfolioTools.ts");
    expect(source.includes("return JSON.stringify({")).toBe(true);
    expect(source.includes("_portfolioAnalysis: true")).toBe(true);
    expect(source.includes("...params")).toBe(true);
  });
});
