// --- Re-export all individual tools ---
export {
  getDealContext,
  createDeal,
  updateDealStatus,
  listDeals,
  addParcelToDeal,
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

// --- Agent-specific tool collections ---
import { getDealContext, createDeal, updateDealStatus, listDeals, addParcelToDeal } from "./dealTools.js";
import { createTask, updateTask, listTasks } from "./taskTools.js";
import { zoningMatrixLookup, parishPackLookup } from "./zoningTools.js";
import { evidenceSnapshot, floodZoneLookup, compareEvidenceHash } from "./evidenceTools.js";
import { parcelTriageScore, hardFilterCheck } from "./scoringTools.js";
import { addBuyer, searchBuyers, logOutreach } from "./buyerTools.js";

/** Tools available to the Coordinator agent. */
export const coordinatorTools = [
  getDealContext,
  listDeals,
  createDeal,
  updateDealStatus,
  createTask,
  updateTask,
  listTasks,
];

/** Tools available to the Legal / Entitlements agent. */
export const legalTools = [
  zoningMatrixLookup,
  parishPackLookup,
  getDealContext,
];

/** Tools available to the Research agent. */
export const researchTools = [
  evidenceSnapshot,
  getDealContext,
];

/** Tools available to the Risk agent. */
export const riskTools = [
  floodZoneLookup,
  evidenceSnapshot,
  compareEvidenceHash,
  getDealContext,
];

/** Tools available to the Finance agent. */
export const financeTools = [
  getDealContext,
];

/** Tools available to the Deal Screener agent. */
export const screenerTools = [
  parcelTriageScore,
  hardFilterCheck,
  getDealContext,
  addParcelToDeal,
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
];

/** Tools available to the Operations agent. */
export const operationsTools = [
  getDealContext,
  listTasks,
  createTask,
  updateTask,
];
