import * as hostedTools from "./hostedTools.js";
import * as dealTools from "./dealTools.js";
import * as taskTools from "./taskTools.js";
import * as zoningTools from "./zoningTools.js";
import * as evidenceTools from "./evidenceTools.js";
import * as scoringTools from "./scoringTools.js";
import * as buyerTools from "./buyerTools.js";
import * as artifactTools from "./artifactTools.js";
import * as propertyDbTools from "./propertyDbTools.js";
import * as databaseTools from "./databaseTools.js";
import * as calculationTools from "./calculationTools.js";
import * as portfolioTools from "./portfolioTools.js";
import * as canonicalWorkflowTools from "./canonicalWorkflowTools.js";
import * as marketTools from "./marketTools.js";
import * as socrataTools from "./socrataTools.js";
import * as placesTools from "./placesTools.js";
import * as googleMapsTools from "./googleMapsTools.js";
import * as outcomeTools from "./outcomeTools.js";
import * as knowledgeTools from "./knowledgeTools.js";
import * as proceduralMemoryTools from "./proceduralMemoryTools.js";
import * as contextTools from "./contextTools.js";
import * as reasoningTools from "./reasoningTools.js";
import * as entitlementIntelligenceTools from "./entitlementIntelligenceTools.js";
import * as documentTools from "./documentTools.js";
import * as propertyMemoryTools from "./propertyMemoryTools.js";
import * as memoryTools from "./memoryTools.js";
import * as shellWorkflowTools from "./shellWorkflowTools.js";
import * as acquisitionTools from "./acquisitions/index.js";
import * as assetManagementTools from "./asset-mgmt/index.js";
import * as capitalMarketsTools from "./capital-markets/index.js";
import * as parcelSetTools from "./parcelSetTools.js";
import * as spatialTools from "./spatialTools.js";
import * as browserTools from "./browserTools.js";
import * as perplexityTools from "./perplexityTools.js";
import * as cartographerToolsDefs from "./cartographerTools.js";
import { TOOL_REGISTRY } from "./toolRegistry.js";
import { sortToolsByName } from "../utils/toolStability.js";

export {
  getDealContext,
  createDeal,
  updateDealStatus,
  listDeals,
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
  addParcelToDeal,
  updateParcel,
} from "./dealTools.js";

export { createTask, updateTask, listTasks } from "./taskTools.js";

export { zoningMatrixLookup, parishPackLookup } from "./zoningTools.js";

export {
  evidenceSnapshot,
  floodZoneLookup,
  compareEvidenceHash,
} from "./evidenceTools.js";

export { parcelTriageScore, hardFilterCheck } from "./scoringTools.js";

export { addBuyer, searchBuyers, logOutreach } from "./buyerTools.js";

export { generate_artifact } from "./artifactTools.js";

export {
  rpc as propertyDbRpc,
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
  screenBatch,
  queryPropertyDb,
  queryPropertyDbSql,
} from "./propertyDbTools.js";
export { query_org_sql } from "./databaseTools.js";

export {
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
} from "./calculationTools.js";

export { analyze_portfolio } from "./portfolioTools.js";

export {
  get_jurisdiction_pack,
  create_tasks,
  attach_artifact,
  record_outcome,
  triage_deal,
  generate_dd_checklist,
  run_underwriting,
  summarize_comps,
  evaluate_run,
} from "./canonicalWorkflowTools.js";

export { query_market_data } from "./marketTools.js";

export { queryBuildingPermits } from "./socrataTools.js";
export { searchNearbyPlaces } from "./placesTools.js";
export { get_area_summary, get_poi_density } from "./googleMapsTools.js";

export { get_historical_accuracy, record_deal_outcome } from "./outcomeTools.js";

export { search_knowledge_base, store_knowledge_entry } from "./knowledgeTools.js";
export {
  search_procedural_skills,
  search_similar_episodes,
} from "./proceduralMemoryTools.js";

export {
  share_analysis_finding,
  get_shared_context,
} from "./contextTools.js";

export {
  log_reasoning_trace,
  assess_uncertainty,
  request_reanalysis,
} from "./reasoningTools.js";
export {
  hostedWebSearchPreviewTool,
  hostedFileSearchTool,
} from "./hostedTools.js";
export {
  predict_entitlement_path,
  get_entitlement_feature_primitives,
  get_entitlement_intelligence_kpis,
} from "./entitlementIntelligenceTools.js";
export {
  query_document_extractions,
  get_document_extraction_summary,
  compare_document_vs_deal_terms,
  search_document_content,
} from "./documentTools.js";

