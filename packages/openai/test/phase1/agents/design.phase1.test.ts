import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, designAgent } from "../../../src/agents/index.js";
import { designTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: design", () => {
  it("[MATRIX:agent:design][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === designAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(designAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(designTools));
  });

  it("[MATRIX:agent:design][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = designAgent.instructions.toLowerCase();
    const toolIds = new Set(getToolIds(designTools));

    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("share_analysis_finding")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
    expect(instructionText.includes("preliminary cost estimates")).toBe(true);
  });

  it("[MATRIX:agent:design][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = designAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### Site Plan Analysis")).toBe(true);
    expect(instructionText.includes("**Preliminary Cost Estimate:**")).toBe(true);
  });
});
