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
 * Consult tools are handled differently — they invoke agent.asTool() at runtime
 * in the Agents SDK. For the Worker, these route to Vercel which re-invokes the
 * specialist agent via createConfiguredCoordinator(). This is a simplified version
 * that runs the specialist agent for a single turn.
 */
// Consult tools placeholder — implemented as pass-through to the existing
// agent workflow when the Worker calls /api/agent/tools/execute with these names.
// The full implementation will be wired in a follow-up.
for (const name of [
  "consult_finance_specialist",
  "consult_risk_specialist",
  "consult_legal_specialist",
  "consult_market_trajectory_specialist",
]) {
  toolRegistry[name] = async (args, context) => {
    // TODO: Wire to specialist agent run via createIntentAwareCoordinator
    return {
      result: `Consult tool '${name}' is not yet wired for remote execution. Input: ${JSON.stringify(args).slice(0, 200)}`,
      status: "stub",
    };
  };
}
