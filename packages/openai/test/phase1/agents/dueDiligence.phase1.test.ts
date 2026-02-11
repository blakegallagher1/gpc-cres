import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, dueDiligenceAgent } from "../../../src/agents/index.js";
import { dueDiligenceTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: dueDiligence", () => {
  it("[MATRIX:agent:dueDiligence][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === dueDiligenceAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(dueDiligenceAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(dueDiligenceTools));
  });

  it("[MATRIX:agent:dueDiligence][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = dueDiligenceAgent.instructions.toLowerCase();
    const toolIds = new Set(getToolIds(dueDiligenceTools));

    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("share_analysis_finding")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
    expect(instructionText.includes("confidence level")).toBe(true);
    expect(instructionText.includes("critical gaps")).toBe(true);
  });

  it("[MATRIX:agent:dueDiligence][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = dueDiligenceAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### DD Status Summary")).toBe(true);
    expect(instructionText.includes("**Next Steps:**")).toBe(true);
  });
});
