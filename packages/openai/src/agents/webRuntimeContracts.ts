import type { Agent } from "@openai/agents";

import { type QueryIntent } from "../queryRouter.js";
import { buildDataAgentRetrievalContext } from "../dataAgent/retrieval.js";
import {
  filterToolsForIntent,
  getToolDefinitionName,
  WEB_ADDITIONAL_TOOL_ALLOWLIST,
} from "../agentos/toolPolicy.js";

export type RetrievalRecord = {
  id: string;
  source: "semantic" | "sparse" | "graph";
  text: string;
  score: number;
  metadata: Record<string, unknown>;
};

const WEB_RUNTIME_EXCLUDED_TOOLS = ["query_property_db"] as const;
const MEMORY_TOOL_NAMES = [
  "store_memory",
  "get_entity_truth",
  "get_entity_memory",
  "record_memory_event",
  "lookup_entity_by_address",
] as const;

/**
 * Captures the tool inventory before and after the web-runtime policy filter.
 */
export type AgentToolPolicySummary = {
  preFilterTools: string[];
  configuredToolNames: string[];
  memoryToolsPresent: string[];
  missingMemoryTools: string[];
};

export async function unifiedRetrieval(
  query: string,
  subjectId?: string,
  orgId?: string,
): Promise<RetrievalRecord[]> {
  const context = await buildDataAgentRetrievalContext(query, subjectId, { orgId });
  return context.results.map((item) => ({
    id: item.id,
    source: item.source,
    text: item.text,
    score: item.score,
    metadata: item.metadata ?? {},
  }));
}

/**
 * Applies the web-runtime tool policy to a coordinator agent while returning
 * the same inventory details currently logged by executeAgent.
 */
export function applyAgentToolPolicy(
  coordinator: Agent,
  queryIntent: QueryIntent,
): AgentToolPolicySummary {
  const preFilterTools = listToolDefinitionNames(coordinator.tools ?? []);

  if (coordinator.tools && coordinator.tools.length > 0) {
    coordinator.tools = filterToolsForIntent(queryIntent, [...coordinator.tools], {
      additionalAllowedTools: [...WEB_ADDITIONAL_TOOL_ALLOWLIST],
      excludedToolNames: [...WEB_RUNTIME_EXCLUDED_TOOLS],
      allowFallback: true,
      allowNamelessTools: false,
    }) as Agent["tools"];
  }

  const configuredToolNames = listToolDefinitionNames(coordinator.tools ?? []);
  const memoryToolsPresent = configuredToolNames.filter((name) =>
    MEMORY_TOOL_NAMES.includes(name as (typeof MEMORY_TOOL_NAMES)[number]),
  );
  const missingMemoryTools = MEMORY_TOOL_NAMES.filter(
    (name) => !memoryToolsPresent.includes(name),
  );

  return {
    preFilterTools,
    configuredToolNames,
    memoryToolsPresent,
    missingMemoryTools: [...missingMemoryTools],
  };
}

function listToolDefinitionNames(tools: readonly unknown[]): string[] {
  return tools
    .map((tool) => getToolDefinitionName(tool))
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}
