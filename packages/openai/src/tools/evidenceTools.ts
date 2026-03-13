import { tool } from "@openai/agents";
import { z } from "zod";
import path from "node:path";
import { prisma } from "@entitlement-os/db";
import {
  buildEvidenceSnapshotObjectKey,
  buildEvidenceExtractObjectKey,
} from "@entitlement-os/shared";
import { hashBytesSha256 } from "@entitlement-os/shared/crypto";
import { rpc } from "./propertyDbTools.js";
import { ToolOrgIdSchema } from "./orgIdSchema.js";

function detectExtension(contentType: string | null, url: string): string {
  const lowerType = (contentType ?? "").toLowerCase();
  if (lowerType.includes("application/pdf")) return ".pdf";
  if (lowerType.includes("text/html")) return ".html";
  if (lowerType.includes("text/plain")) return ".txt";
  if (lowerType.includes("image/png")) return ".png";
  if (lowerType.includes("image/jpeg")) return ".jpg";
  try {
    const ext = path.extname(new URL(url).pathname);
    if (ext) return ext;
  } catch {
    // ignore
  }
  return ".bin";
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBooleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const item of value) {
    const row = toRecord(item);
    if (row) rows.push(row);
  }
  return rows;
}

type FloodZoneRow = {
  floodZone: string;
  overlapPct: number | null;
  inSfha: boolean | null;
  panelId: string | null;
  effectiveDate: string | null;
  bfe: number | null;
};

function getParcelCandidates(searchResult: unknown): Record<string, unknown>[] {
  const fromArray = toRecordArray(searchResult);
  if (fromArray.length > 0) return fromArray;

  const root = toRecord(searchResult);
  if (!root) return [];

  const parcels = toRecordArray(root.parcels);
  if (parcels.length > 0) return parcels;

  const dataValue = root.data;
  const dataArray = toRecordArray(dataValue);
  if (dataArray.length > 0) return dataArray;

  const dataRecord = toRecord(dataValue);
  if (!dataRecord) return [];

  const dataParcels = toRecordArray(dataRecord.parcels);
  if (dataParcels.length > 0) return dataParcels;

  return [dataRecord];
}

function getParcelId(parcel: Record<string, unknown>): string | null {
  return (
    toStringValue(parcel.parcel_id) ??
    toStringValue(parcel.parcelId) ??
    toStringValue(parcel.parcel_uid) ??
    toStringValue(parcel.parcelUid) ??
    toStringValue(parcel.id)
  );
}

function getFloodPayload(floodResult: unknown): {
  zones: FloodZoneRow[];
  inSfha: boolean | null;
  error: string | null;
} {
  const root = toRecord(floodResult);
  if (!root) {
    return {
      zones: [],
      inSfha: null,
      error: "Flood screening returned an unexpected response payload.",
    };
  }

  const payload = toRecord(root.data) ?? root;
  const rawZones = toRecordArray(payload.zones);
  const fallbackZones = toRecordArray(payload.flood_zones);
  const zoneRows = rawZones.length > 0 ? rawZones : fallbackZones;

  const zones: FloodZoneRow[] = zoneRows.map((zoneRow) => {
    const floodZone = toStringValue(zoneRow.floodZone) ?? toStringValue(zoneRow.zone) ?? "UNKNOWN";
    return {
      floodZone,
      overlapPct: toNumberValue(zoneRow.overlapPct) ?? toNumberValue(zoneRow.overlap_pct),
      inSfha: toBooleanValue(zoneRow.inSfha) ?? toBooleanValue(zoneRow.in_sfha),
      panelId: toStringValue(zoneRow.panelId) ?? toStringValue(zoneRow.panel_id),
      effectiveDate: toStringValue(zoneRow.effectiveDate) ?? toStringValue(zoneRow.effective_date),
      bfe: toNumberValue(zoneRow.bfe),
    };
  });

  const inferredSfha = zones.some((zone) => zone.inSfha === true) ? true : null;
  const inSfha =
    toBooleanValue(payload.inSfha) ??
    toBooleanValue(payload.in_sfha) ??
    inferredSfha;

  return {
    zones,
    inSfha,
    error: toStringValue(root.error),
  };
}

