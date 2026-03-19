import { describe, expect, it } from "vitest";

import {
  assetManagementAgent,
  createConfiguredCoordinator,
} from "../../../src/agents/index.js";
import { getToolIds } from "../../phase1/_helpers/agentAssertions.js";

describe("Phase 4 Opportunity OS :: asset management agent", () => {
  it("wires the asset management specialist through the configured coordinator", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find(
      (agent) => agent.name === assetManagementAgent.name,
    );

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(assetManagementAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(
      [
        "asset_capital_plan_summary",
        "asset_lease_admin_summary",
        "asset_noi_optimization_plan",
        "asset_operations_health",
        "asset_tenant_exposure_analysis",
        "get_deal_context",
        "get_rent_roll",
        "get_shared_context",
        "log_reasoning_trace",
        "search_knowledge_base",
        "search_procedural_skills",
        "search_similar_episodes",
        "share_analysis_finding",
        "store_knowledge_entry",
      ].sort(),
    );
  });

  it("keeps the asset management prompt scoped to post-close operating execution", () => {
    const instructionText = assetManagementAgent.instructions;

    expect(instructionText).toContain("### Asset Management Plan");
    expect(instructionText).toContain("NOI Optimization Priorities");
    expect(instructionText).toContain("lease administration");
  });
});
