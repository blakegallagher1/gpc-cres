import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, riskAgent } from "../../../src/agents/index.js";
import { riskTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: risk", () => {
  it("[MATRIX:agent:risk][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === riskAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(riskAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(riskTools));
  });

  it("[MATRIX:agent:risk][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = riskAgent.instructions;
    const toolIds = new Set(getToolIds(riskTools));

    expect(instructionText.includes("assess_uncertainty")).toBe(true);
    expect(instructionText.includes("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("assess_uncertainty")).toBe(true);
    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
  });

  it("[MATRIX:agent:risk][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = riskAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### Risk Assessment Report")).toBe(true);
    expect(instructionText.includes("**Recommendation Robustness:**")).toBe(true);
  });
});
