import { tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";

const HIGH_IMPACT_STATUSES = ["APPROVED", "EXIT_MARKETED", "EXITED", "KILLED"] as const;
const PACK_STALE_DAYS = 7;
const PACK_COVERAGE_MINIMUM = 0.75;

function isJsonStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function daysSince(value: Date): number {
  return Math.floor((Date.now() - value.getTime()) / (24 * 60 * 60 * 1000));
}

export const getDealContext = tool({
  name: "get_deal_context",
  description:
    "Get full context for a deal including parcels, tasks, latest triage, and artifacts",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID"),
  }),
  execute: async ({ orgId, dealId }) => {
    const dealSkuParam = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { sku: true },
    });
    if (!dealSkuParam) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const deal = await prisma.deal.findFirstOrThrow({
      where: { id: dealId, orgId },
      include: {
        parcels: true,
        tasks: { orderBy: { pipelineStep: "asc" } },
        artifacts: { orderBy: { version: "desc" } },
        jurisdiction: {
          include: {
            parishPackVersions: {
              where: { status: "current", sku: dealSkuParam.sku },
              orderBy: { generatedAt: "desc" },
              take: 1,
              select: {
                id: true,
                version: true,
                status: true,
                generatedAt: true,
                sourceEvidenceIds: true,
                sourceSnapshotIds: true,
                sourceContentHashes: true,
                sourceUrls: true,
                officialOnly: true,
                packCoverageScore: true,
                canonicalSchemaVersion: true,
                coverageSourceCount: true,
                inputHash: true,
              },
            },
          },
        },
      },
    });

    const latestPack = deal.jurisdiction?.parishPackVersions?.[0];
    const stalenessDays = latestPack?.generatedAt
      ? daysSince(latestPack.generatedAt)
      : null;
    const isStale = stalenessDays !== null && stalenessDays >= PACK_STALE_DAYS;
    const missingEvidence: string[] = [];
    if (!latestPack) {
      missingEvidence.push("No current parish pack found for this jurisdiction/SKU.");
    }
    if (isStale) {
      missingEvidence.push("Jurisdiction pack is stale.");
    }
    if (latestPack && !isJsonStringArray(latestPack.sourceEvidenceIds)) {
      missingEvidence.push("Pack missing sourceEvidenceIds lineage.");
    }
    if (
      latestPack &&
      latestPack.packCoverageScore !== null &&
      latestPack.packCoverageScore < PACK_COVERAGE_MINIMUM
    ) {
      missingEvidence.push(
        `Pack coverage score is ${latestPack.packCoverageScore.toFixed(2)} and below target threshold.`,
      );
    }

    const result = {
      ...deal,
      packContext: {
        hasPack: !!latestPack,
        isStale,
        stalenessDays,
        latestPack: latestPack
          ? {
              id: latestPack.id,
              version: latestPack.version,
              status: latestPack.status,
              generatedAt: latestPack.generatedAt.toISOString(),
              sourceEvidenceIds: latestPack.sourceEvidenceIds,
              sourceSnapshotIds: latestPack.sourceSnapshotIds,
              sourceContentHashes: latestPack.sourceContentHashes,
              sourceUrls: latestPack.sourceUrls,
              officialOnly: latestPack.officialOnly,
              packCoverageScore: latestPack.packCoverageScore,
              canonicalSchemaVersion: latestPack.canonicalSchemaVersion,
              coverageSourceCount: latestPack.coverageSourceCount,
              inputHash: latestPack.inputHash,
            }
          : null,
        missingEvidence,
      },
    };

    return JSON.stringify(result);
  },
});

