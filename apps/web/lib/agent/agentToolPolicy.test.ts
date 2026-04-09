import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  applyAgentToolPolicyMock,
} = vi.hoisted(() => ({
  applyAgentToolPolicyMock: vi.fn(),
}));

vi.mock("@entitlement-os/openai", () => ({
  applyAgentToolPolicy: applyAgentToolPolicyMock,
}));

import { applyAgentToolPolicy } from "./agentToolPolicy";

describe("applyAgentToolPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates tool policy evaluation to the package contract", () => {
    const coordinator = { tools: [{ name: "query_property_db" }] } as const;
    const expected = {
      preFilterTools: ["query_property_db"],
      configuredToolNames: ["screen_full", "store_memory"],
      memoryToolsPresent: ["store_memory"],
      missingMemoryTools: ["get_entity_truth"],
    };
    applyAgentToolPolicyMock.mockReturnValue(expected);

    const summary = applyAgentToolPolicy(coordinator, "analysis");

    expect(applyAgentToolPolicyMock).toHaveBeenCalledWith(coordinator, "analysis");
    expect(summary).toBe(expected);
  });
});
