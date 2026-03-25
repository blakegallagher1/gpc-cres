import { prisma } from "@entitlement-os/db";
import { propertyDbRpc } from "@/lib/server/propertyDbRpc";
import { AUTOMATION_CONFIG } from "./config";
import { createAutomationTask } from "./notifications";
import type { AutomationEvent } from "./types";
import { captureAutomationTimeout } from "./sentry";
import { withTimeout } from "./timeout";
import { logger, serializeErrorForLogs } from "@/lib/logger";

type PropertyDbRecord = Record<string, unknown>;
export type ParcelEnrichmentUpdate = Record<string, unknown>;

const ENRICHMENT_HANDLER = "enrichment";
const SEARCH_PARCELS_TIMEOUT_MS = 8_000;
const GET_PARCEL_TIMEOUT_MS = 5_000;
const SCREEN_FULL_TIMEOUT_MS = 12_000;

export interface ParcelEnrichmentPayload {
  details: PropertyDbRecord | null;
  screening: PropertyDbRecord | null;
  updateData: ParcelEnrichmentUpdate;
}

function asRecord(value: unknown): PropertyDbRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as PropertyDbRecord)
    : null;
}

function firstRecord(value: unknown): PropertyDbRecord | null {
  if (Array.isArray(value)) {
    return asRecord(value[0]);
  }
  return asRecord(value);
}

/**
 * Normalize an address for property DB search.
 * Strips punctuation, collapses whitespace.
 */
