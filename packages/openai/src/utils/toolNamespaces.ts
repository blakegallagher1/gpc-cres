/**
 * Tool namespace categories for organizing 30+ agent tools.
 * Used for Responses API tool_namespace() grouping and defer_loading.
 *
 * When OpenAI's @openai/agents TS SDK supports tool_namespace() natively,
 * this registry will drive the grouping. Until then, it serves as documentation
 * and can be used for logging/analytics.
 */

export type ToolNamespace = {
  name: string;
  description: string;
  tools: string[];
  deferLoading: boolean;
};

export const TOOL_NAMESPACES: ToolNamespace[] = [
  {
    name: "property",
    description: "Property database search, parcel details, and screening tools",
    tools: [
      "search_parcels",
      "get_parcel_details",
      "query_property_db_sql",
      "screen_batch",
    ],
    deferLoading: false, // Core tools, always loaded
  },
  {
    name: "screening",
    description: "Individual environmental and regulatory screening tools",
    tools: [
      "screen_zoning",
      "screen_flood",
      "screen_soils",
      "screen_wetlands",
      "screen_epa",
      "screen_traffic",
      "screen_ldeq",
      "screen_full",
    ],
    deferLoading: true, // Loaded when screening is needed
  },
  {
    name: "deal",
    description: "Deal management, status updates, and task tracking",
    tools: [
      "get_deal_context",
      "create_deal",
      "update_deal_status",
      "list_deals",
      "create_task",
      "update_task",
      "list_tasks",
    ],
    deferLoading: false, // Core tools
  },
  {
    name: "memory",
    description: "Knowledge base, property intelligence, and entity memory tools",
    tools: [
      "search_knowledge_base",
      "store_knowledge_entry",
      "recall_property_intelligence",
      "store_property_finding",
      "get_entity_memory",
      "record_memory_event",
    ],
    deferLoading: false, // Used frequently
  },
  {
    name: "documents",
    description: "Document extraction, analysis, and artifact generation",
    tools: [
      "query_document_extractions",
      "get_document_extraction_summary",
      "compare_document_vs_deal_terms",
      "generate_artifact",
    ],
    deferLoading: true, // Loaded when document work is needed
  },
  {
    name: "browser",
    description: "Browser automation for external website navigation",
    tools: ["browser_task"],
    deferLoading: true, // Only loaded when browsing is needed
  },
  {
    name: "financial",
    description: "Financial modeling, proforma, and debt sizing tools",
    tools: [
      "calculate_proforma",
      "calculate_debt_sizing",
      "model_capital_stack",
      "stress_test_deal",
    ],
    deferLoading: true, // Loaded for financial analysis
  },
];

/**
 * Get the namespace for a given tool name.
 */
export function getToolNamespace(toolName: string): ToolNamespace | null {
  return TOOL_NAMESPACES.find((ns) => ns.tools.includes(toolName)) ?? null;
}

/**
 * Get all tools that should be deferred (not loaded by default).
 */
export function getDeferredToolNames(): string[] {
  return TOOL_NAMESPACES.filter((ns) => ns.deferLoading).flatMap((ns) => ns.tools);
}

/**
 * Get all tools that should always be loaded.
 */
export function getAlwaysLoadedToolNames(): string[] {
  return TOOL_NAMESPACES.filter((ns) => !ns.deferLoading).flatMap((ns) => ns.tools);
}
