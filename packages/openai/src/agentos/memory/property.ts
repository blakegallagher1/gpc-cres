import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@entitlement-os/db";

import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";
import { buildHashedSparseVector } from "../qdrant.js";
import { embedText } from "../utils/embedding.js";

type JsonRecord = Record<string, unknown>;

/**
 * Screening result structure from gateway API (api_screen_full response).
 * Partial definition covering main sections.
 */
export type ScreeningResult = {
  flood?: {
    zones?: Array<{
      zone_code: string;
      overlap_pct: number;
    }>;
  };
  soils?: {
    soil_types?: Array<{
      soil_name: string;
      drainage_class: string;
      hydric_rating: string;
    }>;
  };
  wetlands?: {
    wetland_areas?: Array<{
      wetland_type: string;
      overlap_pct: number;
    }>;
  };
  epa?: {
    sites?: Array<{
      facility_name: string;
      distance_miles: number;
    }>;
  };
  ldeq?: {
    permits?: Array<{
      facility_name: string;
      distance_miles: number;
    }>;
  };
  traffic?: {
    roads?: Array<{
      road_name: string;
      aadt: number;
      truck_pct: number;
      distance_miles: number;
    }>;
  };
};

export type PropertyIntelligenceInput = {
  parcelId: string;
  address: string;
  parish: string;
  zoning?: string;
  acreage?: number;
  screeningResult?: ScreeningResult;
  dealId?: string;
  dealNotes?: string;
  orgId: string;
};

export type PropertyIntelligenceHit = {
  parcelId: string;
  address: string;
  parish: string;
  summary: string;
  score: number;
  zoning?: string;
  acreage?: number;
};

function qdrantHeaders(apiKey: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["api-key"] = apiKey;
  return h;
}

/**
 * Convert screening result + metadata to natural language summary for embedding.
 * This makes semantic search work by capturing human-readable patterns.
 */
function buildPropertySummary(
  address: string,
  parish: string,
  zoning: string | undefined,
  acreage: number | undefined,
  screening: ScreeningResult | undefined,
): string {
  const parts: string[] = [];

  // Address + parish + zoning + size
  parts.push(`${address}, ${parish} Parish.`);
  if (acreage) parts.push(`${acreage.toFixed(1)} acres.`);
  if (zoning) parts.push(`Zoning: ${zoning}.`);

  if (!screening) {
    return parts.join(" ");
  }

  // Flood
  if (screening.flood?.zones && screening.flood.zones.length > 0) {
    const floodSummary = screening.flood.zones
      .map((z) => `${z.zone_code} (${(z.overlap_pct ?? 0).toFixed(0)}%)`)
      .join(", ");
    parts.push(`Flood zones: ${floodSummary}.`);
  } else {
    parts.push("No flood zone.");
  }

  // Soils
  if (screening.soils?.soil_types && screening.soils.soil_types.length > 0) {
    const soilSummary = screening.soils.soil_types
      .map(
        (s) =>
          `${s.soil_name} (${s.drainage_class ?? "unknown drainage"}, hydric=${s.hydric_rating ?? "?"})`
      )
      .join("; ");
    parts.push(`Soils: ${soilSummary}.`);
  }

  // Wetlands
  if (screening.wetlands?.wetland_areas && screening.wetlands.wetland_areas.length > 0) {
    const wetlandSummary = screening.wetlands.wetland_areas
      .map((w) => `${w.wetland_type} (${(w.overlap_pct ?? 0).toFixed(0)}%)`)
      .join(", ");
    parts.push(`Wetlands: ${wetlandSummary}.`);
  } else {
    parts.push("No wetlands.");
  }

  // Environmental
  const epaCount = screening.epa?.sites?.length ?? 0;
  const ldeqCount = screening.ldeq?.permits?.length ?? 0;
  if (epaCount > 0) {
    parts.push(`${epaCount} EPA regulated site(s) nearby.`);
  }
  if (ldeqCount > 0) {
    parts.push(`${ldeqCount} LDEQ permitted facility(ies) nearby.`);
  }

  // Traffic
  if (screening.traffic?.roads && screening.traffic.roads.length > 0) {
    const topRoad = screening.traffic.roads[0];
    parts.push(
      `Traffic: ${topRoad.road_name} with ${(topRoad.aadt ?? 0).toLocaleString()} AADT, ${((topRoad.truck_pct ?? 0)).toFixed(0)}% trucks.`
    );
  }

  return parts.join(" ");
}

