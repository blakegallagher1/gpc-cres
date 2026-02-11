import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, taxAgent } from "../../../src/agents/index.js";
import { taxTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: tax", () => {
  it("[MATRIX:agent:tax][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === taxAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(taxAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(taxTools));
  });

  it("[MATRIX:agent:tax][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = taxAgent.instructions.toLowerCase();
    const toolIds = new Set(getToolIds(taxTools));

    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("share_analysis_finding")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
    expect(instructionText.includes("missing or uncertain")).toBe(true);
  });

  it("[MATRIX:agent:tax][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = taxAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("1. **Summary**")).toBe(true);
    expect(instructionText.includes("5. **Next Steps**")).toBe(true);
  });
});
