// --- Re-export all individual tools ---
export {
  getDealContext,
  createDeal,
  updateDealStatus,
  listDeals,
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

export {
  rpc as propertyDbRpc,
  searchParcels,
  getParcelDetails,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenTraffic,
  screenLdeq,
  screenFull,
} from "./propertyDbTools.js";

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

// --- Agent-specific tool collections ---
import { getDealContext, createDeal, updateDealStatus, listDeals, addParcelToDeal, updateParcel } from "./dealTools.js";
import { createTask, updateTask, listTasks } from "./taskTools.js";
import { zoningMatrixLookup, parishPackLookup } from "./zoningTools.js";
import { evidenceSnapshot, floodZoneLookup, compareEvidenceHash } from "./evidenceTools.js";
import { parcelTriageScore, hardFilterCheck } from "./scoringTools.js";
import { addBuyer, searchBuyers, logOutreach } from "./buyerTools.js";
import {
  searchParcels,
  getParcelDetails,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenTraffic,
  screenLdeq,
  screenFull,
} from "./propertyDbTools.js";
import {
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

/** Web search tool for Responses API pass-through. */
export const webSearchPreviewTool = {
  type: "web_search_preview" as const,
  search_context_size: "medium" as const,
};

/** Tools available to the Coordinator agent. */
export const coordinatorTools = [
  getDealContext,
  listDeals,
  createDeal,
  updateDealStatus,
  createTask,
  updateTask,
  listTasks,
  searchParcels,
  updateParcel,
];

/** Tools available to the Legal / Entitlements agent. */
export const legalTools = [
  zoningMatrixLookup,
  parishPackLookup,
  getDealContext,
  searchParcels,
  getParcelDetails,
];

/** Tools available to the Research agent. */
export const researchTools = [
  evidenceSnapshot,
  getDealContext,
  updateParcel,
  searchParcels,
  getParcelDetails,
  screenFull,
  screenTraffic,
  webSearchPreviewTool,
];

/** Tools available to the Risk agent. */
export const riskTools = [
  floodZoneLookup,
  evidenceSnapshot,
  compareEvidenceHash,
  getDealContext,
  searchParcels,
  getParcelDetails,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenLdeq,
  screenFull,
];

/** Tools available to the Finance agent. */
export const financeTools = [
  getDealContext,
  searchParcels,
  getParcelDetails,
  calculate_proforma,
  calculate_debt_sizing,
  calculate_development_budget,
];

/** Tools available to the Deal Screener agent. */
export const screenerTools = [
  parcelTriageScore,
  hardFilterCheck,
  getDealContext,
  addParcelToDeal,
  updateParcel,
  searchParcels,
  getParcelDetails,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenFull,
  webSearchPreviewTool,
];

/** Tools available to the Marketing / Dispositions agent. */
export const marketingTools = [
  searchBuyers,
  addBuyer,
  logOutreach,
  getDealContext,
];

/** Tools available to the Due Diligence agent. */
export const dueDiligenceTools = [
  getDealContext,
  evidenceSnapshot,
  floodZoneLookup,
  compareEvidenceHash,
  updateParcel,
  searchParcels,
  getParcelDetails,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenTraffic,
  screenLdeq,
  screenFull,
];

/** Tools available to the Entitlements agent. */
export const entitlementsTools = [
  zoningMatrixLookup,
  parishPackLookup,
  getDealContext,
  searchParcels,
  getParcelDetails,
  screenFlood,
];

/** Tools available to the Operations agent. */
export const operationsTools = [
  getDealContext,
  listTasks,
  createTask,
  updateTask,
  create_milestone_schedule,
  estimate_project_timeline,
];

/** Tools available to the Market Intel agent. */
export const marketIntelTools = [
  getDealContext,
  searchParcels,
  getParcelDetails,
  webSearchPreviewTool,
  search_comparable_sales,
  calculate_market_metrics,
];

/** Tools available to the Design agent. (#11 Dead Agent Revival) */
export const designTools = [
  getDealContext,
  searchParcels,
  getParcelDetails,
  zoningMatrixLookup,
  screenFlood,
  screenSoils,
  calculate_site_capacity,
  estimate_construction_cost,
];

/** Tools available to the Tax Strategist agent. (#11 Dead Agent Revival) */
export const taxTools = [
  getDealContext,
  searchParcels,
  getParcelDetails,
  webSearchPreviewTool,
  calculate_depreciation_schedule,
  calculate_cost_segregation_estimate,
  calculate_1031_deadlines,
];
