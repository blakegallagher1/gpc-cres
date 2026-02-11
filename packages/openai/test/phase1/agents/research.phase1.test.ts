import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, researchAgent } from "../../../src/agents/index.js";
import { researchTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: research", () => {
  it("[MATRIX:agent:research][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === researchAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(researchAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(researchTools));
  });

  it("[MATRIX:agent:research][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = researchAgent.instructions.toLowerCase();
    const toolIds = new Set(getToolIds(researchTools));

    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("share_analysis_finding")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
    expect(instructionText.includes("confidence levels")).toBe(true);
    expect(instructionText.includes("data gaps")).toBe(true);
  });

  it("[MATRIX:agent:research][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = researchAgent.instructions;

    expect(instructionText.includes("## EXAMPLE OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### Parcel Research Report")).toBe(true);
    expect(instructionText.includes("**Data Sources:**")).toBe(true);
  });
});