export {
  recall_property_intelligence,
  store_property_finding,
} from "./propertyMemoryTools.js";

export {
  record_memory_event,
  get_entity_memory,
  store_memory,
  get_entity_truth,
  lookup_entity_by_address,
  ingest_comps,
} from "./memoryTools.js";

export {
  analyze_market_workflow,
  run_data_extraction_workflow,
  run_underwriting_workflow,
} from "./shellWorkflowTools.js";
export {
  acquisition_dcf_analysis,
  acquisition_cap_rate_evaluation,
  acquisition_rent_roll_analysis,
  acquisition_internal_comparable_sales,
  acquisition_investment_returns,
} from "./acquisitions/index.js";
export {
  asset_lease_admin_summary,
  asset_tenant_exposure_analysis,
  asset_noi_optimization_plan,
  asset_capital_plan_summary,
  asset_operations_health,
} from "./asset-mgmt/index.js";
export {
  capital_debt_sizing_overview,
  capital_lender_outreach_brief,
  capital_disposition_analysis,
  capital_refinance_scenarios,
  capital_stack_optimization,
} from "./capital-markets/index.js";

export {
  describeParcelSet,
  listParcelSets,
} from "./parcelSetTools.js";

export {
  create_issue,
  list_issues,
  get_pr_status,
  list_recent_commits,
  get_deployment_status,
  list_deployments,
  get_build_logs,
  list_env_vars,
  check_tunnel_health,
  purge_cache,
  get_hyperdrive_status,
  list_workers,
  lookup_flood_risk,
  get_flood_zone,
  get_flood_insurance_quote,
  githubPluginTools,
  vercelPluginTools,
  cloudflarePluginTools,
  neptuneFloodTools,
  opsPluginTools,
  allPluginTools,
} from "./pluginTools.js";

export { browser_task } from "./browserTools.js";
export {
  perplexity_web_research,
  perplexity_structured_extract,
  perplexity_deep_research,
  perplexity_quick_lookup,
} from "./perplexityTools.js";

export {
  spatial_query,
  fit_score,
  find_assemblage,
  draft_site_plan,
  temporal_query,
  cartographerTools,
} from "./cartographerTools.js";

const {
  hostedFileSearchTool,
  hostedWebSearchPreviewTool,
} = hostedTools;

const {
  getDealContext,
  createDeal,
  updateDealStatus,
  listDeals,
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
  addParcelToDeal,
  updateParcel,
} = dealTools;
const { createTask, updateTask, listTasks } = taskTools;
const { zoningMatrixLookup, parishPackLookup } = zoningTools;
const { evidenceSnapshot, floodZoneLookup, compareEvidenceHash } = evidenceTools;
const { parcelTriageScore, hardFilterCheck } = scoringTools;
const { addBuyer, searchBuyers, logOutreach } = buyerTools;
const { generate_artifact } = artifactTools;
const {
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
  screenBatch,
  queryPropertyDbSql,
} = propertyDbTools;
const { query_org_sql } = databaseTools;
const {
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
} = calculationTools;
const { analyze_portfolio } = portfolioTools;
const { query_market_data } = marketTools;
const { queryBuildingPermits } = socrataTools;
const { searchNearbyPlaces } = placesTools;
const { get_area_summary, get_poi_density } = googleMapsTools;
const {
  get_jurisdiction_pack,
  create_tasks,
  attach_artifact,
  record_outcome,
  triage_deal,
  generate_dd_checklist,
  run_underwriting,
  summarize_comps,
  evaluate_run,
} = canonicalWorkflowTools;
const { get_historical_accuracy, record_deal_outcome } = outcomeTools;
const { search_knowledge_base, store_knowledge_entry } = knowledgeTools;
const { search_procedural_skills, search_similar_episodes } = proceduralMemoryTools;
const { share_analysis_finding, get_shared_context } = contextTools;
const { log_reasoning_trace, assess_uncertainty, request_reanalysis } = reasoningTools;
const {
  predict_entitlement_path,
  get_entitlement_feature_primitives,
  get_entitlement_intelligence_kpis,
} = entitlementIntelligenceTools;
const {
  query_document_extractions,
  get_document_extraction_summary,
  compare_document_vs_deal_terms,
  search_document_content,
} = documentTools;
const {
  recall_property_intelligence,
  store_property_finding,
} = propertyMemoryTools;
const {
  record_memory_event,
  get_entity_memory,
  store_memory,
  get_entity_truth,
  lookup_entity_by_address,
  ingest_comps,
} = memoryTools;
const {
  analyze_market_workflow,
  run_data_extraction_workflow,
  run_underwriting_workflow,
} = shellWorkflowTools;
const {
  acquisition_dcf_analysis,
  acquisition_cap_rate_evaluation,
  acquisition_rent_roll_analysis,
  acquisition_internal_comparable_sales,
  acquisition_investment_returns,
} = acquisitionTools;
const {
  asset_lease_admin_summary,
  asset_tenant_exposure_analysis,
  asset_noi_optimization_plan,
  asset_capital_plan_summary,
  asset_operations_health,
} = assetManagementTools;
const {
  capital_debt_sizing_overview,
  capital_lender_outreach_brief,
  capital_disposition_analysis,
  capital_refinance_scenarios,
  capital_stack_optimization,
} = capitalMarketsTools;
const {
  describeParcelSet,
  listParcelSets,
} = parcelSetTools;
const { computeDriveTimeArea } = spatialTools;
const { browser_task } = browserTools;
const {
  perplexity_web_research,
  perplexity_structured_extract,
  perplexity_deep_research,
  perplexity_quick_lookup,
} = perplexityTools;
const {
  spatial_query,
  fit_score,
  find_assemblage,
  draft_site_plan,
  temporal_query,
} = cartographerToolsDefs;
const { allPluginTools: registeredPluginTools } = TOOL_REGISTRY;

