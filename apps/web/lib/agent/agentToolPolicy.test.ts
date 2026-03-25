import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Agent } from "@openai/agents";

const {
  filterToolsForIntentMock,
  getToolDefinitionNameMock,
} = vi.hoisted(() => ({
  filterToolsForIntentMock: vi.fn(),
  getToolDefinitionNameMock: vi.fn(),
}));

vi.mock("@entitlement-os/openai", () => ({
  filterToolsForIntent: filterToolsForIntentMock,
  getToolDefinitionName: getToolDefinitionNameMock,
  WEB_ADDITIONAL_TOOL_ALLOWLIST: ["query_property_db_sql"],
}));

import { applyAgentToolPolicy } from "./agentToolPolicy";

describe("applyAgentToolPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getToolDefinitionNameMock.mockImplementation(
      (tool: { name?: string } | undefined) => tool?.name ?? null,
    );
    filterToolsForIntentMock.mockImplementation(
      (
        _queryIntent: string,
        tools: Array<{ name?: string }>,
        options: { excludedToolNames?: string[] },
      ) =>
        tools.filter((tool) => !options.excludedToolNames?.includes(tool.name ?? "")),
    );
  });

  it("filters web-excluded tools and reports tool inventory", () => {
    const coordinator = {
      tools: [
        { name: "query_property_db" },
        { name: "screen_full" },
        { name: "store_memory" },
      ],
    } as unknown as Agent;

    const summary = applyAgentToolPolicy(coordinator, "analysis");

    expect(filterToolsForIntentMock).toHaveBeenCalledWith(
      "analysis",
      [
        { name: "query_property_db" },
        { name: "screen_full" },
        { name: "store_memory" },
      ],
      expect.objectContaining({
        excludedToolNames: ["query_property_db"],
        additionalAllowedTools: ["query_property_db_sql"],
        allowFallback: true,
        allowNamelessTools: false,
      }),
    );
    expect(summary).toEqual({
      preFilterTools: ["query_property_db", "screen_full", "store_memory"],
      configuredToolNames: ["screen_full", "store_memory"],
      memoryToolsPresent: ["store_memory"],
      missingMemoryTools: [
        "get_entity_truth",
        "get_entity_memory",
        "record_memory_event",
        "lookup_entity_by_address",
      ],
    });
    expect(coordinator.tools).toEqual([
      { name: "screen_full" },
      { name: "store_memory" },
    ]);
  });
});
