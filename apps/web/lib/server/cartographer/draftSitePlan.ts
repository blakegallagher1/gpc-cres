import "server-only";

import type {
  CartographerContext,
  HypotheticalSitePlanResult,
  SitePlanZone,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  CartographerAction,
} from "./types.js";

// ---------------------------------------------------------------------------
// draftSitePlan — hypothetical site plan synthesis
//
// Takes parcel geometry + a program (list of desired zones/uses) and produces
// a rough site layout that the user can review. This is a planning sketch,
// not a civil engineering product.
//
// The current implementation subdivides the parcel bounding box into zones
// proportional to the requested acreage splits. Future versions will use
// actual parcel geometry for more accurate subdivision.
// ---------------------------------------------------------------------------

export interface DraftSitePlanInput {
  /** Name for this hypothetical plan. */
  planName: string;
  /** The parcel IDs included in this plan. */
  parcelIds: string[];
  /** Total acreage of the site. */
  totalAcreage: number;
  /** Bounding box [west, south, east, north] of the site. */
  siteBbox: [number, number, number, number];
  /** Program: list of zones the user wants to see laid out. */
  program: Array<{
    label: string;
    use: string;
    /** Fraction of total acreage (0–1). */
    acreageFraction: number;
  }>;
}

export interface DraftSitePlanOutput {
  plan: HypotheticalSitePlanResult;
  mapActions: CartographerAction[];
  citationRefs: string[];
}

/**
 * Synthesize a hypothetical site plan from a program definition.
 */
export async function draftSitePlan(
  ctx: CartographerContext,
  input: DraftSitePlanInput,
): Promise<DraftSitePlanOutput> {
  const [west, south, east, north] = input.siteBbox;
  const totalWidth = east - west;

  // Normalize fractions to sum to 1
  const totalFraction = input.program.reduce((s, p) => s + p.acreageFraction, 0);
  const normalizedProgram = input.program.map((p) => ({
    ...p,
    acreageFraction: totalFraction > 0 ? p.acreageFraction / totalFraction : 1 / input.program.length,
  }));

  // Subdivide the bounding box horizontally (left-to-right strips)
  const zones: SitePlanZone[] = [];
  let currentWest = west;

  for (const entry of normalizedProgram) {
    const zoneWidth = totalWidth * entry.acreageFraction;
    const zoneEast = Math.min(currentWest + zoneWidth, east);

    const geometry = {
      type: "Polygon" as const,
      coordinates: [[
        [currentWest, south],
        [zoneEast, south],
        [zoneEast, north],
        [currentWest, north],
        [currentWest, south],
      ]],
    };

    zones.push({
      label: entry.label,
      use: entry.use,
      geometry,
      acreage: Math.round(input.totalAcreage * entry.acreageFraction * 100) / 100,
    });

    currentWest = zoneEast;
  }

  const now = new Date().toISOString();
  const plan: HypotheticalSitePlanResult = {
    planName: input.planName,
    parcelIds: input.parcelIds,
    zones,
    totalAcreage: input.totalAcreage,
    notes:
      "This is a hypothetical site plan sketch based on bounding box subdivision. " +
      "Zone boundaries are approximate and do not account for setbacks, " +
      "easements, or topography. Review with a civil engineer before proceeding.",
    computedAt: now,
  };

  // ---- Build map layer ----
  const zoneColors = [
    "#3B82F6", "#22C55E", "#F59E0B", "#EF4444",
    "#8B5CF6", "#EC4899", "#14B8A6", "#F97316",
  ];

  const features: GeoJsonFeature[] = zones.map((zone, idx) => ({
    type: "Feature",
    properties: {
      label: zone.label,
      use: zone.use,
      acreage: zone.acreage,
      _zone_color: zoneColors[idx % zoneColors.length],
    },
    geometry: zone.geometry,
  }));

  const featureCollection: GeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  const layerId = `cartographer-siteplan-${Date.now()}`;
  const mapActions: CartographerAction[] = [
    {
      action: "add_layer",
      layerId,
      geojson: featureCollection,
      style: {
        paint: {
          "fill-color": ["get", "_zone_color"] as unknown as string,
          "fill-opacity": 0.4,
          "line-color": "#111827",
          "line-width": 2,
          "line-dasharray": [4, 2] as unknown as number,
        },
      },
      label: `Site Plan: ${input.planName}`,
    },
    {
      action: "fly_to",
      center: {
        lat: (south + north) / 2,
        lng: (west + east) / 2,
      },
      bbox: input.siteBbox,
    },
  ];

  return {
    plan,
    mapActions,
    citationRefs: input.parcelIds.slice(0, 50),
  };
}
