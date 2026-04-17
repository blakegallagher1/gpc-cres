import type { QueryIntent } from "../queryRouter.js";

type ToolIntent = QueryIntent | (string & {});

type ToolPolicyDefinition = {
  exact: readonly string[];
  prefixes: readonly string[];
};

export type ToolPolicy = {
  readonly exact: ReadonlySet<string>;
  readonly prefixes: readonly string[];
};

export type ToolFilterOptions = {
  /**
   * Additional exact tool names to allow for a specific caller.
   */
  additionalAllowedTools?: readonly string[];
  /**
   * Exact tool names to remove after intent filtering.
   */
  excludedToolNames?: readonly string[];
  /**
   * Whether to return all incoming tools when the intent filter yields no matches.
   */
  allowFallback?: boolean;
  /**
   * Whether to keep non-named tool objects that are not hosted-tool entries.
   */
  allowNamelessTools?: boolean;
};

const BASE_ALLOWED_TOOLS = [
  "search_knowledge_base",
  "search_procedural_skills",
  "search_similar_episodes",
  "search_parcels",
  "get_parcel_details",
  "evidence_snapshot",
  "browser_task",
  "perplexity_quick_lookup",
  "perplexity_web_research",
  "perplexity_structured_extract",
  "perplexity_deep_research",
] as const;

const PROPERTY_DB_QUERY_TOOLS = [
  "query_property_db",
  "query_property_db_sql",
] as const;

export const WEB_ADDITIONAL_TOOL_ALLOWLIST = [
  "store_memory",
  "store_knowledge_entry",
  "get_entity_truth",
  "get_entity_memory",
  "record_memory_event",
  "lookup_entity_by_address",
  "ingest_comps",
  "recall_property_intelligence",
  "store_property_finding",
] as const;

const TOOL_POLICY_BY_INTENT: Record<string, ToolPolicyDefinition> = {
  finance: {
    exact: ["calculate_proforma", "calculate_debt_sizing", "query_org_sql", ...PROPERTY_DB_QUERY_TOOLS],
    prefixes: ["finance_", "calculate_", "debt_", "underwrite_", "market_"],
  },
  acquisition_underwriting: {
    exact: ["get_deal_context", "get_rent_roll", "get_document_extraction_summary"],
    prefixes: ["acquisition_", "finance_", "market_", "capital_"],
  },
  asset_management: {
    exact: ["get_deal_context", "get_rent_roll"],
    prefixes: ["asset_", "operations_", "task_", "capital_"],
  },
  capital_markets: {
    exact: ["get_deal_context", "get_rent_roll", "model_capital_stack", "get_document_extraction_summary"],
    prefixes: ["capital_", "finance_", "market_"],
  },
  legal: {
    exact: [],
    prefixes: ["legal_", "zoning_", "entitlement_", "due_diligence_"],
  },
  entitlements: {
    exact: [],
    prefixes: ["entitlement_", "zoning_", "permit_", "parish_"],
  },
  due_diligence: {
    exact: ["query_org_sql", ...PROPERTY_DB_QUERY_TOOLS],
    prefixes: ["due_diligence_", "risk_", "flood_", "evidence_"],
  },
  risk: {
    exact: ["query_org_sql", ...PROPERTY_DB_QUERY_TOOLS],
    prefixes: ["risk_", "flood_", "screen_", "hazard_", "evidence_"],
  },
  marketing: {
    exact: [],
    prefixes: ["marketing_", "buyer_", "outreach_", "market_"],
  },
  operations: {
    exact: [],
    prefixes: ["operations_", "task_", "project_", "schedule_"],
  },
  tax: {
    exact: [],
    prefixes: ["tax_", "finance_", "calculate_"],
  },
  design: {
    exact: [],
    prefixes: ["design_", "site_", "entitlement_"],
  },
  market_intel: {
    exact: [],
    prefixes: ["market_", "comps_", "research_"],
  },
  screener: {
    exact: [...PROPERTY_DB_QUERY_TOOLS],
    prefixes: ["screen_", "triage_", "parcel_", "risk_", "finance_"],
  },
  research: {
    exact: ["query_org_sql", ...PROPERTY_DB_QUERY_TOOLS],
    prefixes: ["research_", "market_", "evidence_"],
  },
  land_search: {
    exact: [...PROPERTY_DB_QUERY_TOOLS],
    prefixes: ["search_", "parcel_", "screen_", "evidence_"],
  },
  general: {
    exact: ["query_org_sql", ...PROPERTY_DB_QUERY_TOOLS],
    prefixes: [],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeToolIntent(intent?: string | null): ToolIntent {
  if (!intent) return "general";
  if (intent in TOOL_POLICY_BY_INTENT) {
    return intent as ToolIntent;
  }
  return "general";
}

export function getToolDefinitionName(tool: unknown): string | null {
  if (!isRecord(tool)) return null;
  if (typeof tool.name === "string" && tool.name.trim().length > 0) {
    return tool.name;
  }
  if (isRecord(tool.function) && typeof tool.function.name === "string") {
    return tool.function.name;
  }
  return null;
}

function isHostedToolLike(tool: unknown): boolean {
  return isRecord(tool) && tool.type === "hosted_tool";
}

function buildToolPolicy(intent: string): ToolPolicy {
  const normalizedIntent = normalizeToolIntent(intent);
  const policy = TOOL_POLICY_BY_INTENT[normalizedIntent] ?? TOOL_POLICY_BY_INTENT.general;

  return {
    exact: new Set([...BASE_ALLOWED_TOOLS, ...policy.exact]),
    prefixes: policy.prefixes,
  };
}

export function filterToolsForIntent(
  intent: string,
  tools: readonly unknown[],
  options: ToolFilterOptions = {},
): unknown[] {
  const policy = buildToolPolicy(intent);
  const extraAllowedTools = options.additionalAllowedTools ?? [];
  const policyAllowedSet = new Set([...policy.exact, ...extraAllowedTools]);
  const excludedToolNames = new Set(options.excludedToolNames ?? []);

  const filtered = tools.filter((tool) => {
    if (isHostedToolLike(tool)) {
      return false;
    }

    const name = getToolDefinitionName(tool);
    if (!name) {
      return options.allowNamelessTools === true;
    }

    if (excludedToolNames.has(name)) {
      return false;
    }

    if (policyAllowedSet.has(name)) {
      return true;
    }

    return policy.prefixes.some((prefix) => name.startsWith(prefix));
  });

  if (filtered.length > 0 || options.allowFallback !== true) {
    return filtered;
  }

  return [...tools];
}
