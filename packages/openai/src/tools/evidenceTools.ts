import { tool } from "@openai/agents";
import { z } from "zod";
import path from "node:path";
import { prisma } from "@entitlement-os/db";
import {
  hashBytesSha256,
  buildEvidenceSnapshotObjectKey,
  buildEvidenceExtractObjectKey,
} from "@entitlement-os/shared";
import { rpc } from "./propertyDbTools.js";

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

export const evidenceSnapshot = tool({
  name: "evidence_snapshot",
  description:
    "Capture a snapshot of a URL for evidence tracking. Fetches the URL, hashes the content, stores a snapshot record, and detects changes from previous snapshots. Returns snapshot metadata including content hash and change detection.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    url: z.string().min(1).describe("The URL to snapshot (e.g. https://example.com/page)"),
    title: z.string().nullable().describe("Optional title for the evidence source"),
    dealId: z.string().uuid().nullable().describe("Optional deal ID to associate the snapshot run with"),
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
  const upper = zone.toUpperCase().trim();
  if (["A", "AE", "AH", "AO", "AR", "A99", "V", "VE"].includes(upper)) {
    return "HIGH";
  }
  if (["X500", "B", "SHADED X", "0.2 PCT ANNUAL CHANCE"].includes(upper)) {
    return "MODERATE";
  }
  return "LOW";
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
    lat: z.number().nullable().describe("Latitude (unused currently, address search preferred)"),
    lng: z.number().nullable().describe("Longitude (unused currently, address search preferred)"),
  }),
  execute: async ({ address }) => {
    try {
      // Normalize address: strip punctuation, collapse whitespace
      const normalizedAddress = address
        .replace(/[''`.,#]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      // Step 1: Search for matching parcels
      const searchResult = await rpc("api_search_parcels", {
        search_text: normalizedAddress,
        parish: null,
        limit_rows: 5,
      });

      if (
        !searchResult ||
        (searchResult as { error?: string }).error ||
        !Array.isArray(searchResult) ||
        searchResult.length === 0
      ) {
        return JSON.stringify({
          address,
          floodZone: null,
          riskLevel: null,
          matchedParcel: null,
          note: "No matching parcel found in the Louisiana Property Database for this address.",
        });
      }

      const firstMatch = searchResult[0] as {
        id: string;
        address?: string;
        owner_name?: string;
        parcel_number?: string;
        acres?: number;
      };

      // Step 2: Screen for flood zones using the matched parcel ID
      const floodResult = await rpc("api_screen_flood", {
        parcel_id: firstMatch.id,
      });

      if ((floodResult as { error?: string }).error) {
        return JSON.stringify({
          address,
          matchedParcel: {
            id: firstMatch.id,
            address: firstMatch.address ?? null,
            parcelNumber: firstMatch.parcel_number ?? null,
          },
          floodZone: null,
          riskLevel: null,
          error: (floodResult as { error: string }).error,
        });
      }

      const flood = floodResult as {
        parcel_id: string;
        flood_zones: Array<{
          zone: string;
          bfe?: number;
          panel_id?: string;
          effective_date?: string;
          overlap_pct?: number;
        }>;
        in_sfha: boolean;
      };

      // Step 3: Compute risk level from worst-case zone
      const zones = flood.flood_zones ?? [];
      let worstRisk: "HIGH" | "MODERATE" | "LOW" = "LOW";
      const riskOrder = { HIGH: 3, MODERATE: 2, LOW: 1 } as const;

      for (const z of zones) {
        const risk = classifyFloodRisk(z.zone);
        if (riskOrder[risk] > riskOrder[worstRisk]) {
          worstRisk = risk;
        }
      }

      return JSON.stringify({
        address,
        matchedParcel: {
          id: firstMatch.id,
          address: firstMatch.address ?? null,
          parcelNumber: firstMatch.parcel_number ?? null,
          acres: firstMatch.acres ?? null,
        },
        floodZones: zones.map((z) => ({
          zone: z.zone,
          baseFloodElevation: z.bfe ?? null,
          panelId: z.panel_id ?? null,
          effectiveDate: z.effective_date ?? null,
          overlapPct: z.overlap_pct ?? null,
          riskLevel: classifyFloodRisk(z.zone),
        })),
        primaryFloodZone: zones.length > 0 ? zones[0].zone : null,
        riskLevel: zones.length > 0 ? worstRisk : null,
        inSfha: flood.in_sfha,
        zoneCount: zones.length,
      });
    } catch (err) {
      return JSON.stringify({
        address,
        floodZone: null,
        riskLevel: null,
        error: `Flood zone lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
});

export const compareEvidenceHash = tool({
  name: "compare_evidence_hash",
  description:
    "Check if an evidence source has changed since its last snapshot by comparing content hashes",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    sourceId: z
      .string()
      .uuid()
      .describe("The evidence source ID to check"),
  }),
  execute: async ({ orgId, sourceId }) => {
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
  },
});
