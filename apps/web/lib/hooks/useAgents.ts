import { type Agent } from "@/types";

// NOTE: This file is used by client components.
// Avoid importing from `@entitlement-os/shared` root export here because it
// re-exports server/Node-only utilities (e.g., sha256 via `node:crypto`) that
// can break Next dev bundling in webpack mode.
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

const COMMON_TOOLS: Agent["tools"] = [
  {
    name: "search_knowledge_base",
    description: "Search internal knowledge and evidence repositories.",
    parameters: {
      requiredInputs: ["query"],
      output: "knowledge_snippets",
    },
  },
  {
    name: "store_knowledge_entry",
    description: "Persist verified findings and source evidence for reuse.",
    parameters: {
      requiredInputs: ["payload", "source_type", "source_id"],
    },
  },
  {
    name: "search_similar_episodes",
    description: "Retrieve historical similar run episodes for precedence.",
    parameters: {
      requiredInputs: ["query", "limit"],
    },
  },
  {
    name: "record_memory_event",
    description: "Capture key outcomes and signal events from run execution.",
    parameters: {
      requiredInputs: ["event_name", "payload"],
      scope: "run|deal",
    },
  },
];

const AGENT_TOOLS_BY_ID: Record<string, Agent["tools"]> = {
  coordinator: [
    ...COMMON_TOOLS,
    {
      name: "consult_finance_specialist",
      description:
        "Route finance-focused subproblems to the Finance specialist.",
      parameters: {
        requiredInputs: ["query"],
      },
    },
    {
      name: "consult_legal_specialist",
      description: "Route legal and zoning questions to the Legal specialist.",
      parameters: {
        requiredInputs: ["query", "jurisdiction"],
      },
    },
    {
      name: "run_data_extraction_workflow",
      description: "Collect and normalize critical documents for analysis.",
      parameters: {
        source: "deal|parcel",
        allowedFormats: ["pdf", "csv", "json"],
      },
    },
  ],
  finance: [
    ...COMMON_TOOLS,
    {
      name: "calculate_debt_sizing",
      description: "Generate debt sizing scenarios and repayment profiles.",
      parameters: {
        requiredInputs: ["deal_id", "rates", "constraints"],
      },
    },
    {
      name: "run_underwriting",
      description: "Execute finance underwriting workflow from a deal context.",
      parameters: {
        requiredInputs: ["deal_id"],
      },
    },
  ],
  legal: [
    ...COMMON_TOOLS,
    {
      name: "screen_full",
      description: "Run full entitlement and compliance screening.",
      parameters: {
        requiredInputs: ["parcel_id", "jurisdiction"],
      },
    },
    {
      name: "analyze_title_commitment",
      description: "Evaluate title and deed constraints for risk framing.",
      parameters: {
        requiredInputs: ["title_packet", "jurisdiction"],
      },
    },
  ],
  research: [
    ...COMMON_TOOLS,
    {
      name: "query_market_data",
      description: "Pull market trend context for demand and pricing assumptions.",
      parameters: {
        requiredInputs: ["market", "horizon_days"],
      },
    },
    {
      name: "searchNearbyPlaces",
      description: "Inspect nearby points of interest around a parcel.",
      parameters: {
        requiredInputs: ["parcel_id", "radius_m"],
      },
    },
  ],
  risk: [
    ...COMMON_TOOLS,
    {
      name: "lookup_flood_risk",
      description: "Check flood and hazard risk overlays.",
      parameters: {
        requiredInputs: ["parcel_uid"],
      },
    },
    {
      name: "assess_uncertainty",
      description: "Model confidence and uncertainty around findings.",
      parameters: {
        requiredInputs: ["hypothesis", "evidence_count"],
      },
    },
  ],
  screener: [
    ...COMMON_TOOLS,
    {
      name: "parcelTriageScore",
      description: "Generate a triage score to prioritize intake candidates.",
      parameters: {
        requiredInputs: ["parcel_id"],
      },
    },
    {
      name: "hardFilterCheck",
      description: "Apply hard rule filters before downstream routing.",
      parameters: {
        requiredInputs: ["parcel_id", "constraints"],
      },
    },
  ],
  "due-diligence": [
    ...COMMON_TOOLS,
    {
      name: "generate_dd_checklist",
      description: "Prepare due-diligence checklists for the active deal.",
      parameters: {
        requiredInputs: ["deal_id"],
      },
    },
    {
      name: "triage_deal",
      description: "Prioritize open tasks and immediate risk blockers.",
      parameters: {
        requiredInputs: ["deal_id"],
      },
    },
  ],
  entitlements: [
    ...COMMON_TOOLS,
    {
      name: "predict_entitlement_path",
      description:
        "Estimate likely entitlement pathway, requirements, and timing.",
      parameters: {
        requiredInputs: ["parcel_id", "jurisdiction", "intended_use"],
      },
    },
    {
      name: "screen_zoning",
      description: "Screen parcel with zoning-specific gate checks.",
      parameters: {
        requiredInputs: ["parcel_id"],
      },
    },
  ],
  design: [
    ...COMMON_TOOLS,
    {
      name: "get_area_summary",
      description:
        "Pull area-level context to guide density and layout assumptions.",
      parameters: {
        requiredInputs: ["parcel_id", "radius_miles"],
      },
    },
    {
      name: "get_poi_density",
      description:
        "Assess nearby points of interest to support access and occupancy planning.",
      parameters: {
        requiredInputs: ["parcel_id", "radius_m"],
      },
    },
  ],
  operations: [
    ...COMMON_TOOLS,
    {
      name: "create_milestone_schedule",
      description: "Build a phased construction and permitting milestone schedule.",
      parameters: {
        requiredInputs: ["project_scope", "target_rent_date"],
      },
    },
    {
      name: "estimate_project_timeline",
      description: "Estimate permitting and schedule durations from scope inputs.",
      parameters: {
        requiredInputs: ["scope", "contractors"],
      },
    },
  ],
  marketing: [
    ...COMMON_TOOLS,
    {
      name: "addBuyer",
      description: "Register and track buyer contact candidates.",
      parameters: {
        requiredInputs: ["name", "contact", "deal_id"],
      },
    },
    {
      name: "logOutreach",
      description: "Track outbound outreach touches and outcomes.",
      parameters: {
        requiredInputs: ["buyer_id", "channel", "notes"],
      },
    },
  ],
  tax: [
    ...COMMON_TOOLS,
    {
      name: "calculate_depreciation_schedule",
      description:
        "Compute depreciation schedules and tax recovery timing.",
      parameters: {
        requiredInputs: ["assets", "holding_period_years"],
      },
    },
    {
      name: "calculate_1031_deadlines",
      description: "Estimate 1031 exchange and exchange-window deadlines.",
      parameters: {
        requiredInputs: ["close_date", "target_exchange_date"],
      },
    },
  ],
  "market-intel": [
    ...COMMON_TOOLS,
    {
      name: "analyze_market_workflow",
      description: "Run market workflow to compare directional demand signals.",
      parameters: {
        requiredInputs: ["region", "lookback_months"],
      },
    },
    {
      name: "query_market_data",
      description: "Retrieve market trend snapshots for selected geographies.",
      parameters: {
        requiredInputs: ["market", "radius_miles"],
      },
    },
  ],
};