// --- Agent-specific tool collections ---

/** Web search tool for Responses API pass-through. */
export const webSearchPreviewTool = hostedWebSearchPreviewTool;

/** Tools available to the Coordinator agent. */
export const coordinatorTools = [
  query_org_sql,
  getDealContext,
  listDeals,
  createDeal,
  updateDealStatus,
  createTask,
  updateTask,
  listTasks,
  searchParcels,
  getParcelDetails,
  updateParcel,
  generate_artifact,
  record_memory_event,
  get_entity_memory,
  store_memory,
  get_entity_truth,
  lookup_entity_by_address,
  ingest_comps,
  search_knowledge_base,
  search_procedural_skills,
  search_similar_episodes,
  store_knowledge_entry,
  get_shared_context,
  share_analysis_finding,
  assess_uncertainty,
  request_reanalysis,
  record_deal_outcome,
  log_reasoning_trace,
  recommend_entitlement_path,
  analyze_comparable_sales,
  optimize_debt_structure,
  estimate_phase_ii_scope,
  analyze_title_commitment,
  generate_zoning_compliance_checklist,
  predict_entitlement_path,
  get_entitlement_feature_primitives,
  get_entitlement_intelligence_kpis,
  get_jurisdiction_pack,
  create_tasks,
  attach_artifact,
  record_outcome,
  triage_deal,
  generate_dd_checklist,
  run_underwriting,
  summarize_comps,
  evaluate_run,
  screenZoning,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenTraffic,
  screenLdeq,
  screenFull,
  screenBatch,
  // queryPropertyDb removed — strictly inferior to queryPropertyDbSql,
  // agent kept picking it despite routing rules and tool policy exclusion.
  queryPropertyDbSql,
  computeDriveTimeArea,
  get_area_summary,
  get_poi_density,
  query_document_extractions,
  get_document_extraction_summary,
  compare_document_vs_deal_terms,
  search_document_content,
  run_underwriting_workflow,
  describeParcelSet,
  listParcelSets,
];

/** Tools available to the Legal / Entitlements agent. */
export const legalTools = [
  zoningMatrixLookup,
  parishPackLookup,
  analyze_title_commitment,
  getDealContext,
  searchParcels,
  getParcelDetails,
  generate_artifact,
  search_knowledge_base,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
  predict_entitlement_path,
  get_entitlement_feature_primitives,
  get_entitlement_intelligence_kpis,
  query_document_extractions,
];

/** Tools available to the Research agent. */
export const researchTools = [
  evidenceSnapshot,
  getDealContext,
  updateParcel,
  searchParcels,
  getParcelDetails,
  screenFull,
  screenBatch,
  screenTraffic,
  analyze_comparable_sales,
  query_market_data,
  get_area_summary,
  get_poi_density,
  run_data_extraction_workflow,
  search_knowledge_base,
  search_procedural_skills,
  search_similar_episodes,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
  predict_entitlement_path,
  get_entitlement_feature_primitives,
  get_entitlement_intelligence_kpis,
  queryPropertyDbSql,
];

