/**
 * Tool Catalog — canonical metadata for all tools in the system.
 * Single source of truth for tool routing, risk classification, and quota policy.
 */

export type ToolDestination = "local" | "gateway" | "hosted" | "mcp";
export type ToolRiskLevel = "read" | "write" | "destructive";
export type ToolQuotaClass = "unlimited" | "metered" | "rateLimited";

export interface ToolCatalogEntry {
  name: string;
  destination: ToolDestination;
  risk: ToolRiskLevel;
  quotaClass: ToolQuotaClass;
  /** Agent intents that should have access to this tool */
  intents: string[];
}

const COMMON_INTENTS = [
  "general",
  "finance",
  "legal",
  "risk",
  "research",
  "operations",
  "marketing",
  "due_diligence",
  "screener",
  "entitlements",
  "design",
  "market_trajectory",
  "market_intel",
  "tax",
];

export const TOOL_NAME_ALIASES: Record<string, string> = {
  getDealContext: "get_deal_context",
  createDeal: "create_deal",
  updateDealStatus: "update_deal_status",
  listDeals: "list_deals",
  addParcelToDeal: "add_parcel_to_deal",
  updateParcel: "update_parcel",
  createTask: "create_task",
  updateTask: "update_task",
  listTasks: "list_tasks",

  searchParcels: "search_parcels",
  getParcelDetails: "get_parcel_details",
  queryPropertyDb: "query_property_db",
  queryPropertyDbSql: "query_property_db_sql",
  screenZoning: "screen_zoning",
  screenFlood: "screen_flood",
  screenSoils: "screen_soils",
  screenWetlands: "screen_wetlands",
  screenEpa: "screen_epa",
  screenTraffic: "screen_traffic",
  screenLdeq: "screen_ldeq",
  screenFull: "screen_full",
  screenBatch: "screen_batch",

  searchNearbyPlaces: "search_nearby_places",
  parcelTriageScore: "parcel_triage_score",
  hardFilterCheck: "hard_filter_check",
  addBuyer: "add_buyer",
  searchBuyers: "search_buyers",
  logOutreach: "log_outreach",
  get_rent_roll: "get_rent_roll",
  model_capital_stack: "model_capital_stack",
  stress_test_deal: "stress_test_deal",
  model_exit_scenarios: "model_exit_scenarios",
  recommend_entitlement_path: "recommend_entitlement_path",
  analyze_comparable_sales: "analyze_comparable_sales",
  optimize_debt_structure: "optimize_debt_structure",
  estimate_phase_ii_scope: "estimate_phase_ii_scope",
  analyze_title_commitment: "analyze_title_commitment",
  generate_zoning_compliance_checklist: "generate_zoning_compliance_checklist",

  calculate_proforma: "calculate_proforma",
  calculate_debt_sizing: "calculate_debt_sizing",
  calculate_development_budget: "calculate_development_budget",
  calculate_site_capacity: "calculate_site_capacity",
  estimate_construction_cost: "estimate_construction_cost",
  create_milestone_schedule: "create_milestone_schedule",
  estimate_project_timeline: "estimate_project_timeline",
  calculate_depreciation_schedule: "calculate_depreciation_schedule",
  calculate_cost_segregation_estimate: "calculate_cost_segregation_estimate",
  calculate_1031_deadlines: "calculate_1031_deadlines",
  search_comparable_sales: "search_comparable_sales",
  calculate_market_metrics: "calculate_market_metrics",

  get_jurisdiction_pack: "get_jurisdiction_pack",
  create_tasks: "create_tasks",
  attach_artifact: "attach_artifact",
  record_outcome: "record_outcome",
  triage_deal: "triage_deal",
  generate_dd_checklist: "generate_dd_checklist",
  run_underwriting: "run_underwriting",
  summarize_comps: "summarize_comps",
  evaluate_run: "evaluate_run",

  floodZoneLookup: "flood_zone_lookup",
  compareEvidenceHash: "compare_evidence_hash",
  evidenceSnapshot: "evidence_snapshot",
  query_market_data: "query_market_data",
  queryBuildingPermits: "query_building_permits",
  get_historical_accuracy: "get_historical_accuracy",
  record_deal_outcome: "record_deal_outcome",
  store_knowledge_entry: "store_knowledge_entry",
  share_analysis_finding: "share_analysis_finding",
  get_shared_context: "get_shared_context",
  log_reasoning_trace: "log_reasoning_trace",
  assess_uncertainty: "assess_uncertainty",
  request_reanalysis: "request_reanalysis",

  query_document_extractions: "query_document_extractions",
  get_document_extraction_summary: "get_document_extraction_summary",
  compare_document_vs_deal_terms: "compare_document_vs_deal_terms",

  predict_entitlement_path: "predict_entitlement_path",
  get_entitlement_feature_primitives: "get_entitlement_feature_primitives",
  get_entitlement_intelligence_kpis: "get_entitlement_intelligence_kpis",
  zoningMatrixLookup: "zoning_matrix_lookup",
  parishPackLookup: "parish_pack_lookup",

  record_memory_event: "record_memory_event",
  get_entity_memory: "get_entity_memory",
  get_entity_truth: "get_entity_truth",
  ingest_comps: "ingest_comps",
  lookup_entity_by_address: "lookup_entity_by_address",
  store_memory: "store_memory",

  hostedWebSearchPreviewTool: "web_search_preview",
  hostedFileSearchTool: "file_search",
  runUnderwritingWorkflow: "run_underwriting_workflow",
  runDataExtractionWorkflow: "run_data_extraction_workflow",
  analyzeMarketWorkflow: "analyze_market_workflow",
  create_artifact: "generate_artifact",
  createArtifact: "generate_artifact",
  createArtifactTool: "generate_artifact",
};

