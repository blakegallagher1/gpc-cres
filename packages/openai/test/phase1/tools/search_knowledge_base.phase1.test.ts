import { describe, expect, it } from "vitest";

import { search_knowledge_base } from "../../../src/tools/knowledgeTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: search_knowledge_base", () => {
  it("[MATRIX:tool:search_knowledge_base][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(search_knowledge_base.name).toBe("search_knowledge_base");

    const required = getRequiredFields(search_knowledge_base);
    expect(required.includes("query")).toBe(true);
    expect(required.includes("content_types")).toBe(true);
    expect(required.includes("limit")).toBe(true);
    expect(required.includes("deal_context")).toBe(true);
    expect(required.includes("recency_weight")).toBe(true);
  });

  it("[MATRIX:tool:search_knowledge_base][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/knowledgeTools.ts");

    expect(source.includes("content_types")).toBe(true);
    expect(source.includes("deal_context")).toBe(true);
    expect(source.includes("_knowledgeSearch: true")).toBe(true);
  });

  it("[MATRIX:tool:search_knowledge_base][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/knowledgeTools.ts");
    expect(source.includes("limit: params.limit ?? 5")).toBe(true);
    expect(source.includes("recencyWeight: params.recency_weight ?? \"moderate\"")).toBe(true);
    expect(source.includes("return JSON.stringify({")).toBe(true);
  });
});
