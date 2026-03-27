/**
 * Per-tool error formatters that guide the model toward recovery
 * rather than blind retries. Raw exceptions should never reach the model.
 */

export type ToolErrorFormatter = (error: Error) => string;

const TOOL_ERROR_FORMATTERS: Record<string, ToolErrorFormatter> = {
  browser_task: () =>
    "Browser automation service is temporarily unavailable. " +
    "Describe what data you need and I'll try the knowledge base (search_knowledge_base) " +
    "or property database (search_parcels) instead.",

  search_parcels: () =>
    "Property database didn't respond in time. " +
    "Try recall_property_intelligence for cached data, " +
    "or ask the user to verify gateway health.",

  get_parcel_details: () =>
    "Could not fetch parcel details from the property database. " +
    "Try search_knowledge_base for previously stored parcel data.",

  screen_batch: (e) =>
    `Batch screening partially failed: ${e.message}. ` +
    "Try screening individual parcels one at a time, or reduce batch size to 5 or fewer.",

  query_property_db_sql: () =>
    "SQL query against property database timed out. " +
    "Simplify the query (fewer joins, add LIMIT), or try a more specific search.",

  search_knowledge_base: () =>
    "Knowledge base search failed. " +
    "Try rephrasing the search query or use property database tools directly.",

  store_knowledge_entry: () =>
    "Could not save to knowledge base. " +
    "The data is still available in this conversation — try storing it again in a moment.",

  recall_property_intelligence: () =>
    "Property intelligence recall failed. " +
    "Fall back to search_parcels or search_knowledge_base for the same data.",

  generate_artifact: (e) =>
    `Artifact generation failed: ${e.message}. ` +
    "Check that all required data is available before retrying. " +
    "If a specific field is missing, gather it first then try again.",
};

const DEFAULT_FORMATTER: ToolErrorFormatter = (e) =>
  `Tool encountered an error: ${e.message}. Try an alternative approach or ask the user for guidance.`;

/**
 * Format a tool error into a recovery-oriented message for the model.
 */
export function formatToolError(toolName: string, error: Error): string {
  const formatter = TOOL_ERROR_FORMATTERS[toolName] ?? DEFAULT_FORMATTER;
  return formatter(error);
}

/**
 * Check if a tool has a custom error formatter registered.
 */
export function hasCustomFormatter(toolName: string): boolean {
  return toolName in TOOL_ERROR_FORMATTERS;
}