/** Tools available to the Risk agent. */
export const riskTools = [
  floodZoneLookup,
  evidenceSnapshot,
  compareEvidenceHash,
  getDealContext,
  searchParcels,
  getParcelDetails,
  screenZoning,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenLdeq,
  screenFull,
  search_knowledge_base,
  search_procedural_skills,
  search_similar_episodes,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  assess_uncertainty,
  log_reasoning_trace,
  query_document_extractions,
];

/** Tools available to the Finance agent. */
export const financeTools = [
  getDealContext,
  searchParcels,
  getParcelDetails,
  calculate_proforma,
  calculate_debt_sizing,
  calculate_development_budget,
  get_rent_roll,
  model_capital_stack,
  stress_test_deal,
  optimize_debt_structure,
  model_exit_scenarios,
  generate_artifact,
  analyze_portfolio,
  get_historical_accuracy,
  record_deal_outcome,
  search_knowledge_base,
  search_procedural_skills,
  search_similar_episodes,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  assess_uncertainty,
  log_reasoning_trace,
  query_document_extractions,
  get_document_extraction_summary,
  compare_document_vs_deal_terms,
  search_document_content,
];

/** Tools available to the Deal Screener agent. */
export const screenerTools = [
  parcelTriageScore,
  hardFilterCheck,
  get_area_summary,
  get_poi_density,
  getDealContext,
  addParcelToDeal,
  updateParcel,
  searchParcels,
  getParcelDetails,
  screenZoning,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenFull,
  search_knowledge_base,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  assess_uncertainty,
  log_reasoning_trace,
  queryPropertyDbSql,
  recall_property_intelligence,
];

/** Tools available to the Marketing / Dispositions agent. */
export const marketingTools = [
  searchBuyers,
  addBuyer,
  logOutreach,
  getDealContext,
  generate_artifact,
  search_knowledge_base,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
];

/** Tools available to the Due Diligence agent. */
export const dueDiligenceTools = [
  getDealContext,
  get_area_summary,
  evidenceSnapshot,
  floodZoneLookup,
  compareEvidenceHash,
  updateParcel,
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
  screenBatch,
  estimate_phase_ii_scope,
  search_knowledge_base,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
  query_document_extractions,
  get_document_extraction_summary,
  compare_document_vs_deal_terms,
  search_document_content,
  recall_property_intelligence,
  store_property_finding,
  run_data_extraction_workflow,
];

/** Tools available to the Entitlements agent. */
export const entitlementsTools = [
  zoningMatrixLookup,
  parishPackLookup,
  getDealContext,
  searchParcels,
  getParcelDetails,
  screenZoning,
  screenFlood,
  recommend_entitlement_path,
  generate_zoning_compliance_checklist,
  predict_entitlement_path,
  get_entitlement_feature_primitives,
  get_entitlement_intelligence_kpis,
  search_knowledge_base,
  search_procedural_skills,
  search_similar_episodes,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
];

/** Tools available to the Operations agent. */
export const operationsTools = [
  getDealContext,
  listTasks,
  createTask,
  updateTask,
  create_milestone_schedule,
  estimate_project_timeline,
  search_knowledge_base,
  search_procedural_skills,
  search_similar_episodes,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
];

/** Tools available to the Market Intel agent. */
export const marketIntelTools = [
  getDealContext,
  get_area_summary,
  get_poi_density,
  searchParcels,
  getParcelDetails,
  search_comparable_sales,
  calculate_market_metrics,
  query_market_data,
  analyze_market_workflow,
  search_knowledge_base,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
];

/** Tools available to the Design agent. (#11 Dead Agent Revival) */
export const designTools = [
  getDealContext,
  searchParcels,
  getParcelDetails,
  zoningMatrixLookup,
  screenZoning,
  screenFlood,
  screenSoils,
  calculate_site_capacity,
  estimate_construction_cost,
  search_knowledge_base,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
];