export function normalizeAddress(address: string): string {
  return address.replace(/[''`,.#]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Score match confidence (0–1) between a search address and a DB match address.
 * Uses substring matching, not fuzzy/Levenshtein.
 */
export function scoreMatchConfidence(
  searchAddress: string,
  matchAddress: string,
): number {
  const a = normalizeAddress(searchAddress).toLowerCase();
  const b = normalizeAddress(matchAddress).toLowerCase();

  if (!a || !b) return 0;
  if (a === b) return 1.0;

  // One starts with the other (e.g., "123 Main St" vs "123 Main St Baton Rouge")
  if (b.startsWith(a) || a.startsWith(b)) return 0.85;

  // Street number + first word of street name match
  const aParts = a.split(" ");
  const bParts = b.split(" ");
  if (
    aParts.length >= 2 &&
    bParts.length >= 2 &&
    aParts[0] === bParts[0] &&
    aParts[1] === bParts[1]
  ) {
    return 0.7;
  }

  // Street number matches
  if (aParts[0] === bParts[0]) return 0.4;

  return 0.2;
}

export async function searchPropertyDbMatches(
  address: string,
  parish: string | null,
): Promise<PropertyDbRecord[]> {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return [];
  }

  const attempts = [
    normalized,
    normalized.replace(/\s+\d{5}(-\d{4})?$/, ""),
    normalized.split(" ").slice(0, 3).join(" "),
  ];

  for (const searchText of attempts) {
    try {
      const result = await withTimeout(
        propertyDbRpc("api_search_parcels", {
          search_text: searchText,
          parish,
          limit_rows: 10,
        }),
        SEARCH_PARCELS_TIMEOUT_MS,
        "enrichment.api_search_parcels",
      );
      if (result === null) {
        captureAutomationTimeout({
          label: `api_search_parcels timed out after ${SEARCH_PARCELS_TIMEOUT_MS}ms`,
          handler: ENRICHMENT_HANDLER,
        });
        continue;
      }
      if (Array.isArray(result) && result.length > 0) {
        return result.filter(
          (candidate): candidate is PropertyDbRecord => asRecord(candidate) !== null,
        );
      }
    } catch {
      // Search failed — continue to next attempt
    }
  }

  return [];
}

export function buildParcelEnrichmentUpdate(
  propertyDbId: string,
  details: PropertyDbRecord | null,
  screening: PropertyDbRecord | null,
): ParcelEnrichmentUpdate {
  const updateData: ParcelEnrichmentUpdate = { propertyDbId };

  if (details) {
    if (details.parcel_uid) updateData.apn = String(details.parcel_uid);
    if (details.lat) updateData.lat = Number(details.lat);
    if (details.lng) updateData.lng = Number(details.lng);
    if (details.acreage) updateData.acreage = Number(details.acreage);
  }

  if (!screening) {
    return updateData;
  }

  if (screening.flood) {
    const flood = asRecord(screening.flood);
    const zones = Array.isArray(flood?.zones)
      ? flood.zones
          .map((zone) => asRecord(zone))
          .filter((zone): zone is PropertyDbRecord => zone !== null)
      : [];
    if (zones.length > 0) {
      updateData.floodZone = zones
        .map(
          (zone) =>
            `${zone.zone_code} (${Number(zone.overlap_pct ?? 0).toFixed(0)}%)`,
        )
        .join(", ");
    } else {
      updateData.floodZone = "No flood zone data";
    }
  }

  if (screening.soils) {
    const soils = asRecord(screening.soils);
    const soilTypes = Array.isArray(soils?.soil_types)
      ? soils.soil_types
          .map((soilType) => asRecord(soilType))
          .filter((soilType): soilType is PropertyDbRecord => soilType !== null)
      : [];
    if (soilTypes.length > 0) {
      updateData.soilsNotes = soilTypes
        .map(
          (soilType) =>
            `${soilType.soil_name}: ${soilType.drainage_class ?? "unknown drainage"}, hydric=${soilType.hydric_rating ?? "?"}`,
        )
        .join("; ");
    }
  }

  if (screening.wetlands) {
    const wetlands = asRecord(screening.wetlands);
    const wetlandAreas = Array.isArray(wetlands?.wetland_areas)
      ? wetlands.wetland_areas
          .map((wetlandArea) => asRecord(wetlandArea))
          .filter((wetlandArea): wetlandArea is PropertyDbRecord => wetlandArea !== null)
      : [];
    if (wetlandAreas.length > 0) {
      updateData.wetlandsNotes = wetlandAreas
        .map(
          (wetlandArea) =>
            `${wetlandArea.wetland_type} (${Number(wetlandArea.overlap_pct ?? 0).toFixed(0)}%)`,
        )
        .join("; ");
    } else {
      updateData.wetlandsNotes = "No wetlands detected";
    }
  }

  const envParts: string[] = [];
  if (screening.epa) {
    const epa = asRecord(screening.epa);
    const sites = Array.isArray(epa?.sites)
      ? epa.sites
          .map((site) => asRecord(site))
          .filter((site): site is PropertyDbRecord => site !== null)
      : [];
    if (sites.length > 0) {
      envParts.push(
        `EPA: ${sites.length} site(s) nearby — ` +
          sites
            .slice(0, 3)
            .map(
              (site) =>
                `${site.facility_name} (${Number(site.distance_miles ?? 0).toFixed(1)}mi)`,
            )
            .join(", "),
      );
    } else {
      envParts.push("EPA: No regulated sites nearby");
    }
  }

  if (screening.ldeq) {
    const ldeq = asRecord(screening.ldeq);
    const permits = Array.isArray(ldeq?.permits)
      ? ldeq.permits
          .map((permit) => asRecord(permit))
          .filter((permit): permit is PropertyDbRecord => permit !== null)
      : [];
    if (permits.length > 0) {
      envParts.push(
        `LDEQ: ${permits.length} permit(s) nearby — ` +
          permits
            .slice(0, 3)
            .map(
              (permit) =>
                `${permit.facility_name} (${Number(permit.distance_miles ?? 0).toFixed(1)}mi)`,
            )
            .join(", "),
      );
    } else {
      envParts.push("LDEQ: No permitted facilities nearby");
    }
  }

  if (envParts.length > 0) {
    updateData.envNotes = envParts.join("\n");
  }

  if (screening.traffic) {
    const traffic = asRecord(screening.traffic);
    const roads = Array.isArray(traffic?.roads)
      ? traffic.roads
          .map((road) => asRecord(road))
          .filter((road): road is PropertyDbRecord => road !== null)
      : [];
    if (roads.length > 0) {
      updateData.trafficNotes = roads
        .slice(0, 3)
        .map(
          (road) =>
            `${road.road_name}: ${Number(road.aadt ?? 0).toLocaleString()} AADT, ${Number(road.truck_pct ?? 0).toFixed(0)}% trucks, ${Number(road.distance_miles ?? 0).toFixed(1)}mi`,
        )
        .join("; ");
    }
  }

  return updateData;
}

export async function getParcelEnrichmentPayload(
  propertyDbId: string,
): Promise<ParcelEnrichmentPayload> {
  const detailResult = await withTimeout(
    propertyDbRpc("api_get_parcel", {
      parcel_id: propertyDbId,
    }),
    GET_PARCEL_TIMEOUT_MS,
    "enrichment.api_get_parcel",
  );
  if (detailResult === null) {
    captureAutomationTimeout({
      label: `api_get_parcel timed out after ${GET_PARCEL_TIMEOUT_MS}ms`,
      handler: ENRICHMENT_HANDLER,
    });
  }

  const screeningResult = await withTimeout(
    propertyDbRpc("api_screen_full", {
      parcel_id: propertyDbId,
    }),
    SCREEN_FULL_TIMEOUT_MS,
    "enrichment.api_screen_full",
  );
  if (screeningResult === null) {
    captureAutomationTimeout({
      label: `api_screen_full timed out after ${SCREEN_FULL_TIMEOUT_MS}ms`,
      handler: ENRICHMENT_HANDLER,
    });
  }

  const details = firstRecord(detailResult);
  const screening = firstRecord(screeningResult);

  return {
    details,
    screening,
    updateData: buildParcelEnrichmentUpdate(propertyDbId, details, screening),
  };
}

/**
 * Apply enrichment data from a property DB parcel to our parcel record.
 * Calls api_get_parcel + api_screen_full, then updates the parcel.
 */
export async function applyEnrichment(
  parcelId: string,
  propertyDbId: string,
): Promise<void> {
  const { updateData } = await getParcelEnrichmentPayload(propertyDbId);

  await prisma.parcel.update({
    where: { id: parcelId },
    data: updateData,
  });
}

/**
 * Handle parcel.created event — auto-enrich if high confidence match found.
 * Fires as part of the automation event system (fire-and-forget).
 */
export async function handleParcelCreated(
  event: AutomationEvent,
): Promise<void> {
  if (event.type !== "parcel.created") return;

  const { parcelId, dealId, orgId } = event;

  // Load parcel with deal jurisdiction for parish lookup
  const parcel = await prisma.parcel.findFirst({
    where: { id: parcelId, dealId, deal: { orgId } },
    include: { deal: { include: { jurisdiction: { select: { name: true } } } } },
  });
  if (!parcel?.address) return;
  if (parcel.propertyDbId) return; // Already enriched

  const matches = await searchPropertyDbMatches(
    parcel.address,
    parcel.deal?.jurisdiction?.name ?? null,
  );

  if (matches.length === 0) {
    await createAutomationTask({
      orgId,
      dealId,
      type: "enrichment_review",
      title: "Manual geocoding needed",
      description: `No property DB matches found for "${parcel.address}". Manual geocoding required.`,
    });
    return;
  }

  // Score best match
  const bestMatch = matches[0];
  const matchAddress = String(
    bestMatch.site_address ?? bestMatch.address ?? "",
  );
  const confidence = scoreMatchConfidence(parcel.address, matchAddress);
  const propertyDbId = String(bestMatch.id ?? bestMatch.parcel_id ?? "");

  if (
    confidence >= AUTOMATION_CONFIG.enrichment.autoEnrichMinConfidence &&
    propertyDbId &&
    matches.length === 1
  ) {
    // High confidence + single match → auto-apply
    try {
      await applyEnrichment(parcelId, propertyDbId);
      logger.info("Automation parcel auto-enrichment applied", {
        parcelId,
        propertyDbId,
        confidence,
      });
    } catch (err) {
      logger.error("Automation parcel auto-enrichment failed", serializeErrorForLogs(err));
      await createAutomationTask({
        orgId,
        dealId,
        type: "enrichment_review",
        title: "Auto-enrichment failed",
        description: `Auto-enrichment failed for "${parcel.address}". Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else if (
    confidence >= AUTOMATION_CONFIG.enrichment.reviewMinConfidence
  ) {
    // Medium confidence → create review task with top matches
    const matchSummary = matches
      .slice(0, 3)
      .map(
        (match, index) =>
          `${index + 1}. ${match.site_address ?? match.address ?? "unknown"} (ID: ${match.id ?? match.parcel_id ?? "?"})`,
      )
      .join("\n");

    await createAutomationTask({
      orgId,
      dealId,
      type: "enrichment_review",
      title: "Review enrichment matches",
      description: `${matches.length} potential match(es) found for "${parcel.address}" (best confidence: ${(confidence * 100).toFixed(0)}%).\n\nTop matches:\n${matchSummary}`,
    });
  } else {
    // Low confidence → flag for manual review
    await createAutomationTask({
      orgId,
      dealId,
      type: "enrichment_review",
      title: "Low confidence enrichment match",
      description: `Best match confidence ${(confidence * 100).toFixed(0)}% for "${parcel.address}". Manual review recommended.`,
    });
  }
}
