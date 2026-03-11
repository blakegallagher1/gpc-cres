import { describe, expect, it } from "vitest";

import {
  capitalMarketsAgent,
  createConfiguredCoordinator,
} from "../../../src/agents/index.js";
import { getToolIds } from "../../phase1/_helpers/agentAssertions.js";

describe("Phase 4 Opportunity OS :: capital markets agent", () => {
  it("wires the capital markets specialist through the configured coordinator", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find(
      (agent) => agent.name === capitalMarketsAgent.name,
    );

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(capitalMarketsAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(
      [
        "capital_debt_sizing_overview",
        "capital_disposition_analysis",
        "capital_lender_outreach_brief",
        "capital_refinance_scenarios",
        "capital_stack_optimization",
        "compare_document_vs_deal_terms",
        "get_deal_context",
        "get_document_extraction_summary",
        "get_rent_roll",
        "get_shared_context",
        "log_reasoning_trace",
        "model_capital_stack",
        "query_document_extractions",
        "search_knowledge_base",
        "share_analysis_finding",
        "store_knowledge_entry",
      ].sort(),
    );
  });

  it("keeps the capital markets prompt scoped to financing and execution decisions", () => {
    const instructionText = capitalMarketsAgent.instructions;

    expect(instructionText).toContain("### Capital Markets Brief");
    expect(instructionText).toContain("Debt Capacity Snapshot");
    expect(instructionText).toContain(
      "Recommendation: [Refinance / Market for sale / Reprice debt / Hold]",
    );
  });
});
