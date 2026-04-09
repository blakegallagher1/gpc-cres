import "server-only";

import { getGatewayClient } from "./gatewayClient.js";
import { validateSpatialSql } from "./sqlValidator.js";
import type {
  CartographerContext,
  TemporalChangeRecord,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  CartographerAction,
} from "./types.js";

// ---------------------------------------------------------------------------
// temporalQuery — detect parcel/area changes between two points in time
//
// This queries the gateway for rows where key attributes changed between
// two snapshots. Useful for: ownership changes, zoning amendments,
// assessed-value shifts, new building permits, etc.
// ---------------------------------------------------------------------------

export interface TemporalQueryInput {
  /** SQL returning temporal-comparison rows. Must include parcel_id, field, previous_value, current_value, changed_at. */
  changeSql: string;
  /** Human-readable label for the result. */
  label?: string;
}

export interface TemporalQueryOutput {
  changes: TemporalChangeRecord[];
  summary: {
    totalChanges: number;
    uniqueParcels: number;
    fieldBreakdown: Record<string, number>;
  };
  mapActions: CartographerAction[];
  citationRefs: string[];
}

/**
 * Execute a temporal change-detection query and return results with map actions.
 */
export async function executeTemporalQuery(
  ctx: CartographerContext,
  input: TemporalQueryInput,
): Promise<TemporalQueryOutput> {
  // ---- Validate ----
  const validation = validateSpatialSql(input.changeSql);
  if (!validation.valid || !validation.sanitizedSql) {
    throw new Error(
      `Cartographer temporal SQL validation failed: ${validation.errors.join("; ")}`,
    );
  }

  // ---- Execute ----
  const gateway = getGatewayClient();
  const response = await gateway.sql(validation.sanitizedSql);
  const rows = Array.isArray(response.data)
    ? (response.data as Array<Record<string, unknown>>)
    : [];

  // ---- Shape into TemporalChangeRecords ----
  const changes: TemporalChangeRecord[] = rows.map((row) => ({
    parcelId: String(row.parcel_id ?? row.id ?? "unknown"),
    field: String(row.field ?? row.attribute ?? "unknown"),
    previousValue: row.previous_value ?? row.old_value ?? null,
    currentValue: row.current_value ?? row.new_value ?? null,
    changedAt: String(row.changed_at ?? row.updated_at ?? new Date().toISOString()),
    source: String(row.source ?? "gateway"),
  }));

  // ---- Summary ----
  const uniqueParcels = new Set(changes.map((c) => c.parcelId));
  const fieldBreakdown: Record<string, number> = {};
  for (const change of changes) {
    fieldBreakdown[change.field] = (fieldBreakdown[change.field] ?? 0) + 1;
  }

  const summary = {
    totalChanges: changes.length,
    uniqueParcels: uniqueParcels.size,
    fieldBreakdown,
  };

  // ---- Build map layer highlighting changed parcels ----
  // We try to pull geometry from the rows if present
  const features = rows
    .map<GeoJsonFeature | null>((row) => {
      const geom = extractGeom(row);
      if (!geom) return null;
      return {
        type: "Feature" as const,
        properties: {
          parcel_id: row.parcel_id ?? row.id,
          field: row.field ?? row.attribute,
          previous_value: row.previous_value ?? row.old_value,
          current_value: row.current_value ?? row.new_value,
          changed_at: row.changed_at ?? row.updated_at,
        },
        geometry: geom,
      };
    })
    .filter((f): f is GeoJsonFeature => f !== null);

  const featureCollection: GeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  const layerId = `cartographer-temporal-${Date.now()}`;
  const label = input.label ?? "Temporal Changes";
  const mapActions: CartographerAction[] = [];

  if (features.length > 0) {
    mapActions.push({
      action: "add_layer",
      layerId,
      geojson: featureCollection,
      style: {
        paint: {
          "fill-color": "#F59E0B",
          "fill-opacity": 0.35,
          "line-color": "#D97706",
          "line-width": 2,
        },
      },
      label,
    });
  }

  mapActions.push({
    action: "message",
    text: `Temporal query found ${changes.length} changes across ${uniqueParcels.size} parcels.`,
    severity: changes.length > 0 ? "info" : "warn",
  });

  const citationRefs = [...uniqueParcels].slice(0, 50);

  return { changes, summary, mapActions, citationRefs };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractGeom(row: Record<string, unknown>): GeoJsonFeature["geometry"] | null {
  const keys = ["geom", "geometry", "geojson", "the_geom"];
  for (const key of keys) {
    const val = row[key];
    if (!val) continue;
    if (typeof val === "object" && (val as Record<string, unknown>).type) {
      return val as GeoJsonFeature["geometry"];
    }
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (parsed?.type) return parsed as GeoJsonFeature["geometry"];
      } catch { /* skip */ }
    }
  }
  return null;
}