export const evidenceSnapshot = tool({
  name: "evidence_snapshot",
  description:
    "Capture a snapshot of a URL for evidence tracking. Fetches the URL, hashes the content, stores a snapshot record, and detects changes from previous snapshots. Returns snapshot metadata including content hash and change detection.",
  parameters: z.object({
    orgId: ToolOrgIdSchema.describe("The org ID for security scoping"),
    url: z.string().min(1).describe("The URL to snapshot (e.g. https://example.com/page)"),
    title: z.string().optional().nullable().describe("Optional title for the evidence source"),
    dealId: z.string().optional().nullable().describe("Optional deal ID to associate the snapshot run with"),
  }),
  execute: async ({ orgId, url, title, dealId }) => {
    try {
      // 1. Validate URL
      const parsed = new URL(url);
      const domain = parsed.hostname;

      // 2. Upsert evidence source
      const source = await prisma.evidenceSource.upsert({
        where: { orgId_url: { orgId, url } },
        update: {
          title: title ?? undefined,
          domain,
        },
        create: {
          orgId,
          url,
          domain,
          title: title ?? null,
          isOfficial: false,
        },
      });

      // 3. Fetch the URL
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": "EntitlementOS/1.0 (+evidence-snapshot)",
        },
        signal: AbortSignal.timeout(30_000),
      });

      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      const httpStatus = res.status;
      const ab = await res.arrayBuffer();
      const bytes = new Uint8Array(ab);

      // 4. Hash content
      const contentHash = hashBytesSha256(bytes);
      const retrievedAt = new Date();

      // 5. Check for changes vs latest existing snapshot
      const latestSnapshot = await prisma.evidenceSnapshot.findFirst({
        where: { orgId, evidenceSourceId: source.id },
        orderBy: { retrievedAt: "desc" },
        select: { contentHash: true, retrievedAt: true },
      });

      const changed = latestSnapshot
        ? latestSnapshot.contentHash !== contentHash
        : null; // null = first snapshot, can't determine change

      // 6. Build deterministic storage keys
      const extension = detectExtension(contentType, url);
      const storageObjectKey = buildEvidenceSnapshotObjectKey({
        orgId,
        sourceId: source.id,
        retrievedAt,
        contentHash,
        extension,
      });
      const textExtractObjectKey = buildEvidenceExtractObjectKey({
        orgId,
        sourceId: source.id,
        retrievedAt,
        contentHash,
      });

      // 7. Create a Run record for the snapshot
      const run = await prisma.run.create({
        data: {
          orgId,
          runType: "CHANGE_DETECT",
          dealId: dealId ?? null,
          status: "succeeded",
          startedAt: retrievedAt,
          finishedAt: new Date(),
        },
        select: { id: true },
      });

      // 8. Create EvidenceSnapshot record
      const snapshot = await prisma.evidenceSnapshot.create({
        data: {
          orgId,
          evidenceSourceId: source.id,
          retrievedAt,
          httpStatus,
          contentType,
          contentHash,
          storageObjectKey,
          textExtractObjectKey,
          runId: run.id,
        },
        select: { id: true },
      });

      return JSON.stringify({
        sourceId: source.id,
        snapshotId: snapshot.id,
        url: source.url,
        domain,
        title: source.title,
        isOfficial: source.isOfficial,
        httpStatus,
        contentType,
        contentHash,
        changed,
        retrievedAt: retrievedAt.toISOString(),
        storageObjectKey,
        previousHash: latestSnapshot?.contentHash ?? null,
        previousRetrievedAt: latestSnapshot?.retrievedAt?.toISOString() ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        error: `Evidence snapshot failed: ${message}`,
        url,
      });
    }
  },
});

/** Map FEMA flood zone codes to risk levels. */
function classifyFloodRisk(zone: string): "HIGH" | "MODERATE" | "LOW" {
  const upper = zone.toUpperCase().replace(/^ZONE\s+/, "").trim();
  if (["A", "AE", "AH", "AO", "AR", "A99", "V", "VE"].includes(upper)) {
    return "HIGH";
  }
  if (["X500", "B", "SHADED X", "0.2 PCT ANNUAL CHANCE"].includes(upper)) {
    return "MODERATE";
  }
  return "LOW";
}

const riskOrder = { HIGH: 3, MODERATE: 2, LOW: 1 } as const;