export class PropertyIntelligenceStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly qdrantUrl: string,
  ) {}

  /**
   * Initialize collection if it doesn't exist.
   * Creates named vectors: dense (1536-dim) and sparse (BM25).
   */
  async createIfNotExists(): Promise<void> {
    const config = getAgentOsConfig();
    const collectionName = config.qdrant.collections.propertyIntelligence;
    const headers = qdrantHeaders(config.qdrant.apiKey);

    // Check if collection exists
    try {
      const checkRes = await fetch(
        `${this.qdrantUrl}/collections/${encodeURIComponent(collectionName)}`,
        { headers }
      );
      if (checkRes.ok) {
        return; // Collection already exists
      }
    } catch {
      // Network error or collection missing — continue to create
    }

    // Create collection with named vectors
    const createRes = await fetch(
      `${this.qdrantUrl}/collections`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          collection_name: collectionName,
          vectors: {
            [config.qdrant.denseVectorName]: {
              size: config.models.embeddingDimensions,
              distance: "Cosine",
            },
            [config.qdrant.sparseVectorName]: {
              size: 50000,
              distance: "Bm25",
            },
          },
          optimizers_config: {
            default_segment_number: 4,
            timeout_sec: 30,
          },
        }),
      }
    );

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error(
        `[PropertyIntelligence] Failed to create collection: ${text}`
      );
    }
  }

  /**
   * Upsert screening result + deal notes to property intelligence collection.
   */
  async upsert(input: PropertyIntelligenceInput): Promise<string> {
    if (!isAgentOsFeatureEnabled("qdrantHybridRetrieval")) {
      throw new Error("Qdrant hybrid retrieval is disabled");
    }

    const config = getAgentOsConfig();
    const pointId = randomUUID();

    // Generate NL summary → embed
    const summary = buildPropertySummary(
      input.address,
      input.parish,
      input.zoning,
      input.acreage,
      input.screeningResult
    );
    const dense = await embedText(summary);
    const sparse = buildHashedSparseVector(summary);

    // Collect environmental flags
    const environmentalFlags: string[] = [];
    if (input.screeningResult?.flood?.zones && input.screeningResult.flood.zones.length > 0) {
      environmentalFlags.push(
        `flood:${input.screeningResult.flood.zones.map((z) => z.zone_code).join(",")}`
      );
    }
    if (input.screeningResult?.soils?.soil_types && input.screeningResult.soils.soil_types.length > 0) {
      environmentalFlags.push("hydric_soils");
    }
    if (input.screeningResult?.wetlands?.wetland_areas && input.screeningResult.wetlands.wetland_areas.length > 0) {
      environmentalFlags.push("wetlands_present");
    }
    if (input.screeningResult?.epa?.sites && input.screeningResult.epa.sites.length > 0) {
      environmentalFlags.push(`epa:${input.screeningResult.epa.sites.length}`);
    }
    if (input.screeningResult?.ldeq?.permits && input.screeningResult.ldeq.permits.length > 0) {
      environmentalFlags.push(`ldeq:${input.screeningResult.ldeq.permits.length}`);
    }

    // Upsert to Qdrant
    await fetch(
      `${this.qdrantUrl}/collections/${encodeURIComponent(config.qdrant.collections.propertyIntelligence)}/points`,
      {
        method: "PUT",
        headers: qdrantHeaders(config.qdrant.apiKey),
        body: JSON.stringify({
          points: [
            {
              id: pointId,
              vector: {
                [config.qdrant.denseVectorName]: dense,
                [config.qdrant.sparseVectorName]: sparse,
              },
              payload: {
                parcel_id: input.parcelId,
                address: input.address,
                parish: input.parish,
                zoning: input.zoning ?? null,
                acreage: input.acreage ?? null,
                screening_summary: summary,
                environmental_flags: environmentalFlags,
                deal_id: input.dealId ?? null,
                deal_notes: input.dealNotes ?? null,
                org_id: input.orgId,
                created_at: new Date().toISOString(),
              },
            },
          ],
        }),
      }
    );

    return pointId;
  }

  /**
   * Hybrid RRF search for relevant parcels by natural language query.
   * Optionally filter by parish.
   */
  async search(
    query: string,
    orgId: string,
    parish?: string,
    minScore = 0.0,
    topK = 5
  ): Promise<PropertyIntelligenceHit[]> {
    if (!isAgentOsFeatureEnabled("qdrantHybridRetrieval")) {
      return [];
    }

    const config = getAgentOsConfig();
    const dense = await embedText(query);
    const sparse = buildHashedSparseVector(query);
    const overFetch = Math.max(topK * 2, 10);

    // Build filter: must match orgId, optionally parish
    const must: JsonRecord[] = [{ key: "org_id", match: { value: orgId } }];
    if (parish) {
      must.push({ key: "parish", match: { value: parish } });
    }
    const qdrantFilter = { must };

    // Prefetch dense + sparse, fuse with RRF
    const res = await fetch(
      `${this.qdrantUrl}/collections/${encodeURIComponent(config.qdrant.collections.propertyIntelligence)}/points/query`,
      {
        method: "POST",
        headers: qdrantHeaders(config.qdrant.apiKey),
        body: JSON.stringify({
          prefetch: [
            {
              query: dense,
              using: config.qdrant.denseVectorName,
              limit: overFetch,
              filter: qdrantFilter,
            },
            {
              query: sparse,
              using: config.qdrant.sparseVectorName,
              limit: overFetch,
              filter: qdrantFilter,
            },
          ],
          query: { fusion: "rrf" },
          limit: overFetch,
          with_payload: true,
          with_vector: false,
          params: { hnsw_ef: 128, exact: false },
        }),
      }
    );

    if (!res.ok) {
      return [];
    }

    const parsed = (await res.json()) as {
      result?: { points?: JsonRecord[] };
    };
    const points = parsed?.result?.points ?? [];

    const hits: PropertyIntelligenceHit[] = [];
    for (const point of points) {
      const score = typeof point.score === "number" ? point.score : 0;
      if (score < minScore) continue;

      const payload = point.payload as JsonRecord | undefined;
      if (!payload) continue;

      hits.push({
        parcelId: String(payload.parcel_id ?? ""),
        address: String(payload.address ?? ""),
        parish: String(payload.parish ?? ""),
        zoning: payload.zoning ? String(payload.zoning) : undefined,
        acreage: payload.acreage ? Number(payload.acreage) : undefined,
        summary: String(payload.screening_summary ?? ""),
        score,
      });
    }

    return hits.slice(0, topK);
  }
}
