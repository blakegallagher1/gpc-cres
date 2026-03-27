export type ToolTimeoutConfig = {
  timeoutMs: number;
  errorStrategy: "error_as_result" | "raise_exception";
};

export const TOOL_TIMEOUTS: Record<string, ToolTimeoutConfig> = {
  browser_task: { timeoutMs: 120_000, errorStrategy: "error_as_result" },
  search_parcels: { timeoutMs: 15_000, errorStrategy: "error_as_result" },
  get_parcel_details: { timeoutMs: 15_000, errorStrategy: "error_as_result" },
  screen_batch: { timeoutMs: 60_000, errorStrategy: "error_as_result" },
  query_property_db_sql: { timeoutMs: 15_000, errorStrategy: "error_as_result" },
  search_knowledge_base: { timeoutMs: 5_000, errorStrategy: "error_as_result" },
  store_knowledge_entry: { timeoutMs: 5_000, errorStrategy: "error_as_result" },
  recall_property_intelligence: { timeoutMs: 5_000, errorStrategy: "error_as_result" },
  store_property_finding: { timeoutMs: 5_000, errorStrategy: "error_as_result" },
  get_entity_memory: { timeoutMs: 5_000, errorStrategy: "error_as_result" },
  _default: { timeoutMs: 30_000, errorStrategy: "error_as_result" },
};

export function getToolTimeout(toolName: string): ToolTimeoutConfig {
  return TOOL_TIMEOUTS[toolName] ?? TOOL_TIMEOUTS._default;
}

export function formatTimeoutError(toolName: string, timeoutMs: number): string {
  return `Tool '${toolName}' timed out after ${timeoutMs / 1000}s. Try a simpler query or check service health.`;
}