function getHighestFloodRisk(zones: FloodZoneRow[]): "HIGH" | "MODERATE" | "LOW" | null {
  let selected: "HIGH" | "MODERATE" | "LOW" | null = null;
  for (const zone of zones) {
    if (zone.floodZone === "UNKNOWN") continue;
    const next = classifyFloodRisk(zone.floodZone);
    if (!selected || riskOrder[next] > riskOrder[selected]) {
      selected = next;
    }
  }
  return selected;
}

export const floodZoneLookup = tool({
  name: "flood_zone_lookup",
  description:
    "Check FEMA flood zone designation for a given address by searching the Louisiana Property Database and running a spatial flood zone overlay. Returns flood zone code(s), risk level, SFHA status, and overlap percentages.",
  parameters: z.object({
    address: z
      .string()
      .min(1)
      .describe("The street address to check for flood zone"),
    lat: z.number().optional().nullable().describe("Latitude (unused currently, address search preferred)"),
    lng: z.number().optional().nullable().describe("Longitude (unused currently, address search preferred)"),
  }),
  execute: async ({ address, lat, lng }) => {
    try {
      const normalizedAddress = address.replace(/[''`]/g, "").replace(/\s+/g, " ").trim();
      const searchResult = await rpc("api_search_parcels", {
        search_text: normalizedAddress,
        limit_rows: 5,
      });

      const searchRecord = toRecord(searchResult);
      const parcelCandidates = getParcelCandidates(searchResult);
      const matchedParcel = parcelCandidates[0] ?? null;
      const parcelId = matchedParcel ? getParcelId(matchedParcel) : null;

      if (!parcelId) {
        return JSON.stringify({
          address: normalizedAddress,
          floodZone: null,
          riskLevel: null,
          inSfha: null,
          parcelId: null,
          matchedParcel,
          zones: [],
          lat,
          lng,
          error:
            toStringValue(searchRecord?.error) ??
            "No parcel match found for flood screening.",
        });
      }

      const floodResult = await rpc("api_screen_flood", { parcel_id: parcelId });
      const { zones, inSfha, error } = getFloodPayload(floodResult);
      const riskLevel = getHighestFloodRisk(zones);
      const floodZones = Array.from(
        new Set(
          zones
            .map((zone) => zone.floodZone)
            .filter((zone) => zone.length > 0 && zone !== "UNKNOWN"),
        ),
      );

      return JSON.stringify({
        address: normalizedAddress,
        parcelId,
        matchedParcel,
        floodZone: floodZones.length > 0 ? floodZones.join(", ") : null,
        riskLevel,
        inSfha: inSfha ?? (riskLevel === "HIGH" ? true : null),
        zones,
        lat,
        lng,
        ...(error ? { error } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        address,
        floodZone: null,
        riskLevel: null,
        inSfha: null,
        parcelId: null,
        matchedParcel: null,
        zones: [],
        lat,
        lng,
        error: `Flood zone lookup failed: ${message}`,
      });
    }
  },
});

export const compareEvidenceHash = tool({
  name: "compare_evidence_hash",
  description:
    "Check if an evidence source has changed since its last snapshot by comparing content hashes",
  parameters: z.object({
    orgId: ToolOrgIdSchema.describe("The org ID for security scoping"),
    sourceId: z
      .string()
      .uuid()
      .describe("The evidence source ID to check"),
  }),
  execute: async ({ orgId, sourceId }) => {
    try {
      const snapshots = await prisma.evidenceSnapshot.findMany({
        where: {
          orgId,
          evidenceSourceId: sourceId,
        },
        orderBy: { retrievedAt: "desc" },
        take: 2,
      });

      if (snapshots.length === 0) {
        return JSON.stringify({
          sourceId,
          changed: null,
          error: "No snapshots found for this source",
        });
      }

      if (snapshots.length === 1) {
        return JSON.stringify({
          sourceId,
          changed: null,
          currentHash: snapshots[0].contentHash,
          previousHash: null,
          note: "Only one snapshot exists. Cannot determine if content has changed.",
        });
      }

      const [latest, previous] = snapshots;
      const changed = latest.contentHash !== previous.contentHash;

      return JSON.stringify({
        sourceId,
        changed,
        currentHash: latest.contentHash,
        previousHash: previous.contentHash,
        latestRetrievedAt: latest.retrievedAt,
        previousRetrievedAt: previous.retrievedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        sourceId,
        changed: null,
        error: `Evidence hash comparison failed: ${message}`,
      });
    }
  },
});
