import { type Agent } from "@/types";

const AGENT_MODEL_IDS = {
  coordinator: "gpt-5.2",
  finance: "gpt-5.2",
  legal: "gpt-5.2",
  research: "gpt-5.2",
  risk: "gpt-5.1",
  screener: "gpt-5.1",
  dueDiligence: "gpt-5.1",
  entitlements: "gpt-5.1",
  design: "gpt-5.1",
  operations: "gpt-5.1",
  marketing: "gpt-5.1",
  tax: "gpt-5.1",
  marketIntel: "gpt-5.1",
} as const;

const AGENT_COLORS: Record<string, string> = {
  coordinator: "#6366f1",
  finance: "#22c55e",
  legal: "#f59e0b",
  research: "#3b82f6",
  risk: "#ef4444",
  screener: "#8b5cf6",
  "due-diligence": "#06b6d4",
  entitlements: "#f97316",
  design: "#ec4899",
  operations: "#14b8a6",
  marketing: "#a855f7",
  tax: "#eab308",
  "market-intel": "#0ea5e9",
};

const TOOL_DESCRIPTION: Record<string, string> = {
  get_deal_context: "Load deal context and metadata from the workspace",
  create_deal: "Create a new deal and initialize operational tracking",
  update_deal_status: "Update deal lifecycle status and stage",
  list_deals: "List filtered and sortable deal records",
  add_parcel_to_deal: "Attach parcels to an active transaction",
  screen_parcels: "Run parcel eligibility and zoning screening checks",
  screen_zoning: "Run parcel-level zoning eligibility checks",
  screen_flood: "Resolve flood-zone risk and elevation constraints",
  screen_soils: "Screen soils, utilities, and environmental constraints",
  screen_wetlands: "Check wetlands flags and permitting constraints",
  screen_epa: "Query EPA environmental restrictions",
  screen_full: "Run an end-to-end parcel screening workflow",
  search_parcels: "Search parcels with geometric and attribute filters",
  query_property_db: "Run raw property-db queries for research and screening",
  get_parcel_details: "Fetch parcel core attributes and source references",
  calculate_proforma: "Build pro forma economics and return metrics",
  calculate_debt_sizing: "Size debt structures for underwriting and acquisition",
  calculate_development_budget: "Generate development cost and capex estimates",
  calculate_market_metrics: "Compute comparable market-level metrics",
  search_comparable_sales: "Pull comparable sales for underwriting context",
  get_document_extraction_summary: "Summarize uploaded document extractions by type",
  query_document_extractions: "Retrieve detailed document extraction payloads",
  compare_document_vs_deal_terms: "Compare deal assumptions to source documents",
  create_task: "Create operational or diligence tasks for teams",
  update_task: "Update task status and assignees",
  list_tasks: "Review task queues for active workflow management",
  triage_deal: "Run first-pass scoring and triage recommendations",
  get_area_summary: "Summarize local planning and market context",
  get_poi_density: "Return point-of-interest density signals",
  search_nearby_places: "Search nearby amenities and traffic drivers",
  analyze_market_workflow: "Run a market-analysis workflow when local tooling is available",
  run_underwriting_workflow: "Execute underwriting workflow templates",
  run_data_extraction_workflow: "Run deep market data extraction workflow",
  query_building_permits: "Lookup historical and active building permits",
  predict_entitlement_path: "Forecast entitlement route and approval probability",
  get_entitlement_feature_primitives: "Load entitlement feature-level metadata",
  get_entitlement_intelligence_kpis: "Load entitlement KPI diagnostics and confidence",
  run_underwriting: "Run underwriting execution path for a deal",
  evaluate_run: "Evaluate run quality and confidence outcomes",
  parcel_triage_score: "Compute screening score for parcel candidates",
  get_historical_accuracy: "Retrieve bias and forecast correction history",
  store_memory_entry: "Store enterprise memory for future retrieval",
  get_shared_context: "Load shared context from previous analyses",
  share_analysis_finding: "Publish analysis findings to shared memory",
  record_memory_event: "Record key reasoning artifacts",
  get_entity_memory: "Load entity-specific memory facts",
  lookup_entity_by_address: "Resolve records by postal address",
  calculate_1031_deadlines: "Compute 1031 timing and extension calculations",
  calculate_cost_segregation_estimate: "Run cost-segregation and recovery estimates",
  search_knowledge_base: "Search institutional knowledge and precedents",
  query_market_data: "Query market data providers for current signals",
  add_buyer: "Create new buyer records",
  search_buyers: "Find and match buyer records",
  log_outreach: "Track outreach communications and follow-up history",
  create_artifact: "Generate artifacts for artifacts-driven outputs",
  capital_stack_optimization: "Draft capital stack optimization recommendations",
  capital_disposition_analysis: "Analyze exit and disposition scenarios",
};