/** Tools available to the Market Trajectory agent. (#14) */
export const marketTrajectoryTools = [
  queryBuildingPermits,
  searchNearbyPlaces,
  get_area_summary,
  get_poi_density,
  getDealContext,
  searchParcels,
  getParcelDetails,
  search_knowledge_base,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
  query_market_data,
  search_comparable_sales,
  analyze_market_workflow,
  perplexity_web_research,
  perplexity_structured_extract,
];

/** Tools available to the Tax Strategist agent. (#11 Dead Agent Revival) */
export const taxTools = [
  getDealContext,
  searchParcels,
  getParcelDetails,
  calculate_depreciation_schedule,
  calculate_cost_segregation_estimate,
  calculate_1031_deadlines,
  search_knowledge_base,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
];

/**
 * EntitlementOS — Single unified agent with all tools (~115 unique tools).
 * Replaces the 17-agent (coordinator + 16 specialists) architecture.
 * All tools are deduplicated by name into this single array for the unified agent.
 */
export const entitlementOsTools = (() => {
  const toolMap = new Map<string, unknown>();
  const getToolName = (tool: unknown): string => {
    if (typeof tool !== "object" || tool === null) {
      return "unknown";
    }

    const candidate = tool as {
      name?: unknown;
      function?: {
        name?: unknown;
      };
    };

    if (typeof candidate.function?.name === "string") {
      return candidate.function.name;
    }

    if (typeof candidate.name === "string") {
      return candidate.name;
    }

    return "unknown";
  };

  // Base coordinator tools (comprehensive set)
  [
    query_org_sql,
    getDealContext,
    listDeals,
    createDeal,
    updateDealStatus,
    createTask,
    updateTask,
    listTasks,
    searchParcels,
    getParcelDetails,
    updateParcel,
    generate_artifact,
    record_memory_event,
    get_entity_memory,
    store_memory,
    get_entity_truth,
    lookup_entity_by_address,
    ingest_comps,
    search_knowledge_base,
    search_procedural_skills,
    search_similar_episodes,
    store_knowledge_entry,
    get_shared_context,
    share_analysis_finding,
    assess_uncertainty,
    request_reanalysis,
    record_deal_outcome,
    log_reasoning_trace,
    recommend_entitlement_path,
    analyze_comparable_sales,
    optimize_debt_structure,
    estimate_phase_ii_scope,
    analyze_title_commitment,
    generate_zoning_compliance_checklist,
    predict_entitlement_path,
    get_entitlement_feature_primitives,
    get_entitlement_intelligence_kpis,
    get_jurisdiction_pack,
    create_tasks,
    attach_artifact,
    record_outcome,
    triage_deal,
    generate_dd_checklist,
    run_underwriting,
    summarize_comps,
    evaluate_run,
    screenZoning,
    screenFlood,
    screenSoils,
    screenWetlands,
    screenEpa,
    screenTraffic,
    screenLdeq,
    screenFull,
    screenBatch,
    queryPropertyDbSql,
    computeDriveTimeArea,
    get_area_summary,
    get_poi_density,
    query_document_extractions,
    get_document_extraction_summary,
    compare_document_vs_deal_terms,
    search_document_content,
    run_underwriting_workflow,
    describeParcelSet,
    listParcelSets,
    // Legal/Entitlements-specific
    zoningMatrixLookup,
    parishPackLookup,
    // Research-specific
    evidenceSnapshot,
    run_data_extraction_workflow,
    // Risk-specific
    floodZoneLookup,
    compareEvidenceHash,
    // Finance-specific
    calculate_proforma,
    calculate_debt_sizing,
    calculate_development_budget,
    get_rent_roll,
    model_capital_stack,
    stress_test_deal,
    model_exit_scenarios,
    analyze_portfolio,
    get_historical_accuracy,
    // Screener-specific
    parcelTriageScore,
    hardFilterCheck,
    addParcelToDeal,
    recall_property_intelligence,
    // Marketing/Dispositions-specific
    searchBuyers,
    addBuyer,
    logOutreach,
    // Due Diligence-specific
    store_property_finding,
    // Operations-specific
    create_milestone_schedule,
    estimate_project_timeline,
    // Market Intel-specific
    search_comparable_sales,
    calculate_market_metrics,
    query_market_data,
    analyze_market_workflow,
    // Design-specific
    calculate_site_capacity,
    estimate_construction_cost,
    // Market Trajectory-specific
    queryBuildingPermits,
    searchNearbyPlaces,
    // Tax-specific
    calculate_depreciation_schedule,
    calculate_cost_segregation_estimate,
    calculate_1031_deadlines,
    // Browser/CUA-specific
    browser_task,
    // Perplexity web research
    perplexity_quick_lookup,
    perplexity_web_research,
    perplexity_structured_extract,
    perplexity_deep_research,
    // Acquisition/Asset/Capital Markets tools
    acquisition_dcf_analysis,
    acquisition_cap_rate_evaluation,
    acquisition_rent_roll_analysis,
    acquisition_internal_comparable_sales,
    acquisition_investment_returns,
    asset_lease_admin_summary,
    asset_tenant_exposure_analysis,
    asset_noi_optimization_plan,
    asset_capital_plan_summary,
    asset_operations_health,
    capital_debt_sizing_overview,
    capital_lender_outreach_brief,
    capital_disposition_analysis,
    capital_refinance_scenarios,
    capital_stack_optimization,
    // Cartographer / Map intelligence tools
    spatial_query,
    fit_score,
    find_assemblage,
    draft_site_plan,
    temporal_query,
  ].forEach((tool) => {
    toolMap.set(getToolName(tool), tool);
  });

  return sortToolsByName(Array.from(toolMap.values()) as Parameters<typeof sortToolsByName>[0]);
})();

