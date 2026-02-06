import { tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";

export const getDealContext = tool({
  name: "get_deal_context",
  description:
    "Get full context for a deal including parcels, tasks, latest triage, and artifacts",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID"),
  }),
  execute: async ({ orgId, dealId }) => {
    const deal = await prisma.deal.findFirstOrThrow({
      where: { id: dealId, orgId },
      include: {
        parcels: true,
        tasks: { orderBy: { pipelineStep: "asc" } },
        artifacts: { orderBy: { version: "desc" } },
        jurisdiction: true,
      },
    });
    return JSON.stringify(deal);
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
    notes: z.string().optional().describe("Optional notes for the deal"),
    targetCloseDate: z
      .string()
      .optional()
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
    notes: z.string().optional().describe("Optional notes about the status change"),
  }),
  execute: async ({ orgId, dealId, status, notes }) => {
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
      .optional()
      .describe("Filter by deal status"),
    sku: z
      .enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"])
      .optional()
      .describe("Filter by SKU type"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
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
    apn: z.string().optional().describe("Assessor parcel number"),
    lat: z.number().optional().describe("Latitude"),
    lng: z.number().optional().describe("Longitude"),
    acreage: z.number().optional().describe("Acreage of the parcel"),
    currentZoning: z
      .string()
      .optional()
      .describe("Current zoning code (e.g. A1, C2, M1)"),
    futureLandUse: z
      .string()
      .optional()
      .describe("Future land use designation"),
    utilitiesNotes: z
      .string()
      .optional()
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