const STATIC_AGENTS: Agent[] = [
  {
    id: "coordinator",
    name: "Coordinator",
    model: AGENT_MODEL_IDS.coordinator,
    description: "Routes to specialists, manages deal context",
    handoffs: [
      "finance",
      "legal",
      "research",
      "risk",
      "screener",
      "due-diligence",
      "entitlements",
      "design",
      "operations",
      "marketing",
      "tax",
      "market-intel",
    ],
  },
  { id: "finance", name: "Finance", model: AGENT_MODEL_IDS.finance, description: "Pro formas, debt sizing, IRR/equity analysis", handoffs: ["coordinator"] },
  { id: "legal", name: "Legal", model: AGENT_MODEL_IDS.legal, description: "Zoning, entitlements, Louisiana civil law", handoffs: ["coordinator"] },
  { id: "research", name: "Research", model: AGENT_MODEL_IDS.research, description: "Land scouting, market analysis, comps", handoffs: ["coordinator"] },
  { id: "risk", name: "Risk", model: AGENT_MODEL_IDS.risk, description: "Flood, environmental, financial, regulatory risk", handoffs: ["coordinator"] },
  { id: "screener", name: "Screener", model: AGENT_MODEL_IDS.screener, description: "Triage scoring (KILL/HOLD/ADVANCE)", handoffs: ["coordinator"] },
  { id: "due-diligence", name: "Due Diligence", model: AGENT_MODEL_IDS.dueDiligence, description: "Phase checklists, red flags, document tracking", handoffs: ["coordinator"] },
  { id: "entitlements", name: "Entitlements", model: AGENT_MODEL_IDS.entitlements, description: "Permit tracking, CUP/rezoning paths", handoffs: ["coordinator"] },
  { id: "design", name: "Design", model: AGENT_MODEL_IDS.design, description: "Site planning, density optimization", handoffs: ["coordinator"] },
  { id: "operations", name: "Operations", model: AGENT_MODEL_IDS.operations, description: "Construction scheduling, budgets", handoffs: ["coordinator"] },
  { id: "marketing", name: "Marketing", model: AGENT_MODEL_IDS.marketing, description: "Buyer outreach, leasing strategy", handoffs: ["coordinator"] },
  { id: "tax", name: "Tax Strategist", model: AGENT_MODEL_IDS.tax, description: "IRC 1031, depreciation, cost segregation", handoffs: ["coordinator"] },
  {
    id: "market-intel",
    name: "Market Intel",
    model: AGENT_MODEL_IDS.marketIntel,
    description: "Competitor tracking, absorption trends",
    handoffs: ["coordinator"],
  },
].map((agent) => ({
  ...agent,
  tools: AGENT_TOOLS_BY_ID[agent.id] ?? COMMON_TOOLS,
  config: {},
  status: "active" as const,
  run_count: 0,
  color: AGENT_COLORS[agent.id],
  system_prompt: "",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));

export function useAgents() {
  return {
    agents: STATIC_AGENTS,
    isLoading: false,
    isError: false,
    mutate: () => Promise.resolve(undefined),
  };
}
