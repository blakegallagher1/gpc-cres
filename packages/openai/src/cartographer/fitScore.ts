import "server-only";

import { getGatewayClient } from "./gatewayClient.js";
import { validateSpatialSql } from "./sqlValidator.js";
import type {
  CartographerContext,
  ThesisDefinition,
  FitScoreResult,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  CartographerAction,
} from "./types.js";

// ---------------------------------------------------------------------------
// fitScore — thesis-driven parcel scoring → heatmap layer
//
// Flow:
// 1. Accept a thesis (weighted factor list) + a spatial SQL to select parcels.
// 2. Fetch matching parcels via gateway.
// 3. Score each parcel against the thesis weights.
// 4. Return scored results + a heatmap layer action.
// ---------------------------------------------------------------------------

export interface FitScoreInput {
  /** The thesis definition with named factors and weights. */
  thesis: ThesisDefinition;
  /** SQL to select the candidate parcels (must return parcel_id + factor columns). */
  parcelSql: string;
  /** Optional: restrict to viewport bbox. */
  bbox?: [number, number, number, number];
}

export interface FitScoreOutput {
  thesisName: string;
  scores: FitScoreResult[];
  summary: { count: number; avgScore: number; maxScore: number; minScore: number };
  mapActions: CartographerAction[];
  citationRefs: string[];
}

/**
 * Score parcels against a thesis and produce a heatmap layer.
 */
export async function computeFitScores(
  ctx: CartographerContext,
  input: FitScoreInput,
): Promise<FitScoreOutput> {
  // ---- Validate SQL ----
  const validation = validateSpatialSql(input.parcelSql);
  if (!validation.valid || !validation.sanitizedSql) {
    throw new Error(
      `Cartographer fit-score SQL validation failed: ${validation.errors.join("; ")}`,
    );
  }

  // ---- Execute query ----
  const gateway = getGatewayClient();
  const response = await gateway.sql(validation.sanitizedSql);
  const rows = Array.isArray(response.data)
    ? (response.data as Array<Record<string, unknown>>)
    : [];

  // ---- Score each parcel ----
  const now = new Date().toISOString();
  const scores: FitScoreResult[] = rows.map((row) =>
    scoreParcel(row, input.thesis, now),
  );

  // ---- Summary stats ----
  const scoreValues = scores.map((s) => s.score);
  const summary = {
    count: scores.length,
    avgScore: scores.length > 0 ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scores.length) : 0,
    maxScore: scores.length > 0 ? Math.max(...scoreValues) : 0,
    minScore: scores.length > 0 ? Math.min(...scoreValues) : 0,
  };

  // ---- Build heatmap layer ----
  const features = scores
    .map<GeoJsonFeature | null>((s, idx) => {
      const row = rows[idx];
      const geom = extractGeometry(row);
      if (!geom) return null;
      return {
        type: "Feature" as const,
        properties: {
          parcel_id: s.parcelId,
          fit_score: s.score,
          thesis: s.thesis,
          ...s.breakdown,
        },
        geometry: geom,
      };
    })
    .filter((f): f is GeoJsonFeature => f !== null);

  const featureCollection: GeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  const layerId = `cartographer-fitscore-${Date.now()}`;
  const mapActions: CartographerAction[] = [
    {
      action: "add_layer",
      layerId,
      geojson: featureCollection,
      style: {
        paint: {
          // Color interpolation from red (low score) → yellow → green (high score)
          "fill-color": [
            "interpolate", ["linear"], ["get", "fit_score"],
            0, "#EF4444",
            50, "#F59E0B",
            100, "#22C55E",
          ] as unknown as string,
          "fill-opacity": 0.5,
          "line-color": "#1F2937",
          "line-width": 1,
        },
      },
      label: `Fit Score: ${input.thesis.name}`,
    },
  ];

  const citationRefs = scores.map((s) => s.parcelId).slice(0, 50);

  return {
    thesisName: input.thesis.name,
    scores,
    summary,
    mapActions,
    citationRefs,
  };
}

// ---------------------------------------------------------------------------
// Scoring logic
// ---------------------------------------------------------------------------

