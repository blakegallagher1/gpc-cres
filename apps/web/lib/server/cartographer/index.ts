import "server-only";

// ---------------------------------------------------------------------------
// Cartographer — spatial-intelligence server modules
//
// All modules are server-only and route through getGatewayClient().
// All stored rows are scoped with orgId.
// ---------------------------------------------------------------------------

export { executeSpatialQuery } from "./spatialQuery.js";
export type { SpatialQueryInput, SpatialQueryResult } from "./spatialQuery.js";

export { computeFitScores } from "./fitScore.js";
export type { FitScoreInput, FitScoreOutput } from "./fitScore.js";

export { findAssemblage } from "./findAssemblage.js";
export type { FindAssemblageInput, FindAssemblageOutput } from "./findAssemblage.js";

export { draftSitePlan } from "./draftSitePlan.js";
export type { DraftSitePlanInput, DraftSitePlanOutput } from "./draftSitePlan.js";

export { executeTemporalQuery } from "./temporalQuery.js";
export type { TemporalQueryInput, TemporalQueryOutput } from "./temporalQuery.js";

export { generateCuriosityTrail } from "./curiosityTrail.js";
export type { CuriosityTrailInput, CuriosityTrailOutput } from "./curiosityTrail.js";

export { validateSpatialSql } from "./sqlValidator.js";

export type {
  BBox,
  MapViewportState,
  CartographerAction,
  CartographerContext,
  ThesisDefinition,
  ThesisWeightEntry,
  FitScoreResult,
  AssemblageCandidateResult,
  HypotheticalSitePlanResult,
  SitePlanZone,
  TemporalChangeRecord,
  CuriosityTrailItem,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  GeoJsonGeometry,
  LayerStyle,
  SqlValidationResult,
} from "./types.js";
