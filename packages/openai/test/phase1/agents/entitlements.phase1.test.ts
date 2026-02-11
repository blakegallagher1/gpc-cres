import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, entitlementsAgent } from "../../../src/agents/index.js";
import { entitlementsTools } from "../../../src/tools/index.js";
import { getToolIds } from "../_helpers/agentAssertions.js";

describe("Phase 1 Agent Pack :: entitlements", () => {
  it("[MATRIX:agent:entitlements][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const handoff = (configured.handoffs ?? []).find((agent) => agent.name === entitlementsAgent.name);

    expect(handoff).toBeDefined();
    expect(handoff?.name).toBe(entitlementsAgent.name);
    expect(getToolIds(handoff?.tools ?? [])).toEqual(getToolIds(entitlementsTools));
  });

  it("[MATRIX:agent:entitlements][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = entitlementsAgent.instructions.toLowerCase();
    const toolIds = new Set(getToolIds(entitlementsTools));

    expect(toolIds.has("log_reasoning_trace")).toBe(true);
    expect(toolIds.has("share_analysis_finding")).toBe(true);
    expect(toolIds.has("get_shared_context")).toBe(true);
    expect(instructionText.includes("regulatory uncertainty")).toBe(true);
    expect(instructionText.includes("confidence")).toBe(true);
  });

  it("[MATRIX:agent:entitlements][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = entitlementsAgent.instructions;

    expect(instructionText.includes("## OUTPUT FORMAT")).toBe(true);
    expect(instructionText.includes("### Entitlement Status Summary")).toBe(true);
    expect(instructionText.includes("**Recommendation:**")).toBe(true);
  });
});