function scoreParcel(
  row: Record<string, unknown>,
  thesis: ThesisDefinition,
  computedAt: string,
): FitScoreResult {
  const parcelId =
    typeof row.parcel_id === "string"
      ? row.parcel_id
      : typeof row.id === "string"
        ? row.id
        : `unknown-${Math.random().toString(36).slice(2, 8)}`;

  const breakdown: FitScoreResult["breakdown"] = {};
  let totalWeighted = 0;
  let totalWeight = 0;

  for (const entry of thesis.weights) {
    const rawValue = getFactorSourceValue(row, entry.factor);
    const raw = evaluateFactor(entry.factor, rawValue, entry.threshold);
    const weighted = raw * entry.weight;
    totalWeighted += weighted;
    totalWeight += entry.weight;

    breakdown[entry.factor] = {
      raw,
      weighted: Math.round(weighted * 100) / 100,
      detail: describeFactorScore(entry.factor, rawValue, raw),
    };
  }

  const score = totalWeight > 0
    ? Math.round((totalWeighted / totalWeight) * 100) / 100
    : 0;

  return {
    parcelId,
    score: Math.max(0, Math.min(100, Math.round(score))),
    breakdown,
    thesis: thesis.name,
    computedAt,
  };
}

function getFactorSourceValue(row: Record<string, unknown>, factor: string): unknown {
  switch (factor) {
    case "acreage_min":
      return row.acreage;
    case "zoning_allows":
      return row.zoning;
    case "flood_zone_safe":
      return row.flood_zone;
    case "road_frontage":
      return row.road_frontage ?? row.road;
    case "distance_km":
      return row.distance_km;
    default:
      return row[factor];
  }
}

/**
 * Evaluate a single thesis factor for one parcel.
 * Returns 0–100 raw score.
 */
function evaluateFactor(
  factor: string,
  value: unknown,
  threshold?: number | string,
): number {
  if (value === null || value === undefined) return 0;

  switch (factor) {
    case "acreage_min": {
      const num = toNumber(value);
      const min = toNumber(threshold) ?? 1;
      if (num === null) return 0;
      return num >= min ? Math.min(100, (num / min) * 50 + 50) : (num / min) * 50;
    }
    case "zoning_allows": {
      const allowed = typeof threshold === "string"
        ? threshold.split(",").map((s) => s.trim().toUpperCase())
        : [];
      const code = String(value).toUpperCase().trim();
      return allowed.some((a) => code.startsWith(a)) ? 100 : 10;
    }
    case "flood_zone_safe": {
      const zone = String(value).toUpperCase().trim();
      if (zone === "X" || zone === "C") return 100;
      if (zone === "X500" || zone === "B") return 70;
      if (zone === "AE") return 30;
      return 10;
    }
    case "road_frontage": {
      const road = String(value).toUpperCase();
      if (/\b(I-\d+|INTERSTATE|HWY|HIGHWAY)\b/.test(road)) return 95;
      if (/\b(STATE|SR|LA-\d)\b/.test(road)) return 80;
      if (/\b(BLVD|AVE|PKWY)\b/.test(road)) return 65;
      return 40;
    }
    case "distance_km": {
      const num = toNumber(value);
      const max = toNumber(threshold) ?? 10;
      if (num === null) return 0;
      if (num <= max * 0.25) return 100;
      if (num <= max * 0.5) return 80;
      if (num <= max) return 60;
      return Math.max(0, 40 - (num - max) * 5);
    }
    default: {
      // Generic numeric: higher is better, capped at threshold
      const num = toNumber(value);
      if (num === null) return typeof value === "boolean" ? (value ? 100 : 0) : 50;
      const cap = toNumber(threshold) ?? 100;
      return Math.min(100, (num / cap) * 100);
    }
  }
}

function describeFactorScore(factor: string, value: unknown, score: number): string {
  const valStr = value === null || value === undefined ? "N/A" : String(value);
  return `${factor}=${valStr} → ${score}/100`;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Extract geometry from a row object (same logic as spatialQuery). */
function extractGeometry(row: Record<string, unknown>): GeoJsonFeature["geometry"] | null {
  const candidates = ["geom", "geometry", "geojson", "the_geom", "wkb_geometry"];
  for (const key of candidates) {
    const val = row[key];
    if (!val) continue;
    if (typeof val === "object" && (val as Record<string, unknown>).type) {
      return val as GeoJsonFeature["geometry"];
    }
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (parsed && typeof parsed === "object" && parsed.type) {
          return parsed as GeoJsonFeature["geometry"];
        }
      } catch { /* skip */ }
    }
  }
  return null;
}
