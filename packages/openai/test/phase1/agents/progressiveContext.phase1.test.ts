import { describe, expect, it } from "vitest";
import { createEntitlementOSAgent } from "../../../src/agents/index.js";

describe("Phase 1 Agent Pack :: unified agent context", () => {
  it("[MATRIX:agent:unified-context][PACK:comprehensive] unified EntitlementOS agent loads complete domain instructions", () => {
    const agent = createEntitlementOSAgent();

    expect(agent.instructions).toBeDefined();
    expect(typeof agent.instructions).toBe("string");

    // Verify key domain areas are covered in unified instructions
    expect(agent.instructions.includes("CORE OPERATING PRINCIPLES")).toBe(true);
    expect(agent.instructions.includes("DEAL PIPELINE")).toBe(true);
    expect(agent.instructions.includes("GPC Focus Areas")).toBe(true);
    expect(agent.instructions.includes("Investment Criteria")).toBe(true);
    expect(agent.instructions.includes("Louisiana-Specific")).toBe(true);
  });
});
