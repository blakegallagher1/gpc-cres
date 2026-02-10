import { prisma } from "@entitlement-os/db";
import { propertyDbRpc } from "@entitlement-os/openai";
import { AUTOMATION_CONFIG } from "./config";
import { createAutomationTask } from "./notifications";
import type { AutomationEvent } from "./events";

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
  matchAddress: string
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

/**
 * Apply enrichment data from a property DB parcel to our parcel record.
 * Calls api_get_parcel + api_screen_full, then updates the parcel.
 */
export async function applyEnrichment(
  parcelId: string,
  propertyDbId: string
): Promise<void> {
  const details = await propertyDbRpc("api_get_parcel", {
    parcel_id: propertyDbId,
  });
  const screening = await propertyDbRpc("api_screen_full", {
    parcel_id: propertyDbId,
  });

  const d = (Array.isArray(details) ? details[0] : details) as Record<
    string,
    unknown
  > | null;
  const s = (Array.isArray(screening) ? screening[0] : screening) as Record<
    string,
    unknown
  > | null;

  const updateData: Record<string, unknown> = { propertyDbId };

  if (d) {
    if (d.parcel_uid) updateData.apn = String(d.parcel_uid);
    if (d.lat) updateData.lat = Number(d.lat);
    if (d.lng) updateData.lng = Number(d.lng);
    if (d.acreage) updateData.acreage = Number(d.acreage);
  }

  if (s) {
    // Flood
    if (s.flood) {
      const flood = s.flood as Record<string, unknown>;
      const zones = flood.zones as Array<Record<string, unknown>> | undefined;
      if (zones && zones.length > 0) {
        updateData.floodZone = zones
          .map(
            (z) =>
              `${z.zone_code} (${Number(z.overlap_pct ?? 0).toFixed(0)}%)`
          )
          .join(", ");
      } else {
        updateData.floodZone = "No flood zone data";
      }
    }

    // Soils
    if (s.soils) {
      const soils = s.soils as Record<string, unknown>;
      const types = soils.soil_types as
        | Array<Record<string, unknown>>
        | undefined;
      if (types && types.length > 0) {
        updateData.soilsNotes = types
          .map(
            (t) =>
              `${t.soil_name}: ${t.drainage_class ?? "unknown drainage"}, hydric=${t.hydric_rating ?? "?"}`
          )
          .join("; ");
      }
    }

    // Wetlands
    if (s.wetlands) {
      const wetlands = s.wetlands as Record<string, unknown>;
      const areas = wetlands.wetland_areas as
        | Array<Record<string, unknown>>
        | undefined;
      if (areas && areas.length > 0) {
        updateData.wetlandsNotes = areas
          .map(
            (w) =>
              `${w.wetland_type} (${Number(w.overlap_pct ?? 0).toFixed(0)}%)`
          )
          .join("; ");
      } else {
        updateData.wetlandsNotes = "No wetlands detected";
      }
    }

    // Environmental
    const envParts: string[] = [];
    if (s.epa) {
      const epa = s.epa as Record<string, unknown>;
      const sites = epa.sites as Array<Record<string, unknown>> | undefined;
      if (sites && sites.length > 0) {
        envParts.push(
          `EPA: ${sites.length} site(s) nearby — ` +
            sites
              .slice(0, 3)
              .map(
                (e) =>
                  `${e.facility_name} (${Number(e.distance_miles ?? 0).toFixed(1)}mi)`
              )
              .join(", ")
        );
      } else {
        envParts.push("EPA: No regulated sites nearby");
      }
    }
    if (s.ldeq) {
      const ldeq = s.ldeq as Record<string, unknown>;
      const permits = ldeq.permits as
        | Array<Record<string, unknown>>
        | undefined;
      if (permits && permits.length > 0) {
        envParts.push(
          `LDEQ: ${permits.length} permit(s) nearby — ` +
            permits
              .slice(0, 3)
              .map(
                (p) =>
                  `${p.facility_name} (${Number(p.distance_miles ?? 0).toFixed(1)}mi)`
              )
              .join(", ")
        );
      } else {
        envParts.push("LDEQ: No permitted facilities nearby");
      }
    }
    if (envParts.length > 0) {
      updateData.envNotes = envParts.join("\n");
    }

    // Traffic
    if (s.traffic) {
      const traffic = s.traffic as Record<string, unknown>;
      const roads = traffic.roads as Array<Record<string, unknown>> | undefined;
      if (roads && roads.length > 0) {
        updateData.trafficNotes = roads
          .slice(0, 3)
          .map(
            (r) =>
              `${r.road_name}: ${Number(r.aadt ?? 0).toLocaleString()} AADT, ${Number(r.truck_pct ?? 0).toFixed(0)}% trucks, ${Number(r.distance_miles ?? 0).toFixed(1)}mi`
          )
          .join("; ");
      }
    }
  }

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
  event: AutomationEvent
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

  // Search property DB with progressive fallback
  const normalized = normalizeAddress(parcel.address);
  const attempts = [
    normalized,
    normalized.replace(/\s+\d{5}(-\d{4})?$/, ""),
    normalized.split(" ").slice(0, 3).join(" "),
  ];

  let matches: Array<Record<string, unknown>> = [];
  for (const searchText of attempts) {
    try {
      const result = await propertyDbRpc("api_search_parcels", {
        search_text: searchText,
        parish: parcel.deal?.jurisdiction?.name ?? null,
        limit_rows: 10,
      });
      if (Array.isArray(result) && result.length > 0) {
        matches = result as Array<Record<string, unknown>>;
        break;
      }
    } catch {
      // Search failed — continue to next attempt
    }
  }

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
    bestMatch.site_address ?? bestMatch.address ?? ""
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
      console.log(
        `[automation] Auto-enriched parcel ${parcelId} with confidence ${confidence}`
      );
    } catch (err) {
      console.error("[automation] Auto-enrichment failed:", err);
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
        (m, i) =>
          `${i + 1}. ${m.site_address ?? m.address ?? "unknown"} (ID: ${m.id ?? m.parcel_id ?? "?"})`
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
