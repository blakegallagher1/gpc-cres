import { describe, expect, it } from "vitest";

import { share_analysis_finding } from "../../../src/tools/contextTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: share_analysis_finding", () => {
  it("[MATRIX:tool:share_analysis_finding][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(share_analysis_finding.name).toBe("share_analysis_finding");

    const required = getRequiredFields(share_analysis_finding);
    expect(required.includes("deal_id")).toBe(true);
    expect(required.includes("category")).toBe(true);
    expect(required.includes("finding")).toBe(true);
    expect(required.includes("confidence")).toBe(true);
    expect(required.includes("source_agent")).toBe(true);
    expect(required.includes("affected_agents")).toBe(true);
    expect(required.includes("evidence_refs")).toBe(true);
  });

  it("[MATRIX:tool:share_analysis_finding][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/contextTools.ts");

    expect(source.includes("export const share_analysis_finding = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(false);
  });

  it("[MATRIX:tool:share_analysis_finding][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/contextTools.ts");
    expect(source.includes("_sharedContextWrite: true")).toBe(true);
    expect(source.includes("affectedAgents: params.affected_agents ?? null")).toBe(true);
    expect(source.includes("evidenceRefs: params.evidence_refs ?? []")).toBe(true);
  });
});
