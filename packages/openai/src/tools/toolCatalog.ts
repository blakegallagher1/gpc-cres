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

/**
 * Canonical tool catalog. Each entry describes routing, risk, and access policy.
 * Tool implementations live in their respective modules — this is metadata only.
 */
export const TOOL_CATALOG: Record<string, ToolCatalogEntry> = {
  // --- Deal management (local, write) ---
  getDealContext: { name: "getDealContext", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "finance", "legal", "risk", "research", "operations", "marketing", "dueDiligence", "screener", "entitlements", "design", "marketTrajectory", "tax", "marketIntel"] },
  createDeal: { name: "createDeal", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general"] },
  updateDealStatus: { name: "updateDealStatus", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general"] },
  listDeals: { name: "listDeals", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general"] },
  addParcelToDeal: { name: "addParcelToDeal", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general", "screener"] },
  updateParcel: { name: "updateParcel", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general", "research", "dueDiligence", "screener"] },

  // --- Task management (local, write) ---
  createTask: { name: "createTask", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general", "operations"] },
  updateTask: { name: "updateTask", destination: "local", risk: "write", quotaClass: "unlimited", intents: ["general", "operations"] },
  listTasks: { name: "listTasks", destination: "local", risk: "read", quotaClass: "unlimited", intents: ["general", "operations"] },

  // --- Property DB / screening (gateway, read) ---
  searchParcels: { name: "searchParcels", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "risk", "screener", "dueDiligence", "finance", "legal", "entitlements", "design", "marketTrajectory", "tax", "marketIntel"] },
  getParcelDetails: { name: "getParcelDetails", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "risk", "screener", "dueDiligence", "finance", "legal", "entitlements", "design", "marketTrajectory", "tax", "marketIntel"] },
  queryPropertyDb: { name: "queryPropertyDb", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "screener", "dueDiligence"] },
  queryPropertyDbSql: { name: "queryPropertyDbSql", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "screener", "dueDiligence"] },
  screenZoning: { name: "screenZoning", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "dueDiligence", "entitlements", "design"] },
  screenFlood: { name: "screenFlood", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "dueDiligence", "entitlements"] },
  screenSoils: { name: "screenSoils", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "dueDiligence", "design"] },
  screenWetlands: { name: "screenWetlands", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "dueDiligence"] },
  screenEpa: { name: "screenEpa", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "screener", "dueDiligence"] },
  screenTraffic: { name: "screenTraffic", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "dueDiligence"] },
  screenLdeq: { name: "screenLdeq", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "risk", "dueDiligence"] },
  screenFull: { name: "screenFull", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "risk", "screener", "dueDiligence"] },
  screenBatch: { name: "screenBatch", destination: "gateway", risk: "read", quotaClass: "unlimited", intents: ["general", "research", "dueDiligence"] },

  // --- Hosted tools (OpenAI-managed, metered) ---
  web_search_preview: { name: "web_search_preview", destination: "hosted", risk: "read", quotaClass: "metered", intents: ["general", "research", "marketIntel", "marketTrajectory"] },
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
  return TOOL_CATALOG[name]?.quotaClass === "metered";
}
