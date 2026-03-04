import "server-only";

/**
 * Tool Registry — maps tool names to their execute functions.
 *
 * This is the dispatch layer used by /api/agent/tools/execute to run
 * tools on behalf of the Cloudflare Worker. Each entry wraps an existing
 * tool from @entitlement-os/openai.
 *
 * Tools that need orgId/userId inject them from the server-validated auth
 * context, NOT from the request body (prevents privilege escalation).
 */

import {
  // Deal tools
  getDealContext,
  createDeal,
  updateDealStatus,
  listDeals,
  addParcelToDeal,
  updateParcel,
  get_rent_roll,
  model_capital_stack,
  stress_test_deal,
  model_exit_scenarios,
  recommend_entitlement_path,
  analyze_comparable_sales,
  optimize_debt_structure,
  estimate_phase_ii_scope,
  analyze_title_commitment,
  generate_zoning_compliance_checklist,

  // Task tools
  createTask,
  updateTask,
  listTasks,

  // Zoning tools
  zoningMatrixLookup,
  parishPackLookup,

  // Evidence tools
  evidenceSnapshot,
  floodZoneLookup,
  compareEvidenceHash,

  // Scoring tools
  parcelTriageScore,
  hardFilterCheck,

  // Buyer tools
  addBuyer,
  searchBuyers,
  logOutreach,

  // Artifact tools
  generate_artifact,

  // Property DB tools (gateway-routed, but included for completeness)
  searchParcels,
  getParcelDetails,
  screenZoning,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenTraffic,
  screenLdeq,
  screenFull,
  queryPropertyDb,
  queryPropertyDbSql,

  // Database tools
  query_org_sql,

  // Calculation tools
  calculate_proforma,
  calculate_debt_sizing,
  calculate_development_budget,
  calculate_site_capacity,
  estimate_construction_cost,
  create_milestone_schedule,
  estimate_project_timeline,
  calculate_depreciation_schedule,
  calculate_cost_segregation_estimate,
  calculate_1031_deadlines,
  search_comparable_sales,
  calculate_market_metrics,

  // Portfolio tools
  analyze_portfolio,

  // Canonical workflow tools
  get_jurisdiction_pack,
  create_tasks,
  attach_artifact,
  record_outcome,
  triage_deal,
  generate_dd_checklist,
  run_underwriting,
  summarize_comps,
  evaluate_run,

  // Market tools
  query_market_data,

  // Socrata / places tools
  queryBuildingPermits,
  searchNearbyPlaces,

  // Outcome tools
  get_historical_accuracy,
  record_deal_outcome,

  // Knowledge tools
  search_knowledge_base,
  store_knowledge_entry,

  // Context tools
  share_analysis_finding,
  get_shared_context,

  // Reasoning tools
  log_reasoning_trace,
  assess_uncertainty,
  request_reanalysis,

  // Entitlement intelligence tools
  predict_entitlement_path,
  get_entitlement_feature_primitives,
  get_entitlement_intelligence_kpis,

  // Document tools
  query_document_extractions,
  get_document_extraction_summary,
  compare_document_vs_deal_terms,

  // Property memory tools
  recall_property_intelligence,
  store_property_finding,

  // Memory tools (Phase 1 write gate)
  record_memory_event,
  get_entity_memory,
  store_memory,
  get_entity_truth,
  lookup_entity_by_address,
  ingest_comps,

  // Batch screening
  screenBatch,
} from "@entitlement-os/openai";

type ToolExecuteFn = (
  args: Record<string, unknown>,
  context: { orgId: string; userId: string; conversationId: string; dealId?: string },
) => Promise<unknown>;

/**
 * Wraps an @openai/agents tool() object into a simple execute function.
 *
 * The SDK's tool() returns objects with `.invoke(runContext, jsonInput, details)`
 * which parses the JSON string, validates via Zod, then calls the user's execute fn.
 * We inject orgId into the args before invoking.
 */
function wrapTool(agentTool: {
  name?: string;
  invoke?: (runContext: unknown, input: string, details?: unknown) => Promise<unknown>;
  [key: string]: unknown;
}): ToolExecuteFn {
  return async (args, context) => {
    if (!agentTool.invoke) {
      throw new Error(`Tool has no invoke function`);
    }
    // Inject orgId into args — most tools need it for multi-tenant scoping
    const enrichedArgs = { ...args, orgId: context.orgId };
    // Pass auth context as RunContext so memory tools can extract orgId/userId
    // for their internal HTTP calls (buildMemoryToolHeaders expects { context: { orgId, userId } })
    const runContext = { context: { orgId: context.orgId, userId: context.userId } };
    return agentTool.invoke(runContext, JSON.stringify(enrichedArgs), {});
  };
}

