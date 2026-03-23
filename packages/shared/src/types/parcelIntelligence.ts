// Spatial scope definitions for parcel queries
export type SpatialScope =
  | { kind: "bbox"; bounds: [number, number, number, number] }
  | { kind: "polygon"; coordinates: number[][][] }
  | { kind: "radius"; center: [number, number]; radiusMeters: number };

// Origin of a parcel set
export type ParcelSetOrigin =
  | { kind: "viewport"; spatial: SpatialScope }
  | { kind: "selection"; parcelIds: string[]; source: "map" | "deal" | "agent" }
  | { kind: "query"; filters: ParcelFilter[]; sql?: string }
  | { kind: "spatial"; spatial: SpatialScope; filters?: ParcelFilter[] }
  | { kind: "refinement"; parentSetId: string; operation: SetOperation }
  | { kind: "saved"; persistedId: string };

// Lifecycle status of a parcel set
export type ParcelSetStatus = "unresolved" | "resolving" | "materialized" | "stale" | "failed";

// Lifecycle policy for a parcel set
export type ParcelSetLifecycle =
  | { kind: "ephemeral"; scope: "request" | "conversation" }
  | { kind: "persistent"; persistedId: string; createdAt: string; updatedAt: string };

// Definition of a parcel set
export interface ParcelSetDefinition {
  id: string;
  orgId: string;
  label: string | null;
  origin: ParcelSetOrigin;
  lifecycle: ParcelSetLifecycle;
  status: ParcelSetStatus;
  createdAt: string;
  metadata: Record<string, unknown>;
}

// Core facts about a parcel
export interface ParcelFacts {
  parcelId: string;
  address: string | null;
  owner: string | null;
  acres: number | null;
  zoningType: string | null;
  center: [number, number] | null;
  parish: string | null;
  assessedValue: number | null;
}

// Screening dimensions available
export type ScreeningDimension = "flood" | "soils" | "wetlands" | "epa" | "traffic" | "ldeq" | "zoning";

// Screening result for a parcel
export interface ParcelScreeningResult {
  parcelId: string;
  dimensions: ScreeningDimension[];
  envelope: Record<string, unknown>;
  screenedAt: string;
}

// Provenance metadata for a parcel set
export interface ParcelSetProvenance {
  sourceKind: "database" | "memory" | "mixed";
  sourceRoute: string | null;
  authoritative: boolean;
  confidence: number | null;
  resolvedAt: string | null;
  freshness: "fresh" | "cached" | "stale";
}

// Materialized representation of a parcel set
export interface ParcelSetMaterialization {
  parcelSetId: string;
  memberIds: string[];
  count: number;
  facts: ParcelFacts[];
  screening: ParcelScreeningResult[];
  provenance: ParcelSetProvenance;
  materializedAt: string;
}

// Filter definition for parcel queries
export interface ParcelFilter {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains" | "within";
  value: unknown;
}

// Set operations for refinement
export type SetOperation =
  | { kind: "filter"; filters: ParcelFilter[] }
  | { kind: "union"; otherSetId: string }
  | { kind: "intersect"; otherSetId: string }
  | { kind: "subtract"; otherSetId: string }
  | { kind: "sort"; field: string; direction: "asc" | "desc" }
  | { kind: "limit"; count: number };

// Intent of a parcel query
export type ParcelQueryIntent = "identify" | "screen" | "filter" | "compare" | "rank" | "discover" | "summarize" | "refine" | "general";

// Strategy for resolving a parcel set
export type ResolutionStrategy =
  | { kind: "parcel-ids"; ids: string[] }
  | { kind: "bbox"; spatial: SpatialScope; limit: number }
  | { kind: "selection-passthrough" }
  | { kind: "property-query"; filters: ParcelFilter[] }
  | { kind: "spatial-sql"; sql: string; params: unknown[] }
  | { kind: "memory-discovery"; query: string; parish?: string; topK: number };

// Execution directives for a parcel query
export interface ExecutionDirectives {
  materializationMode: "immediate" | "lazy";
  screeningTiming: "pre-agent" | "agent-triggered" | "none";
  authoritativeVerification: "required" | "recommended" | "skip";
  freshnessMaxSeconds: number | null;
  estimatedCost: "light" | "moderate" | "heavy";
}

// Memory policy for a parcel query
export interface MemoryPolicy {
  allowSemanticDiscovery: boolean;
  requireDbVerification: boolean;
  maxCandidatesFromMemory: number;
  confidenceFloor: number;
}

// Screening strategy for a parcel query
export interface ScreeningStrategy {
  dimensions: ScreeningDimension[];
  mode: "full" | "selective";
  batchSize: number;
  priority: "speed" | "completeness";
}

// Scoring criterion for ranking parcels
export interface ScoringCriterion {
  field: string;
  weight: number;
  direction: "maximize" | "minimize";
  penalty?: { condition: string; factor: number };
}

// Eligibility gate for parcel filtering
export interface EligibilityGate {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";
  value: unknown;
  reason: string;
}

// Scoring objective for a parcel query
export interface ScoringObjective {
  criteria: ScoringCriterion[];
  eligibilityGates: EligibilityGate[];
  limit: number | null;
}

// Output mode for parcel results
export type OutputMode = "list" | "comparison" | "summary" | "map" | "detail";

// Provenance requirements for a parcel query
export interface ProvenanceRequirements {
  requireAuthoritative: boolean;
  maxStalenessSeconds: number | null;
  verifyMemoryResults: boolean;
}

// Complete plan for a parcel query
export interface ParcelQueryPlan {
  id: string;
  intent: ParcelQueryIntent;
  inputSets: ParcelSetDefinition[];
  resolution: ResolutionStrategy;
  filters: ParcelFilter[];
  screening: ScreeningStrategy | null;
  scoring: ScoringObjective | null;
  outputMode: OutputMode;
  directives: ExecutionDirectives;
  memoryPolicy: MemoryPolicy;
  provenanceRequirements: ProvenanceRequirements;
  isFollowUp: boolean;
}

// Screening summary for analytics
export interface ScreeningSummary {
  dimensionsScreened: ScreeningDimension[];
  floodExposure: { sfhaCount: number; totalCount: number } | null;
  wetlandExposure: { affectedCount: number; totalCount: number } | null;
  epaProximity: { sitesWithinMile: number } | null;
}

// Analytics for a parcel set
export interface SetAnalytics {
  totalCount: number;
  distributions: Record<string, Record<string, number>>;
  screeningSummary: ScreeningSummary | null;
  topConstraints: string[];
  scoringSummary: { min: number; max: number; mean: number } | null;
}

// Structured context replacing text prefix
export interface StructuredParcelContext {
  plan: ParcelQueryPlan;
  sets: {
    definition: ParcelSetDefinition;
    materialization: ParcelSetMaterialization | null;
    analytics: SetAnalytics | null;
  }[];
  conversationSetRegistry: string[];
  intent: ParcelQueryIntent;
  outputMode: OutputMode;
}
