import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@openai/agents";

const {
  buildDataAgentRetrievalContextMock,
  filterToolsForIntentMock,
  getToolDefinitionNameMock,
} = vi.hoisted(() => ({
  buildDataAgentRetrievalContextMock: vi.fn(),
  filterToolsForIntentMock: vi.fn(),
  getToolDefinitionNameMock: vi.fn(),
}));

vi.mock("../dataAgent/retrieval.js", () => ({
  buildDataAgentRetrievalContext: buildDataAgentRetrievalContextMock,
}));

vi.mock("../agentos/toolPolicy.js", async () => {
  const actual = await vi.importActual<typeof import("../agentos/toolPolicy.js")>(
    "../agentos/toolPolicy.js",
  );
  return {
    ...actual,
    filterToolsForIntent: filterToolsForIntentMock,
    getToolDefinitionName: getToolDefinitionNameMock,
  };
});

import { applyAgentToolPolicy, unifiedRetrieval } from "./webRuntimeContracts.js";

describe("webRuntimeContracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps orchestrator retrieval results into retrieval records", async () => {
    buildDataAgentRetrievalContextMock.mockResolvedValue({
      query: "permit review",
      subjectId: "run-1",
      generatedAt: new Date().toISOString(),
      sources: { semantic: 0, sparse: 1, graph: 0 },
      results: [
        {
          id: "r1",
          source: "sparse",
          text: "permit review note",
          score: 0.88,
          metadata: { lane: "postgres-exact" },
        },
      ],
    });

    await expect(unifiedRetrieval("permit review", "run-1", "org-1")).resolves.toEqual([
      {
        id: "r1",
        source: "sparse",
        text: "permit review note",
        score: 0.88,
        metadata: { lane: "postgres-exact" },
      },
    ]);
    expect(buildDataAgentRetrievalContextMock).toHaveBeenCalledWith(
      "permit review",
      "run-1",
      { orgId: "org-1" },
    );
  });

  it("filters web-excluded tools and reports tool inventory", () => {
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
        additionalAllowedTools: expect.arrayContaining([
          "store_memory",
          "get_entity_truth",
          "get_entity_memory",
          "record_memory_event",
          "lookup_entity_by_address",
        ]),
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