type ToolCatalogName = keyof typeof TOOL_DESCRIPTION;

const TOOL_BY_INTENT: Record<string, ToolCatalogName[]> = {
  coordinator: [
    "get_deal_context",
    "create_deal",
    "list_deals",
    "update_deal_status",
    "triage_deal",
    "add_parcel_to_deal",
    "search_parcels",
    "get_area_summary",
    "search_knowledge_base",
  ],
  finance: [
    "get_deal_context",
    "calculate_proforma",
    "calculate_debt_sizing",
    "calculate_market_metrics",
    "search_comparable_sales",
    "run_underwriting",
    "evaluate_run",
    "get_historical_accuracy",
    "query_market_data",
  ],
  legal: [
    "list_deals",
    "triage_deal",
    "analyze_parcel",  // keep as placeholder for tool aliases in runtime
    "search_building_permits",
    "get_entitlement_feature_primitives",
    "get_shared_context",
  ] as const,
  research: [
    "search_parcels",
    "get_parcel_details",
    "query_property_db",
    "search_comparable_sales",
    "search_nearby_places",
    "query_market_data",
    "search_knowledge_base",
  ],
  risk: [
    "screen_flood",
    "screen_soils",
    "screen_epa",
    "screen_wetlands",
    "screen_full",
    "get_historical_accuracy",
    "get_entity_memory",
  ],
  screener: [
    "search_parcels",
    "parcel_triage_score",
    "hardFilterCheck",
    "query_property_db",
    "screen_parcels",
  ],
  "due-diligence": [
    "get_document_extraction_summary",
    "query_document_extractions",
    "compare_document_vs_deal_terms",
    "get_parcel_details",
    "run_underwriting",
    "evaluate_run",
  ],
  entitlements: [
    "predict_entitlement_path",
    "get_area_summary",
    "query_building_permits",
    "search_building_permits",
    "screen_zoning",
    "get_entitlement_intelligence_kpis",
  ],
  design: [
    "search_nearby_places",
    "get_area_summary",
    "get_poi_density",
    "zoningMatrixLookup",
    "parcel_triage_score",
  ],
  operations: [
    "create_task",
    "update_task",
    "list_tasks",
    "run_underwriting_workflow",
    "analyze_market_workflow",
    "query_market_data",
  ],
  marketing: [
    "add_buyer",
    "search_buyers",
    "log_outreach",
    "search_knowledge_base",
    "query_market_data",
  ],
  tax: [
    "calculate_1031_deadlines",
    "calculate_depreciation_schedule",
    "calculate_cost_segregation_estimate",
    "search_comparable_sales",
    "calculate_market_metrics",
  ],
  "market-intel": [
    "search_comparable_sales",
    "calculate_market_metrics",
    "query_market_data",
    "search_knowledge_base",
    "get_area_summary",
  ],
};

const LEGACY_TOOL_NAME_ALIASES: Record<string, string> = {
  analyze_parcel: "screen_zoning",
  search_building_permits: "query_building_permits",
  zoningMatrixLookup: "zoning_matrix_lookup",
  run_underwriting_workflow: "run_underwriting",
  analyze_market_workflow: "run_data_extraction_workflow",
  hardFilterCheck: "hard_filter_check",
  analyze_parcel: "screen_zoning",
  create_artifact: "generate_artifact",
};

