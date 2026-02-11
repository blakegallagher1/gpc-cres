import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, legalAgent } from "../../../src/agents/index.js";
import { legalTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: legal", () => {
  it("[MATRIX:agent:legal][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === legalAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(legalAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(legalTools));
  });

  it("[MATRIX:agent:legal][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = legalAgent.instructions.toLowerCase();
    const toolIds = new Set(getToolIds(legalTools));

    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("share_analysis_finding")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
    expect(instructionText.includes("risk")).toBe(true);
  });

  it("[MATRIX:agent:legal][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = legalAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### Contract Review Memo")).toBe(true);
    expect(instructionText.includes("**Recommendation:**")).toBe(true);
  });
});
