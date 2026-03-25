import { describe, expect, it } from "vitest";

import { createConfiguredCoordinator, createEntitlementOSAgent } from "../../../src/agents/index.js";
import { entitlementOsTools } from "../../../src/tools/index.js";

describe("Phase 1 Agent Pack :: coordinator (unified EntitlementOS)", () => {
  const memoryTools = [
    "record_memory_event",
    "get_entity_memory",
    "store_memory",
    "get_entity_truth",
  ];

  it("[MATRIX:agent:coordinator][PACK:unified] verifies unified EntitlementOS agent core identity", () => {
    const configured = createConfiguredCoordinator();

    expect(configured.name).toBe("EntitlementOS");
    // Unified agent has empty handoffs array (no specialist delegation)
    expect(configured.handoffs).toEqual([]);
  });

  it("[MATRIX:agent:coordinator][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries", () => {
    const agent = createEntitlementOSAgent();
    const instructionText = agent.instructions;

    expect(instructionText.includes("Confidence level")).toBe(true);
    expect(instructionText.includes("robustness")).toBe(true);
    expect(instructionText.includes("sensitivities")).toBe(true);

    const configuredToolNames = new Set(
      entitlementOsTools
        .map((tool) => ("name" in (tool as object) ? (tool as { name?: string }).name : undefined))
        .filter((name): name is string => Boolean(name)),
    );

    expect(configuredToolNames.has("assess_uncertainty")).toBe(true);
  });

  it("[MATRIX:agent:coordinator][PACK:hosted-tools] excludes hosted web search from direct coordinator toolset", () => {
    const hasHostedWebSearch = entitlementOsTools.some(
      (tool) =>
        "type" in (tool as object) &&
        (tool as { type?: string }).type === "web_search_preview",
    );

    expect(hasHostedWebSearch).toBe(false);
  });

  it("[MATRIX:agent:coordinator][PACK:unified-agent] unified EntitlementOS agent has comprehensive tool coverage", () => {
    const configured = createConfiguredCoordinator();
    const toolNames = new Set(
      (configured.tools ?? [])
        .map((tool) => ("name" in (tool as object) ? (tool as { name?: string }).name : undefined))
        .filter((name): name is string => Boolean(name)),
    );

    expect(toolNames.has("calculate_proforma")).toBe(true);
    expect(toolNames.has("assess_uncertainty")).toBe(true);
    expect(toolNames.has("screen_zoning")).toBe(true);
    expect((configured.tools ?? []).length).toBeGreaterThan(100);
  });

  it("[MATRIX:agent:coordinator][PACK:guardrails] wires coordinator input guardrail", () => {
    const configured = createConfiguredCoordinator();
    const guardrailNames = new Set(
      (configured.inputGuardrails ?? []).map((guardrail) => guardrail.name),
    );

    expect(guardrailNames.has("coordinator_input_guardrail")).toBe(true);
  });

  it("[MATRIX:agent:coordinator][PACK:structured-output] coordinator uses prompt-based formatting (no outputType constraint)", () => {
    const configured = createConfiguredCoordinator();

    // outputType deliberately removed to allow memory tool calls before output generation.
    // When not set, the SDK defaults outputType to "text".
    expect(configured.outputType).toBe("text");
  });

  it("[MATRIX:agent:coordinator][PACK:memory-tools] exposes memory tools in coordinator tool collections", () => {
    const configured = createConfiguredCoordinator();
    const configuredToolNames = new Set(
      (configured.tools ?? [])
        .map((tool) =>
          "name" in (tool as object) ? (tool as { name?: string }).name : undefined,
        )
        .filter((name): name is string => Boolean(name)),
    );

    const entitlementOsToolNames = new Set(
      entitlementOsTools
        .map((tool) =>
          "name" in (tool as object) ? (tool as { name?: string }).name : undefined,
        )
        .filter((name): name is string => Boolean(name)),
    );

    for (const toolName of memoryTools) {
      expect(entitlementOsToolNames.has(toolName)).toBe(true);
      expect(configuredToolNames.has(toolName)).toBe(true);
    }
  });

  it("[MATRIX:agent:coordinator][PACK:contract] validates structured output schema and required evidence fields", () => {
    const agent = createEntitlementOSAgent();
    const instructionText = agent.instructions;

    expect(instructionText.includes("Recommendation")).toBe(true);
    expect(instructionText.includes("Key Assumptions")).toBe(true);
    expect(instructionText.includes("Data Gaps")).toBe(true);
    expect(instructionText.includes("Next Steps")).toBe(true);
    expect(instructionText.includes("QUALITY CHECKLIST")).toBe(true);
    expect(instructionText.includes("store_knowledge_entry")).toBe(true);
  });

  it("[MATRIX:agent:coordinator][PACK:memory-protocol] hardens memory tool protocol in instructions", () => {
    const agent = createEntitlementOSAgent();
    const instructionText = agent.instructions;

    expect(instructionText.includes("Continuous Learning")).toBe(true);
    expect(instructionText.includes("knowledge base")).toBe(true);
    expect(instructionText.includes("store_knowledge_entry")).toBe(true);
  });
});