function createAgentTools(toolNames: readonly string[]): Agent["tools"] {
  const seen = new Set<string>();
  return toolNames
    .map((name) => LEGACY_TOOL_NAME_ALIASES[name] ?? name)
    .filter((name): name is ToolCatalogName =>
      Object.prototype.hasOwnProperty.call(TOOL_DESCRIPTION, name) && !seen.has(name) && seen.add(name),
    )
    .map((name) => ({
      name,
      description: TOOL_DESCRIPTION[name],
      parameters: {},
    }));
}

function withTools(staticAgent: {
  id: string;
  tools: string[];
  handoffs: string[];
}) {
  return {
    ...staticAgent,
    tools: createAgentTools(staticAgent.tools),
  };
}

const AGENTS_WITH_TOOLS: Array<{
  id: string;
  tools: string[];
  handoffs: string[];
}> = [
  {
    id: "coordinator",
    handoffs: ["finance", "legal", "research", "risk", "screener", "due-diligence", "entitlements", "design", "operations", "marketing", "tax", "market-intel"],
    tools: TOOL_BY_INTENT.coordinator,
  },
  {
    id: "finance",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT.finance,
  },
  {
    id: "legal",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT.legal,
  },
  {
    id: "research",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT.research,
  },
  {
    id: "risk",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT.risk,
  },
  {
    id: "screener",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT.screener,
  },
  {
    id: "due-diligence",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT["due-diligence"],
  },
  {
    id: "entitlements",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT.entitlements,
  },
  {
    id: "design",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT.design,
  },
  {
    id: "operations",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT.operations,
  },
  {
    id: "marketing",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT.marketing,
  },
  {
    id: "tax",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT.tax,
  },
  {
    id: "market-intel",
    handoffs: ["coordinator"],
    tools: TOOL_BY_INTENT["market-intel"],
  },
];

const AGENTS_WITH_TOOL_CONFIG = AGENTS_WITH_TOOLS.map((agent) => ({
  id: agent.id,
  name: agent.id === "due-diligence"
    ? "Due Diligence"
    : agent.id === "market-intel"
      ? "Market Intel"
      : agent.id.replace(/(^|-)\w/g, (match) => match.toUpperCase()).replace(/-/g, " "),
  description:
    agent.id === "coordinator"
      ? "Routes to specialists, manages deal context"
      : agent.id === "finance"
        ? "Pro formas, debt sizing, IRR/equity analysis"
        : agent.id === "legal"
          ? "Zoning, entitlements, Louisiana civil law"
          : agent.id === "research"
            ? "Land scouting, market analysis, comps"
            : agent.id === "risk"
              ? "Flood, environmental, financial, regulatory risk"
              : agent.id === "screener"
                ? "Triage scoring (KILL/HOLD/ADVANCE)"
                : agent.id === "due-diligence"
                  ? "Phase checklists, red flags, document tracking"
                  : agent.id === "entitlements"
                    ? "Permit tracking, CUP/rezoning paths"
                    : agent.id === "design"
                      ? "Site planning, density optimization"
                      : agent.id === "operations"
                        ? "Construction scheduling, budgets"
                        : agent.id === "marketing"
                          ? "Buyer outreach, leasing strategy"
                          : agent.id === "tax"
                            ? "IRC 1031, depreciation, cost segregation"
                            : "Competitor tracking, absorption trends",
  model: AGENT_MODEL_IDS[agent.id as keyof typeof AGENT_MODEL_IDS],
  handoffs: agent.handoffs,
  tools: createAgentTools(agent.tools),
  config: {},
  status: "active" as const,
  run_count: 0,
  color: AGENT_COLORS[agent.id],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  system_prompt: "",
}));

export function useAgents() {
  return {
    agents: AGENTS_WITH_TOOL_CONFIG,
    isLoading: false,
    isError: false,
    mutate: () => Promise.resolve(undefined),
  };
}
