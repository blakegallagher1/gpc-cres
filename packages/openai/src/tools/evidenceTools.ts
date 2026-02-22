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

function normalizeAddress(value: string): string {
  return value.replace(/[''`]/g, "").replace(/\\s+/g, " ").trim();
}

const riskOrder = { HIGH: 3, MODERATE: 2, LOW: 1 } as const;

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

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function selectScreenFloodZone(screenFloodResult: unknown): string | null {
  const flood = toRecord(screenFloodResult);
  if (!flood) return null;

  const floodCode = [
    flood.flood_zone,
    flood.floodZone,
    flood.zone,
    flood.code,
    flood.riskZone,
  ];
  for (const code of floodCode) {
    if (typeof code === "string") return code;
  }
  return null;
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
    const normalizedAddress = address;
    const sanitizedAddress = normalizeAddress(normalizedAddress);

    const parcelResult = await rpc("api_search_parcels", {
      search_text: sanitizedAddress,
    });
    const parcels = Array.isArray(parcelResult) ? parcelResult : [];
    const matchedParcel = parcels[0];

    if (!matchedParcel || typeof matchedParcel !== "object" || !("parcel_id" in matchedParcel)) {
      return JSON.stringify({
        address,
        floodZone: null,
        riskLevel: null,
        matchedParcel: null,
        error: "No parcel match found for this address.",
      });
    }

    const parcel = matchedParcel as Record<string, unknown>;
    const parcelId = typeof parcel.parcel_id === "string" ? parcel.parcel_id : null;
    if (!parcelId) {
      return JSON.stringify({
        address,
        floodZone: null,
        riskLevel: null,
        matchedParcel: null,
        error: "Parcel match is missing parcel_id.",
      });
    }

    const floodResult = await rpc("api_screen_flood", { parcel_id: parcelId });
    const floodZone = selectScreenFloodZone(floodResult);
    const riskLevel = floodZone ? classifyFloodRisk(floodZone) : null;
    const riskValue = riskLevel ? riskOrder[riskLevel] : null;

    return JSON.stringify({
      address,
      floodZone,
      riskLevel,
      riskValue,
      matchedParcel: parcel,
    });
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
