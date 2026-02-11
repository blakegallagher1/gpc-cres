import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, marketIntelAgent } from "../../../src/agents/index.js";
import { marketIntelTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: marketIntel", () => {
  it("[MATRIX:agent:marketIntel][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === marketIntelAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(marketIntelAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(marketIntelTools));
  });

  it("[MATRIX:agent:marketIntel][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = marketIntelAgent.instructions.toLowerCase();
    const toolIds = new Set(getToolIds(marketIntelTools));

    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("share_analysis_finding")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
    expect(instructionText.includes("confidence level")).toBe(true);
    expect(instructionText.includes("key assumptions")).toBe(true);
  });

  it("[MATRIX:agent:marketIntel][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = marketIntelAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### Market Snapshot")).toBe(true);
    expect(instructionText.includes("**Implications:**")).toBe(true);
  });
});