/**
 * Canonical grouped export of all agent tool arrays.
 *
 * This keeps a single source of truth for tool collection membership
 * in call sites that need "all tools across agents" (for example
 * route-level registry builders in apps/web).
 *
 * @deprecated — Specialist tool arrays are now deprecated. Use entitlementOsTools for the unified agent.
 */
export const ALL_AGENT_TOOL_GROUPS = {
  coordinatorTools,
  legalTools,
  researchTools,
  riskTools,
  financeTools,
  screenerTools,
  marketingTools,
  dueDiligenceTools,
  entitlementsTools,
  operationsTools,
  marketIntelTools,
  designTools,
  marketTrajectoryTools,
  taxTools,
} as const;

export const ALL_AGENT_TOOLS = Object.freeze(
  [
    ...Object.values(ALL_AGENT_TOOL_GROUPS).flat(),
    ...registeredPluginTools,
    perplexity_quick_lookup,
    perplexity_deep_research,
    acquisition_dcf_analysis,
    acquisition_cap_rate_evaluation,
    acquisition_rent_roll_analysis,
    acquisition_internal_comparable_sales,
    acquisition_investment_returns,
    asset_lease_admin_summary,
    asset_tenant_exposure_analysis,
    asset_noi_optimization_plan,
    asset_capital_plan_summary,
    asset_operations_health,
    capital_debt_sizing_overview,
    capital_lender_outreach_brief,
    capital_disposition_analysis,
    capital_refinance_scenarios,
    capital_stack_optimization,
  ],
);

/**
 * Optional hosted file-search tool export for future vector-store wiring.
 * Not yet enabled on agents until store IDs and indexing pipelines are configured.
 */
export const fileSearchTool = hostedFileSearchTool;

/**
 * All function tools available to the coordinator, used by the build-time
 * export script (`infra/cloudflare-agent/scripts/export-tools.ts`) to generate
 * static JSON schemas for the Cloudflare Worker.
 *
 * This includes coordinatorTools plus consult tool stubs.  The actual consult
 * tool implementations use `agent.asTool()` at runtime which is unavailable
 * in the Worker — the Worker just sends these schemas to OpenAI and routes
 * the resulting function_call to Vercel for execution.
 */
export const ALL_COORDINATOR_TOOL_OBJECTS = coordinatorTools;

export {
  TOOL_CATALOG,
  TOOL_NAME_ALIASES,
  resolveToolName,
  resolveToolCatalogEntry,
  getToolsForIntent,
  getGatewayTools,
  getHostedTools,
  isMeteredTool,
} from "./toolCatalog.js";
export type {
  ToolCatalogEntry,
  ToolDestination,
  ToolRiskLevel,
  ToolQuotaClass,
} from "./toolCatalog.js";

export {
  isMcpGatewayEnabled,
  isGoogleMapsGroundingLiteEnabled,
  getMcpEligibleTools,
  buildMcpServerTool,
  buildGoogleMapsMcpServerTool,
  resolveToolTransport,
} from "./mcpGatewayAdapter.js";

export {
  checkHostedToolQuota,
  recordHostedToolUsage,
  getHostedToolUsage,
  resetConversationQuota,
  _resetAllQuotas,
} from "./hostedToolQuota.js";