export const createDeal = tool({
  name: "create_deal",
  description: "Create a new deal with a name, SKU type, and jurisdiction",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    createdBy: z.string().uuid().describe("The user ID creating the deal"),
    name: z.string().min(1).describe("Name of the deal"),
    sku: z
      .enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"])
      .describe("The SKU type for this deal"),
    jurisdictionId: z
      .string()
      .uuid()
      .describe("The jurisdiction this deal falls under"),
    notes: z.string().nullable().describe("Optional notes for the deal"),
    targetCloseDate: z
      .string()
      .nullable()
      .describe("Optional target close date (ISO 8601)"),
  }),
  execute: async ({
    orgId,
    createdBy,
    name,
    sku,
    jurisdictionId,
    notes,
    targetCloseDate,
  }) => {
    const deal = await prisma.deal.create({
      data: {
        orgId,
        createdBy,
        name,
        sku,
        jurisdictionId,
        notes: notes ?? null,
        targetCloseDate: targetCloseDate
          ? new Date(targetCloseDate)
          : null,
      },
    });
    return JSON.stringify(deal);
  },
});

export const updateDealStatus = tool({
  name: "update_deal_status",
  description: "Update the status of a deal (e.g. INTAKE -> TRIAGE_DONE)",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID to update"),
    status: z
      .enum([
        "INTAKE",
        "TRIAGE_DONE",
        "PREAPP",
        "CONCEPT",
        "NEIGHBORS",
        "SUBMITTED",
        "HEARING",
        "APPROVED",
        "EXIT_MARKETED",
        "EXITED",
        "KILLED",
      ])
      .describe("The new deal status"),
    notes: z.string().nullable().describe("Optional notes about the status change"),
    confirmed: z
      .boolean()
      .nullable()
      .describe("Required true for high-impact status transitions"),
  }),
  needsApproval: true,
  execute: async ({ orgId, dealId, status, notes, confirmed }) => {
    const highImpact = HIGH_IMPACT_STATUSES.includes(
      status as (typeof HIGH_IMPACT_STATUSES)[number],
    );
    if (highImpact && !confirmed) {
      return JSON.stringify({
        error:
          `High-impact transition to ${status} requires confirmed: true.\n` +
          "Set confirmed=true to allow this status update.",
      });
    }

    const deal = await prisma.deal.updateMany({
      where: { id: dealId, orgId },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
      },
    });
    if (deal.count === 0) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }
    const updated = await prisma.deal.findFirstOrThrow({
      where: { id: dealId, orgId },
    });
    return JSON.stringify(updated);
  },
});

export const listDeals = tool({
  name: "list_deals",
  description: "List deals with optional filters by status and/or SKU type",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    status: z
      .enum([
        "INTAKE",
        "TRIAGE_DONE",
        "PREAPP",
        "CONCEPT",
        "NEIGHBORS",
        "SUBMITTED",
        "HEARING",
        "APPROVED",
        "EXIT_MARKETED",
        "EXITED",
        "KILLED",
      ])
      .nullable()
      .describe("Filter by deal status"),
    sku: z
      .enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"])
      .nullable()
      .describe("Filter by SKU type"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .describe("Maximum number of deals to return (default 20)"),
  }),
  execute: async ({ orgId, status, sku, limit }) => {
    const deals = await prisma.deal.findMany({
      where: {
        orgId,
        ...(status ? { status } : {}),
        ...(sku ? { sku } : {}),
      },
      include: {
        jurisdiction: { select: { name: true, state: true } },
        _count: { select: { parcels: true, tasks: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit ?? 20,
    });
    return JSON.stringify(deals);
  },
});

export const addParcelToDeal = tool({
  name: "add_parcel_to_deal",
  description: "Attach a parcel (by address and optional details) to a deal",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal to attach the parcel to"),
    address: z.string().min(1).describe("Street address of the parcel"),
    apn: z.string().nullable().describe("Assessor parcel number"),
    lat: z.number().nullable().describe("Latitude"),
    lng: z.number().nullable().describe("Longitude"),
    acreage: z.number().nullable().describe("Acreage of the parcel"),
    currentZoning: z
      .string()
      .nullable()
      .describe("Current zoning code (e.g. A1, C2, M1)"),
    futureLandUse: z
      .string()
      .nullable()
      .describe("Future land use designation"),
    utilitiesNotes: z
      .string()
      .nullable()
      .describe("Notes about utility access"),
  }),
  execute: async ({
    orgId,
    dealId,
    address,
    apn,
    lat,
    lng,
    acreage,
    currentZoning,
    futureLandUse,
    utilitiesNotes,
  }) => {
    // Verify the deal belongs to the org
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { id: true },
    });
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const parcel = await prisma.parcel.create({
      data: {
        orgId,
        dealId,
        address,
        apn: apn ?? null,
        lat: lat ?? null,
        lng: lng ?? null,
        acreage: acreage ?? null,
        currentZoning: currentZoning ?? null,
        futureLandUse: futureLandUse ?? null,
        utilitiesNotes: utilitiesNotes ?? null,
      },
    });
    return JSON.stringify(parcel);
  },
});

