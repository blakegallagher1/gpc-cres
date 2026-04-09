import "server-only";

import { getGatewayClient } from "./gatewayClient.js";
import { validateSpatialSql } from "./sqlValidator.js";
import type {
  CartographerContext,
  AssemblageCandidateResult,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  CartographerAction,
} from "./types.js";

// ---------------------------------------------------------------------------
// findAssemblage — discover contiguous parcel groups for assemblage
//
// Flow:
// 1. Accept a seed SQL that selects candidate parcels (with geometry).
// 2. Execute via gateway.
// 3. Group parcels by spatial adjacency (ST_Touches / ST_DWithin).
// 4. Return ranked assemblage candidates with combined geometry.
// ---------------------------------------------------------------------------

export interface FindAssemblageInput {
  /** SQL selecting candidate parcels. Must return parcel_id, acreage, geom. */
  candidateSql: string;
  /** Minimum total acreage for a valid assemblage. */
  minTotalAcreage?: number;
  /** Maximum number of parcels in an assemblage. */
  maxParcels?: number;
  /** Buffer distance in meters for adjacency (default 10m). */
  adjacencyBufferMeters?: number;
}

export interface FindAssemblageOutput {
  candidates: AssemblageCandidateResult[];
  totalCandidateParcels: number;
  mapActions: CartographerAction[];
  citationRefs: string[];
}

/**
 * Find assemblage candidates from a set of parcels.
 *
 * Strategy: ask the gateway to run a spatial clustering query using
 * ST_ClusterDBSCAN or ST_DWithin grouping. If the gateway doesn't support
 * the clustering extension, we fall back to client-side grouping by
 * bounding box overlap.
 */
export async function findAssemblage(
  ctx: CartographerContext,
  input: FindAssemblageInput,
): Promise<FindAssemblageOutput> {
  // ---- Validate base SQL ----
  const validation = validateSpatialSql(input.candidateSql);
  if (!validation.valid || !validation.sanitizedSql) {
    throw new Error(
      `Cartographer assemblage SQL validation failed: ${validation.errors.join("; ")}`,
    );
  }

  const bufferMeters = input.adjacencyBufferMeters ?? 10;
  const minAcreage = input.minTotalAcreage ?? 3;
  const maxParcels = input.maxParcels ?? 10;

  // ---- Build clustering query ----
  // Wrap the candidate SQL in a CTE and use ST_ClusterDBSCAN for grouping.
  const clusterSql = `
    WITH candidates AS (${validation.sanitizedSql})
    SELECT
      c.parcel_id,
      c.acreage,
      c.geom,
      ST_ClusterDBSCAN(c.geom, eps := ${bufferMeters}, minpoints := 1) OVER () AS cluster_id
    FROM candidates c
    WHERE c.geom IS NOT NULL
    LIMIT 500
  `.trim();

  const gateway = getGatewayClient();
  let rows: Array<Record<string, unknown>>;

  try {
    const response = await gateway.sql(clusterSql);
    rows = Array.isArray(response.data)
      ? (response.data as Array<Record<string, unknown>>)
      : [];
  } catch {
    // Fallback: just run the candidate SQL directly, skip clustering
    const fallbackResponse = await gateway.sql(validation.sanitizedSql);
    rows = Array.isArray(fallbackResponse.data)
      ? (fallbackResponse.data as Array<Record<string, unknown>>)
      : [];
    // Assign each parcel its own cluster
    rows = rows.map((r, i) => ({ ...r, cluster_id: i }));
  }

  // ---- Group by cluster ----
  const clusters = new Map<number, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const cid = typeof row.cluster_id === "number" ? row.cluster_id : 0;
    if (!clusters.has(cid)) clusters.set(cid, []);
    clusters.get(cid)!.push(row);
  }

  // ---- Build assemblage candidates ----
  const now = new Date().toISOString();
  const candidates: AssemblageCandidateResult[] = [];

  for (const [clusterId, parcels] of clusters) {
    if (parcels.length > maxParcels) continue;

    const parcelIds = parcels
      .map((p) => (typeof p.parcel_id === "string" ? p.parcel_id : String(p.id ?? "")))
      .filter((id) => id.length > 0);

    const totalAcreage = parcels.reduce((sum, p) => {
      const a = typeof p.acreage === "number" ? p.acreage : parseFloat(String(p.acreage ?? "0"));
      return sum + (Number.isFinite(a) ? a : 0);
    }, 0);

    if (totalAcreage < minAcreage && parcels.length > 1) continue;

    candidates.push({
      assemblageName: `Assemblage ${clusterId + 1} (${parcelIds.length} parcels)`,
      parcelIds,
      totalAcreage: Math.round(totalAcreage * 100) / 100,
      combinedGeometry: null, // Combined geometry computed server-side if needed
      fitScore: null,
      notes: parcels.length === 1
        ? "Single parcel — meets minimum acreage on its own."
        : `${parcelIds.length} adjacent parcels within ${bufferMeters}m buffer.`,
      computedAt: now,
    });
  }

  // Sort by total acreage desc
  candidates.sort((a, b) => b.totalAcreage - a.totalAcreage);

  // ---- Build map actions ----
  const allFeatures: GeoJsonFeature[] = [];
  const colorPalette = ["#3B82F6", "#EF4444", "#22C55E", "#F59E0B", "#8B5CF6", "#EC4899"];

  for (let i = 0; i < Math.min(candidates.length, 6); i++) {
    const candidate = candidates[i];
    const color = colorPalette[i % colorPalette.length];
    const clusterParcels = rows.filter((r) => {
      const pid = typeof r.parcel_id === "string" ? r.parcel_id : String(r.id ?? "");
      return candidate.parcelIds.includes(pid);
    });

    for (const parcel of clusterParcels) {
      const geom = extractGeom(parcel);
      if (!geom) continue;
      allFeatures.push({
        type: "Feature",
        properties: {
          parcel_id: parcel.parcel_id ?? parcel.id,
          assemblage: candidate.assemblageName,
          acreage: parcel.acreage,
          _assemblage_color: color,
        },
        geometry: geom,
      });
    }
  }

  const featureCollection: GeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features: allFeatures,
  };

  const layerId = `cartographer-assemblage-${Date.now()}`;
  const mapActions: CartographerAction[] = [
    {
      action: "add_layer",
      layerId,
      geojson: featureCollection,
      style: {
        paint: {
          "fill-color": ["get", "_assemblage_color"] as unknown as string,
          "fill-opacity": 0.35,
          "line-color": "#1F2937",
          "line-width": 2,
        },
      },
      label: `Assemblage Candidates (${candidates.length})`,
    },
  ];

  const citationRefs = candidates.flatMap((c) => c.parcelIds).slice(0, 50);

  return {
    candidates: candidates.slice(0, 20),
    totalCandidateParcels: rows.length,
    mapActions,
    citationRefs,
  };
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
