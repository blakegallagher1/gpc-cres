import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, financeAgent } from "../../../src/agents/index.js";
import { financeTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: finance", () => {
  it("[MATRIX:agent:finance][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === financeAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(financeAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(financeTools));
  });

  it("[MATRIX:agent:finance][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = financeAgent.instructions;
    const toolIds = new Set(getToolIds(financeTools));

    expect(toolIds.has("assess_uncertainty")).toBe(true);
    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
    expect(instructionText.includes("Confidence Assessment")).toBe(true);
  });

  it("[MATRIX:agent:finance][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = financeAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### Investment Memo Summary")).toBe(true);
    expect(instructionText.includes("**Recommendation:**")).toBe(true);
  });
});
