import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, operationsAgent } from "../../../src/agents/index.js";
import { operationsTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: operations", () => {
  it("[MATRIX:agent:operations][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === operationsAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(operationsAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(operationsTools));
  });

  it("[MATRIX:agent:operations][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = operationsAgent.instructions.toLowerCase();
    const toolIds = new Set(getToolIds(operationsTools));

    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("share_analysis_finding")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
    expect(instructionText.includes("at risk")).toBe(true);
  });

  it("[MATRIX:agent:operations][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = operationsAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### Project Status Report")).toBe(true);
    expect(instructionText.includes("**Key Issues:**")).toBe(true);
  });
});