export const updateParcel = tool({
  name: "update_parcel",
  description:
    "Update an existing parcel with enriched data (coordinates, APN, acreage, zoning, etc.). Use this after scanning the property database and getting user approval to associate the findings with the deal.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    parcelId: z.string().uuid().describe("The parcel ID to update"),
    apn: z.string().nullable().describe("Assessor parcel number"),
    lat: z.number().nullable().describe("Latitude"),
    lng: z.number().nullable().describe("Longitude"),
    acreage: z.number().nullable().describe("Acreage of the parcel"),
    currentZoning: z
      .string()
      .nullable()
      .describe("Current zoning code (e.g. A1, C2, M1)"),
    futureLandUse: z
      .string()
      .nullable()
      .describe("Future land use designation"),
    utilitiesNotes: z
      .string()
      .nullable()
      .describe("Notes about utility access"),
    floodZone: z
      .string()
      .nullable()
      .describe("FEMA flood zone code (e.g. X, AE, A)"),
    soilsNotes: z
      .string()
      .nullable()
      .describe("Summary of soil conditions from screening"),
    wetlandsNotes: z
      .string()
      .nullable()
      .describe("Summary of wetland status from screening"),
    envNotes: z
      .string()
      .nullable()
      .describe("Summary of environmental screening (EPA/LDEQ findings)"),
    trafficNotes: z
      .string()
      .nullable()
      .describe("Summary of traffic/access data from screening"),
    propertyDbId: z
      .string()
      .uuid()
      .nullable()
      .describe("The parcel UUID from the Louisiana Property Database, for cross-reference"),
  }),
  execute: async ({
    orgId,
    parcelId,
    apn,
    lat,
    lng,
    acreage,
    currentZoning,
    futureLandUse,
    utilitiesNotes,
    floodZone,
    soilsNotes,
    wetlandsNotes,
    envNotes,
    trafficNotes,
    propertyDbId,
  }) => {
    // Only update fields that were provided (non-null)
    const data: Record<string, unknown> = {};
    if (apn != null) data.apn = apn;
    if (lat != null) data.lat = lat;
    if (lng != null) data.lng = lng;
    if (acreage != null) data.acreage = acreage;
    if (currentZoning != null) data.currentZoning = currentZoning;
    if (futureLandUse != null) data.futureLandUse = futureLandUse;
    if (utilitiesNotes != null) data.utilitiesNotes = utilitiesNotes;
    if (floodZone != null) data.floodZone = floodZone;
    if (soilsNotes != null) data.soilsNotes = soilsNotes;
    if (wetlandsNotes != null) data.wetlandsNotes = wetlandsNotes;
    if (envNotes != null) data.envNotes = envNotes;
    if (trafficNotes != null) data.trafficNotes = trafficNotes;
    if (propertyDbId != null) data.propertyDbId = propertyDbId;

    if (Object.keys(data).length === 0) {
      return JSON.stringify({ error: "No fields to update" });
    }

    const result = await prisma.parcel.updateMany({
      where: { id: parcelId, orgId },
      data,
    });

    if (result.count === 0) {
      return JSON.stringify({ error: "Parcel not found or access denied" });
    }

    const updated = await prisma.parcel.findFirstOrThrow({
      where: { id: parcelId, orgId },
    });
    return JSON.stringify(updated);
  },
});
