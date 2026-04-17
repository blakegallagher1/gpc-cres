import { type Agent } from "@/types";

// NOTE: This file is used by client components.
// Avoid importing from `@entitlement-os/shared` root export here because it
// re-exports server/Node-only utilities (e.g., sha256 via `node:crypto`) that
// can break Next dev bundling in webpack mode.

const UNIFIED_AGENT_TOOLS: Agent["tools"] = [
  // Memory and knowledge tools
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
  // Data extraction and document processing
  {
    name: "run_data_extraction_workflow",
    description: "Collect and normalize critical documents for analysis.",
    parameters: {
      source: "deal|parcel",
      allowedFormats: ["pdf", "csv", "json"],
    },
  },
  // Finance tools
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
  // Legal and entitlement tools
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
  // Market and research tools
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
  {
    name: "analyze_market_workflow",
    description: "Run market workflow to compare directional demand signals.",
    parameters: {
      requiredInputs: ["region", "lookback_months"],
    },
  },
  // Risk and uncertainty assessment
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
  // Screening and triage
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
  // Due diligence
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
  // Design and site planning
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
  {
    name: "run_spatial_query",
    description:
      "Query parcel geometry, adjacency, and map overlays for spatial intelligence.",
    parameters: {
      requiredInputs: ["query", "viewport"],
    },
  },
  {
    name: "score_site_fit",
    description:
      "Score parcels against frontage, zoning, flood, and acreage fit criteria.",
    parameters: {
      requiredInputs: ["parcel_ids", "criteria"],
    },
  },
  {
    name: "find_assemblage_candidates",
    description:
      "Evaluate contiguous parcels for assemblage potential and holdout risk.",
    parameters: {
      requiredInputs: ["parcel_ids", "min_acres"],
    },
  },
  {
    name: "draft_site_plan",
    description:
      "Sketch a hypothetical site program from parcel geometry and unit mix assumptions.",
    parameters: {
      requiredInputs: ["parcel_ids", "program"],
    },
  },
  {
    name: "run_temporal_zoning_query",
    description:
      "Compare historical parcel, zoning, and overlay changes across time windows.",
    parameters: {
      requiredInputs: ["query", "start_date", "end_date"],
    },
  },
  // Operations and construction
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
  // Marketing and buyer management
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
];

const STATIC_AGENTS: Agent[] = [
  {
    id: "coordinator",
    name: "EntitlementOS Cartographer",
    model: "gpt-5.4",
    description:
      "Unified operator for entitlements, underwriting, and cartographer-grade spatial analysis across parcels, assemblage, and site planning.",
    handoffs: [],
  },
].map((agent) => ({
  ...agent,
  tools: UNIFIED_AGENT_TOOLS,
  config: {},
  status: "active" as const,
  run_count: 0,
  color: "#6366f1",
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
