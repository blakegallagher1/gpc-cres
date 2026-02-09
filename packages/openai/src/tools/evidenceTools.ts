import { tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";

export const evidenceSnapshot = tool({
  name: "evidence_snapshot",
  description:
    "Capture a snapshot of a URL for evidence tracking. Returns the snapshot metadata. (Stub - full implementation pending packages/evidence)",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    url: z.string().min(1).describe("The URL to snapshot (e.g. https://example.com/page)"),
    title: z.string().nullable().describe("Optional title for the evidence source"),
  }),
  execute: async ({ orgId, url, title }) => {
    // TODO: Integrate with packages/evidence when available.
    // For now, upsert the evidence source and return a placeholder.
    const domain = new URL(url).hostname;

    const source = await prisma.evidenceSource.upsert({
      where: { orgId_url: { orgId, url } },
      update: {
        title: title ?? undefined,
      },
      create: {
        orgId,
        url,
        domain,
        title: title ?? null,
        isOfficial: false,
      },
    });

    return JSON.stringify({
      sourceId: source.id,
      url: source.url,
      domain: source.domain,
      title: source.title,
      isOfficial: source.isOfficial,
      _stub: true,
      _note:
        "Snapshot capture not yet implemented. Evidence source has been registered. Full snapshot (fetch, hash, store) will be handled by the evidence service.",
    });
  },
});

export const floodZoneLookup = tool({
  name: "flood_zone_lookup",
  description:
    "Check FEMA flood zone designation for a given address. Returns flood zone info including zone code and risk level. (Stub - will integrate FEMA API)",
  parameters: z.object({
    address: z
      .string()
      .min(1)
      .describe("The street address to check for flood zone"),
    lat: z.number().nullable().describe("Latitude for more precise lookup"),
    lng: z.number().nullable().describe("Longitude for more precise lookup"),
  }),
  execute: async ({ address, lat, lng }) => {
    // TODO: Integrate with FEMA National Flood Hazard Layer (NFHL) API
    // or Supabase PostGIS flood_zones table.
    return JSON.stringify({
      address,
      coordinates: lat && lng ? { lat, lng } : null,
      floodZone: null,
      riskLevel: null,
      _stub: true,
      _note:
        "FEMA flood zone lookup not yet implemented. Use web_search tool to check FEMA flood maps, or query the Supabase flood_zones table directly.",
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
