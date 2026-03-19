import { describe, expect, it } from "vitest";

import {
  acquisitionUnderwritingAgent,
  createConfiguredCoordinator,
} from "../../../src/agents/index.js";
import { getToolIds } from "../../phase1/_helpers/agentAssertions.js";

describe("Phase 4 Opportunity OS :: acquisition underwriting agent", () => {
  it("wires the acquisition underwriting specialist through the configured coordinator", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find(
      (agent) => agent.name === acquisitionUnderwritingAgent.name,
    );

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(acquisitionUnderwritingAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(
      [
        "acquisition_cap_rate_evaluation",
        "acquisition_dcf_analysis",
        "acquisition_internal_comparable_sales",
        "acquisition_investment_returns",
        "acquisition_rent_roll_analysis",
        "assess_uncertainty",
        "compare_document_vs_deal_terms",
        "get_deal_context",
        "get_document_extraction_summary",
        "get_shared_context",
        "log_reasoning_trace",
        "query_document_extractions",
        "search_knowledge_base",
        "search_procedural_skills",
        "search_similar_episodes",
        "share_analysis_finding",
        "store_knowledge_entry",
      ].sort(),
    );
  });

  it("keeps the acquisition underwriting prompt scoped to investment decision support", () => {
    const instructionText = acquisitionUnderwritingAgent.instructions;

    expect(instructionText).toContain("### Acquisition Underwriting Memo");
    expect(instructionText).toContain("DCF");
    expect(instructionText).toContain("Recommendation: [Proceed / Reprice / Pass]");
  });
});