// Build the registry from all tool imports
const TOOLS: Array<{
  name?: string;
  invoke?: (runContext: unknown, input: string, details?: unknown) => Promise<unknown>;
  [key: string]: unknown;
}> = [
  getDealContext,
  createDeal,
  updateDealStatus,
  listDeals,
  addParcelToDeal,
  updateParcel,
  get_rent_roll,
  model_capital_stack,
  stress_test_deal,
  model_exit_scenarios,
  recommend_entitlement_path,
  analyze_comparable_sales,
  optimize_debt_structure,
  estimate_phase_ii_scope,
  analyze_title_commitment,
  generate_zoning_compliance_checklist,
  createTask,
  updateTask,
  listTasks,
  zoningMatrixLookup,
  parishPackLookup,
  evidenceSnapshot,
  floodZoneLookup,
  compareEvidenceHash,
  parcelTriageScore,
  hardFilterCheck,
  addBuyer,
  searchBuyers,
  logOutreach,
  generate_artifact,
  searchParcels,
  getParcelDetails,
  screenZoning,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenTraffic,
  screenLdeq,
  screenFull,
  queryPropertyDb,
  queryPropertyDbSql,
  query_org_sql,
  calculate_proforma,
  calculate_debt_sizing,
  calculate_development_budget,
  calculate_site_capacity,
  estimate_construction_cost,
  create_milestone_schedule,
  estimate_project_timeline,
  calculate_depreciation_schedule,
  calculate_cost_segregation_estimate,
  calculate_1031_deadlines,
  search_comparable_sales,
  calculate_market_metrics,
  analyze_portfolio,
  get_jurisdiction_pack,
  create_tasks,
  attach_artifact,
  record_outcome,
  triage_deal,
  generate_dd_checklist,
  run_underwriting,
  summarize_comps,
  evaluate_run,
  query_market_data,
  queryBuildingPermits,
  searchNearbyPlaces,
  get_historical_accuracy,
  record_deal_outcome,
  search_knowledge_base,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
  assess_uncertainty,
  request_reanalysis,
  predict_entitlement_path,
  get_entitlement_feature_primitives,
  get_entitlement_intelligence_kpis,
  recall_property_intelligence,
  store_property_finding,
  query_document_extractions,
  get_document_extraction_summary,
  compare_document_vs_deal_terms,
  record_memory_event,
  get_entity_memory,
  store_memory,
  get_entity_truth,
  lookup_entity_by_address,
  ingest_comps,
  screenBatch,
] as Array<{
  name?: string;
  invoke?: (runContext: unknown, input: string, details?: unknown) => Promise<unknown>;
  [key: string]: unknown;
}>;

export const toolRegistry: Record<string, ToolExecuteFn> = {};

for (const t of TOOLS) {
  if (t && typeof t === "object" && typeof t.name === "string" && typeof t.invoke === "function") {
    toolRegistry[t.name] = wrapTool(t);
  }
}

/**
 * Consult tools — run specialist agents via the Agents SDK `run()`.
 * When the CF Worker calls /api/agent/tools/execute with a consult tool,
 * we create the specialist agent and run it for a single turn with the input.
 */
const CONSULT_SPECIALIST_MAP: Record<string, string> = {
  consult_finance_specialist: "finance",
  consult_risk_specialist: "risk",
  consult_legal_specialist: "legal",
  consult_market_trajectory_specialist: "marketTrajectory",
};

for (const [toolName, specialistKey] of Object.entries(CONSULT_SPECIALIST_MAP)) {
  toolRegistry[toolName] = async (args: Record<string, unknown>) => {
    const input = typeof args.input === "string" ? args.input : JSON.stringify(args);
    try {
      // Lazy import to avoid circular deps and keep the registry lightweight
      const { createIntentAwareCoordinator, run } = await import("@entitlement-os/openai");
      const intent = specialistKey as Parameters<typeof createIntentAwareCoordinator>[0];
      const agent = createIntentAwareCoordinator(intent);
      const result = await run(agent, input, { maxTurns: 3 });
      return { result: result.finalOutput ?? "(No output from specialist)", status: "ok" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[consult] ${toolName} failed:`, message);
      return { result: `Specialist consultation failed: ${message}`, status: "error" };
    }
  };
}