export function resolveToolName(toolName: string): string {
  const trimmedToolName = toolName.trim();
  return TOOL_NAME_ALIASES[trimmedToolName] ?? trimmedToolName;
}

export function resolveToolCatalogEntry(toolName: string): ToolCatalogEntry | undefined {
  if (!toolName) return undefined;
  const canonicalName = resolveToolName(toolName);
  return TOOL_CATALOG[canonicalName];
}

/**
 * Canonical tool catalog. Each entry describes routing, risk, and access policy.
 * Tool implementations live in their respective modules — this is metadata only.
 */
export const TOOL_CATALOG: Record<string, ToolCatalogEntry> = {
  // --- Deal management (local, write) ---
  get_deal_context: { name: "get_deal_context", destination: "local", risk: "read", quotaClass: "unlimited", intents: [...COMMON_INTENTS] },
  create_deal: { name: "create_deal", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general"] },
  update_deal_status: { name: "update_deal_status", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general"] },
  list_deals: { name: "list_deals", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general"] },
  add_parcel_to_deal: { name: "add_parcel_to_deal", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general", "screener"] },
  update_parcel: { name: "update_parcel", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general", "research", "due_diligence", "screener"] },

  // --- Task management (local, write) ---
  create_task: { name: "create_task", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general", "operations"] },
  update_task: { name: "update_task", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general", "operations"] },
  list_tasks: { name: "list_tasks", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "operations"] },

  // --- General calculation/analysis (local, read) ---
  calculate_proforma: { name: "calculate_proforma", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance"] },
  calculate_debt_sizing: { name: "calculate_debt_sizing", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance"] },
  calculate_development_budget: { name: "calculate_development_budget", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance"] },
  calculate_site_capacity: { name: "calculate_site_capacity", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance"] },
  estimate_construction_cost: { name: "estimate_construction_cost", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance"] },
  create_milestone_schedule: { name: "create_milestone_schedule", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance", "operations"] },
  estimate_project_timeline: { name: "estimate_project_timeline", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance", "operations"] },
  calculate_depreciation_schedule: { name: "calculate_depreciation_schedule", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance", "tax"] },
  calculate_cost_segregation_estimate: { name: "calculate_cost_segregation_estimate", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance", "tax"] },
  calculate_1031_deadlines: { name: "calculate_1031_deadlines", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "tax", "finance"] },
  search_comparable_sales: { name: "search_comparable_sales", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["research", "market_intel", "finance"] },
  calculate_market_metrics: { name: "calculate_market_metrics", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "market_intel", "market_trajectory"] },

  // --- Property DB / screening (gateway, read) ---
  search_parcels: { name: "search_parcels", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "risk", "screener", "due_diligence", "finance", "legal", "entitlements", "design", "market_trajectory", "tax", "market_intel"] },
  get_parcel_details: { name: "get_parcel_details", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "risk", "screener", "due_diligence", "finance", "legal", "entitlements", "design", "market_trajectory", "tax", "market_intel"] },
  query_property_db: { name: "query_property_db", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "screener", "due_diligence", "finance", "risk"] },
  query_property_db_sql: { name: "query_property_db_sql", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "screener", "due_diligence", "finance", "risk"] },
  screen_zoning: { name: "screen_zoning", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "due_diligence", "entitlements", "design"] },
  screen_flood: { name: "screen_flood", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "due_diligence", "entitlements", "market_trajectory"] },
  screen_soils: { name: "screen_soils", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "due_diligence", "design"] },
  screen_wetlands: { name: "screen_wetlands", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "due_diligence"] },
  screen_epa: { name: "screen_epa", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "due_diligence"] },
  screen_traffic: { name: "screen_traffic", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "due_diligence", "finance"] },
  screen_ldeq: { name: "screen_ldeq", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "due_diligence", "entitlements"] },
  screen_full: { name: "screen_full", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "risk", "screener", "due_diligence", "finance"] },
  screen_batch: { name: "screen_batch", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "due_diligence", "screener", "finance", "risk", "market_intel"] },
  search_nearby_places: { name: "search_nearby_places", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "market_intel", "research"] },
  flood_zone_lookup: { name: "flood_zone_lookup", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "due_diligence", "entitlements"] },
  query_building_permits: { name: "query_building_permits", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "entitlements", "legal", "research"] },
  zoning_matrix_lookup: { name: "zoning_matrix_lookup", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "entitlements", "design", "legal", "risk"] },
  parish_pack_lookup: { name: "parish_pack_lookup", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "entitlements", "legal", "research"] },
  evidence_snapshot: { name: "evidence_snapshot", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "risk", "legal", "due_diligence", "finance"] },
  parcel_triage_score: { name: "parcel_triage_score", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "screener", "finance", "risk"] },
  hard_filter_check: { name: "hard_filter_check", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "screener", "finance", "risk"] },
  search_knowledge_base: { name: "search_knowledge_base", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "market_intel", "legal", "finance"] },
  compare_evidence_hash: { name: "compare_evidence_hash", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["research", "risk", "legal"] },
  analyze_title_commitment: { name: "analyze_title_commitment", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["legal", "due_diligence", "entitlements"] },
  generate_zoning_compliance_checklist: { name: "generate_zoning_compliance_checklist", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["design", "entitlements", "legal"] },
  predict_entitlement_path: { name: "predict_entitlement_path", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["entitlements", "legal", "research"] },
  get_entitlement_feature_primitives: { name: "get_entitlement_feature_primitives", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["entitlements", "research", "general"] },
  get_entitlement_intelligence_kpis: { name: "get_entitlement_intelligence_kpis", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["entitlements", "research", "market_intel"] },
  add_buyer: { name: "add_buyer", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["general", "marketing", "finance"] },
  search_buyers: { name: "search_buyers", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "finance", "market_intel"] },
  log_outreach: { name: "log_outreach", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["general", "marketing", "finance"] },
  get_jurisdiction_pack: { name: "get_jurisdiction_pack", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["entitlements", "legal", "due_diligence"] },
  query_market_data: { name: "query_market_data", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["market_intel", "market_trajectory", "finance", "research"] },
  get_document_extraction_summary: { name: "get_document_extraction_summary", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["legal", "research", "due_diligence", "finance"] },
  compare_document_vs_deal_terms: { name: "compare_document_vs_deal_terms", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["legal", "finance", "due_diligence"] },
  query_document_extractions: { name: "query_document_extractions", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["legal", "research", "finance"] },
  get_historical_accuracy: { name: "get_historical_accuracy", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "screener", "finance", "risk"] },
  record_deal_outcome: { name: "record_deal_outcome", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["general", "screener", "finance", "operations"] },
  get_shared_context: { name: "get_shared_context", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "finance", "screener"] },
  share_analysis_finding: { name: "share_analysis_finding", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["general", "research", "finance", "risk"] },
  assess_uncertainty: { name: "assess_uncertainty", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "risk", "finance"] },
  log_reasoning_trace: { name: "log_reasoning_trace", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "finance", "risk"] },
  request_reanalysis: { name: "request_reanalysis", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "finance", "risk"] },
  get_rent_roll: { name: "get_rent_roll", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["finance", "due_diligence", "screener"] },
  model_capital_stack: { name: "model_capital_stack", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["finance", "due_diligence", "screener"] },
  stress_test_deal: { name: "stress_test_deal", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["finance", "due_diligence", "screener"] },
  model_exit_scenarios: { name: "model_exit_scenarios", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["finance", "due_diligence", "screener"] },
  optimize_debt_structure: { name: "optimize_debt_structure", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["finance", "screener"] },
  estimate_phase_ii_scope: { name: "estimate_phase_ii_scope", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["entitlements", "design", "due_diligence"] },
  record_memory_event: { name: "record_memory_event", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["general", "research", "finance", "risk"] },
  get_entity_memory: { name: "get_entity_memory", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "finance", "risk", "legal", "due_diligence"] },
  get_entity_truth: { name: "get_entity_truth", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "finance", "risk", "legal", "due_diligence"] },
  lookup_entity_by_address: { name: "lookup_entity_by_address", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "legal", "risk", "due_diligence"] },
  store_memory: { name: "store_memory", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["general", "research", "finance", "risk"] },
  ingest_comps: { name: "ingest_comps", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["research", "market_intel", "finance"] },
  store_property_finding: { name: "store_property_finding", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["research", "screener", "risk", "due_diligence"] },
  recall_property_intelligence: { name: "recall_property_intelligence", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["research", "market_intel", "screener", "risk"] },
  analyze_comparable_sales: { name: "analyze_comparable_sales", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["finance", "research", "market_intel"] },
  run_underwriting: { name: "run_underwriting", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["finance", "due_diligence", "screener"] },
  summarize_comps: { name: "summarize_comps", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["finance", "market_intel", "screener"] },
  evaluate_run: { name: "evaluate_run", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["finance", "due_diligence", "screener"] },
  create_tasks: { name: "create_tasks", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["operations", "general"] },
  attach_artifact: { name: "attach_artifact", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["general", "finance", "due_diligence"] },
  triage_deal: { name: "triage_deal", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["screener", "risk", "finance"] },
  generate_dd_checklist: { name: "generate_dd_checklist", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["due_diligence", "legal", "finance"] },
  record_outcome: { name: "record_outcome", destination: "gateway", risk: "write", quotaClass: "unlimited", intents: ["operations", "general", "due_diligence"] },
  query_org_sql: { name: "query_org_sql", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "due_diligence", "finance", "risk"] },

  // --- Shell workflow tools (local, read) ---
  generate_artifact: { name: "generate_artifact", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance", "screener"] },
  analyze_market_workflow: { name: "analyze_market_workflow", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["market_trajectory", "market_intel", "finance", "general"] },
  run_underwriting_workflow: { name: "run_underwriting_workflow", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["finance", "due_diligence", "general"] },
  run_data_extraction_workflow: { name: "run_data_extraction_workflow", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["research", "due_diligence", "general", "market_intel"] },

  // --- Hosted tools (OpenAI-managed, metered) ---
  web_search_preview: { name: "web_search_preview", destination: "hosted", risk: "read", quotaClass: "metered", intents: ["general", "research", "market_intel", "market_trajectory"] },
  file_search: { name: "file_search", destination: "hosted", risk: "read", quotaClass: "metered", intents: ["general", "research"] },

  // --- Specialist consult (local, read — delegates to specialist agent) ---
  consult_finance_specialist: { name: "consult_finance_specialist", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general"] },
  consult_risk_specialist: { name: "consult_risk_specialist", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general"] },
  consult_legal_specialist: { name: "consult_legal_specialist", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general"] },
  consult_market_trajectory_specialist: { name: "consult_market_trajectory_specialist", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general"] },
};

/** Get catalog entries for a specific intent (agent role). */
export function getToolsForIntent(intent: string): ToolCatalogEntry[] {
  return Object.values(TOOL_CATALOG).filter((entry) =>
    entry.intents.includes(intent),
  );
}

/** Get all gateway-routed tools. */
export function getGatewayTools(): ToolCatalogEntry[] {
  return Object.values(TOOL_CATALOG).filter((e) => e.destination === "gateway");
}

/** Get all hosted tools. */
export function getHostedTools(): ToolCatalogEntry[] {
  return Object.values(TOOL_CATALOG).filter((e) => e.destination === "hosted");
}

/** Check if a tool is metered (has quota limits). */
export function isMeteredTool(name: string): boolean {
  const entry = resolveToolCatalogEntry(name);
  return entry?.quotaClass === "metered";
}
