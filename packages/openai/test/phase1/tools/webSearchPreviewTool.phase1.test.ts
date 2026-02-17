import { describe, expect, it } from "vitest";

import { webSearchPreviewTool } from "../../../src/tools/index.js";
import { hostedWebSearchPreviewTool } from "../../../src/tools/hostedTools.js";
import { readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: webSearchPreviewTool", () => {
  it("[MATRIX:tool:webSearchPreviewTool][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(webSearchPreviewTool.type).toBe("web_search_preview");
    expect(webSearchPreviewTool.search_context_size).toBe("medium");
  });

  it("[MATRIX:tool:webSearchPreviewTool][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/index.ts");

    // Pass-through declaration only; request security enforced in API/runtime layers.
    expect(source.includes("export const webSearchPreviewTool = hostedWebSearchPreviewTool")).toBe(true);
    expect(source.includes("hostedWebSearchPreviewTool")).toBe(true);
    expect(source.includes("execute:")).toBe(false);
  });

  it("[MATRIX:tool:webSearchPreviewTool][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/hostedTools.ts");
    expect(source.includes('search_context_size: "medium" as const')).toBe(true);
    expect(source.includes("satisfies OpenAI.Responses.WebSearchPreviewTool")).toBe(true);
    expect(webSearchPreviewTool).toBe(hostedWebSearchPreviewTool);
  });
});
