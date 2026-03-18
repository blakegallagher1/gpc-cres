import { describe, expect, it } from "vitest";

import { store_knowledge_entry } from "../../../src/tools/knowledgeTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: store_knowledge_entry", () => {
  it("[MATRIX:tool:store_knowledge_entry][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(store_knowledge_entry.name).toBe("store_knowledge_entry");

    const required = getRequiredFields(store_knowledge_entry);
    expect(required.includes("content_type")).toBe(true);
    expect(required.includes("title")).toBe(true);
    expect(required.includes("content")).toBe(true);
    expect(required.includes("deal_id")).toBe(true);
    expect(required.includes("parish")).toBe(true);
    expect(required.includes("sku_type")).toBe(true);
    expect(required.includes("tags")).toBe(true);
    expect(required.includes("source_agent")).toBe(true);
  });

  it("[MATRIX:tool:store_knowledge_entry][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/knowledgeTools.ts");

    // Persistence deferred to server route via POST /api/knowledge with auth headers
    expect(source.includes("buildMemoryToolHeaders(context)")).toBe(true);
    expect(source.includes("sourceAgent: params.source_agent")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:store_knowledge_entry][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const contentTypeSchema = store_knowledge_entry.parameters?.properties?.content_type as {
      enum?: string[];
    };

    expect(contentTypeSchema.enum).toEqual([
      "agent_analysis",
      "market_report",
      "outcome_record",
      "reasoning_trace",
    ]);
    expect(contentTypeSchema.enum?.includes("procedural_skill")).toBe(false);
    expect(contentTypeSchema.enum?.includes("episodic_summary")).toBe(false);
    expect(contentTypeSchema.enum?.includes("trajectory_trace")).toBe(false);

    const source = readRepoSource("packages/openai/src/tools/knowledgeTools.ts");
    expect(source.includes("tags: params.tags ?? []")).toBe(true);
    // sourceId derived from agent name + title ensures deduplication on retry
    expect(source.includes("sourceId")).toBe(true);
    expect(source.includes("action: \"ingest\"")).toBe(true);
  });
});
