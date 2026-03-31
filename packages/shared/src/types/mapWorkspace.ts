export type MapWorkspaceStatus = "active" | "archived";

export type ContractAvailability = "available" | "fallback" | "unavailable";

export interface MapWorkspaceParcelSnapshot {
  parcelId: string;
  address: string;
  ownerName: string | null;
  mailingAddress: string | null;
  acreage: number | null;
  zoningCode: string | null;
  floodZone: string | null;
  lat: number | null;
  lng: number | null;
  metadata: Record<string, unknown>;
}

export interface MapWorkspaceTrackedParcel {
  parcelId: string;
  status: "to_analyze" | "active" | "blocked" | "complete";
  task: string | null;
  note: string | null;
  updatedAt: string;
}

export interface MapWorkspaceCompSnapshot {
  id: string;
  address: string;
  landUse: string | null;
  saleDate: string | null;
  salePrice: number | null;
  acreage: number | null;
  pricePerAcre: number | null;
  distanceMiles: number | null;
  adjustmentNotes: string[];
  adjustedPricePerAcre: number | null;
  weightedScore: number | null;
}

export interface MapWorkspaceAiOutputSnapshot {
  id: string;
  title: string;
  createdAt: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface MapWorkspaceOverlaySelection {
  key: string;
  enabled: boolean;
  status: ContractAvailability;
}

export interface MapWorkspaceRecord {
  id: string;
  orgId: string;
  dealId: string | null;
  name: string;
  summary: string | null;
  status: MapWorkspaceStatus;
  parcelCount: number;
  selectedParcelIds: string[];
  polygonCoordinates: number[][][] | null;
  notes: string | null;
  parcels: MapWorkspaceParcelSnapshot[];
  trackedParcels: MapWorkspaceTrackedParcel[];
  compSnapshots: MapWorkspaceCompSnapshot[];
  aiOutputs: MapWorkspaceAiOutputSnapshot[];
  overlays: MapWorkspaceOverlaySelection[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssemblageParcelNode {
  parcelId: string;
  ownerName: string | null;
  acreage: number | null;
  lat: number | null;
  lng: number | null;
}

export interface AssemblageAdjacencyEdge {
  fromParcelId: string;
  toParcelId: string;
  distanceFeet: number;
  adjacencyState: "adjacent" | "nearby" | "isolated";
}

export interface AssemblageOwnerCluster {
  ownerName: string;
  parcelIds: string[];
  combinedAcreage: number;
  mailingAddress: string | null;
}

export interface AssemblageSuggestion {
  id: string;
  label: string;
  parcelIds: string[];
  combinedAcreage: number;
  ownerCount: number;
  holdoutRisk: "low" | "moderate" | "high";
  rationale: string[];
}

export interface MapWorkspaceAssemblageAnalysis {
  workspaceId: string;
  availability: ContractAvailability;
  adjacencySource: "heuristic_distance" | "none";
  totalSelectedParcels: number;
  combinedAcreage: number;
  ownerClusters: MapWorkspaceOwnerRollup[];
  graph: {
    nodes: AssemblageParcelNode[];
    edges: AssemblageAdjacencyEdge[];
  };
  suggestions: AssemblageSuggestion[];
  generatedAt: string;
  fallbackReason: string | null;
}

export interface MapWorkspaceOwnerRollup {
  ownerName: string;
  parcelIds: string[];
  mailingAddress: string | null;
  portfolioCount: number;
  combinedAcreage: number;
  contactCompleteness: ContractAvailability;
}

export interface MapWorkspaceOutreachLog {
  id: string;
  workspaceId: string;
  ownerName: string;
  contactName: string | null;
  channel: "call" | "email" | "text" | "meeting" | "broker";
  status: "planned" | "attempted" | "completed" | "no_response" | "blocked";
  notes: string | null;
  nextContactAt: string | null;
  createdAt: string;
}

export interface MapWorkspaceOwnershipContract {
  workspaceId: string;
  availability: ContractAvailability;
  owners: MapWorkspaceOwnerRollup[];
  outreachLogs: MapWorkspaceOutreachLog[];
  skipTraceHook: {
    status: ContractAvailability;
    provider: string | null;
    message: string;
  };
  generatedAt: string;
  fallbackReason: string | null;
}

export interface MapWorkspaceCompIntelligence {
  workspaceId: string;
  availability: ContractAvailability;
  filters: {
    landUse: string | null;
    maxAgeMonths: number | null;
  };
  summary: {
    compCount: number;
    medianPricePerAcre: number | null;
    weightedPricePerAcre: number | null;
  };
  exportColumns: string[];
  comps: MapWorkspaceCompSnapshot[];
  underwritingHandoff: {
    status: ContractAvailability;
    assumptions: Record<string, number | string | null>;
    message: string;
  };
  generatedAt: string;
  fallbackReason: string | null;
}

export interface MapWorkspaceMarketOverlayItem {
  key:
    | "permits"
    | "deliveries"
    | "absorption"
    | "rent_comps"
    | "sale_comps"
    | "household_growth"
    | "income_growth"
    | "traffic_counts"
    | "utilities"
    | "flood_history"
    | "topography"
    | "road_frontage";
  label: string;
  status: ContractAvailability;
  source: string | null;
  summary: string;
  details: Record<string, unknown>;
}

export interface MapWorkspaceMarketOverlayContract {
  workspaceId: string;
  generatedAt: string;
  overlays: MapWorkspaceMarketOverlayItem[];
}
