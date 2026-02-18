import { describe, expect, it } from "vitest";

import { coordinatorAgent, createConfiguredCoordinator, specialistAgents } from "../../../src/agents/index.js";
import { coordinatorTools } from "../../../src/tools/index.js";

describe("Phase 1 Agent Pack :: coordinator", () => {
  it("[MATRIX:agent:coordinator][PACK:handoff] verifies specialist handoff routing and contradiction resolution", () => {
    const configured = createConfiguredCoordinator();
    const configuredHandoffs = configured.handoffs ?? [];

    expect(configured.name).toBe("Coordinator");
    expect(configuredHandoffs).toHaveLength(specialistAgents.length);

    const specialistNames = new Set(specialistAgents.map((agent) => agent.name));
    for (const handoff of configuredHandoffs) {
      expect(specialistNames.has(handoff.name)).toBe(true);
      expect(Array.isArray(handoff.tools)).toBe(true);
      expect((handoff.tools ?? []).length).toBeGreaterThan(0);
    }
  });

  it("[MATRIX:agent:coordinator][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const instructionText = coordinatorAgent.instructions;

    expect(instructionText.includes("assess_uncertainty")).toBe(true);
    expect(instructionText.includes("request_reanalysis")).toBe(true);
    expect(instructionText.includes("log_reasoning_trace")).toBe(true);

    const coordinatorToolNames = new Set(
      coordinatorTools
        .map((tool) => ("name" in (tool as object) ? (tool as { name?: string }).name : undefined))
        .filter((name): name is string => Boolean(name)),
    );

    expect(coordinatorToolNames.has("assess_uncertainty")).toBe(true);
    expect(coordinatorToolNames.has("request_reanalysis")).toBe(true);
    expect(coordinatorToolNames.has("log_reasoning_trace")).toBe(true);
  });

  it("[MATRIX:agent:coordinator][PACK:hosted-tools] excludes hosted web search from direct coordinator toolset", () => {
    const hasHostedWebSearch = coordinatorTools.some(
      (tool) =>
        "type" in (tool as object) &&
        (tool as { type?: string }).type === "web_search_preview",
    );

    expect(hasHostedWebSearch).toBe(false);
  });

  it("[MATRIX:agent:coordinator][PACK:agent-as-tool] exposes specialist consult tools while preserving handoffs", () => {
    const configured = createConfiguredCoordinator();
    const toolNames = new Set(
      (configured.tools ?? [])
        .map((tool) => ("name" in (tool as object) ? (tool as { name?: string }).name : undefined))
        .filter((name): name is string => Boolean(name)),
    );

    expect(toolNames.has("consult_finance_specialist")).toBe(true);
    expect(toolNames.has("consult_risk_specialist")).toBe(true);
    expect(toolNames.has("consult_legal_specialist")).toBe(true);
    expect((configured.handoffs ?? []).length).toBeGreaterThan(0);
  });

  it("[MATRIX:agent:coordinator][PACK:guardrails] wires coordinator input guardrail", () => {
    const configured = createConfiguredCoordinator();
    const guardrailNames = new Set(
      (configured.inputGuardrails ?? []).map((guardrail) => guardrail.name),
    );

    expect(guardrailNames.has("coordinator_input_guardrail")).toBe(true);
  });

  it("[MATRIX:agent:coordinator][PACK:structured-output] configures coordinator outputType", () => {
    const configured = createConfiguredCoordinator();

    expect(configured.outputType).toBeDefined();
    expect(configured.outputType).not.toBe("text");
  });

  it("[MATRIX:agent:coordinator][PACK:contract] validates structured output schema and required evidence fields", () => {
    const instructionText = coordinatorAgent.instructions;

    expect(instructionText.includes("Task Understanding")).toBe(true);
    expect(instructionText.includes("Execution Plan")).toBe(true);
    expect(instructionText.includes("Agent Outputs")).toBe(true);
    expect(instructionText.includes("Synthesis")).toBe(true);
    expect(instructionText.includes("Key Assumptions")).toBe(true);
    expect(instructionText.includes("Uncertainty Map")).toBe(true);
    expect(instructionText.includes("Next Steps")).toBe(true);
    expect(instructionText.includes("CONSULT-AS-TOOL VS HANDOFF ROUTING")).toBe(true);
    expect(instructionText.includes("consult_finance_specialist")).toBe(true);
    expect(instructionText.includes("consult_risk_specialist")).toBe(true);
    expect(instructionText.includes("consult_legal_specialist")).toBe(true);
  });
});
