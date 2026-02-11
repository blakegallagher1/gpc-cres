import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, marketingAgent } from "../../../src/agents/index.js";
import { marketingTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: marketing", () => {
  it("[MATRIX:agent:marketing][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === marketingAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(marketingAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(marketingTools));
  });

  it("[MATRIX:agent:marketing][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = marketingAgent.instructions.toLowerCase();
    const toolIds = new Set(getToolIds(marketingTools));

    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("share_analysis_finding")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
    expect(instructionText.includes("performance metrics")).toBe(true);
  });

  it("[MATRIX:agent:marketing][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = marketingAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### Marketing Plan")).toBe(true);
    expect(instructionText.includes("**Success Metrics:**")).toBe(true);
  });
});
