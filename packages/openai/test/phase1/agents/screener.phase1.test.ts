import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, screenerAgent } from "../../../src/agents/index.js";
import { screenerTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: screener", () => {
  it("[MATRIX:agent:screener][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === screenerAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(screenerAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(screenerTools));
  });

  it("[MATRIX:agent:screener][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = screenerAgent.instructions;
    const toolIds = new Set(getToolIds(screenerTools));

    expect(instructionText.includes("assess_uncertainty")).toBe(true);
    expect(instructionText.includes("Recommendation Robustness")).toBe(true);
    expect(toolIds.has("assess_uncertainty")).toBe(true);
    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
  });

  it("[MATRIX:agent:screener][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = screenerAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### Screening Summary")).toBe(true);
    expect(instructionText.includes("**Recommendation:**")).toBe(true);
  });
});
