import { tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";

export const addBuyer = tool({
  name: "add_buyer",
  description: "Add a new buyer to the database",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    name: z.string().min(1).describe("Buyer's full name"),
    company: z.string().nullable().describe("Buyer's company name"),
    email: z.string().nullable().describe("Buyer's email address"),
    phone: z.string().nullable().describe("Buyer's phone number"),
    buyerType: z
      .enum(["operator", "developer", "investor", "broker"])
      .describe("Type of buyer"),
    skuInterests: z
      .array(z.enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"]))
      .min(1)
      .describe("SKU types this buyer is interested in"),
    jurisdictionInterests: z
      .array(z.string().uuid())
      .nullable()
      .describe("Jurisdiction IDs this buyer is interested in"),
    notes: z.string().nullable().describe("Additional notes about the buyer"),
  }),
  execute: async ({
    orgId,
    name,
    company,
    email,
    phone,
    buyerType,
    skuInterests,
    jurisdictionInterests,
    notes,
  }) => {
    const buyer = await prisma.buyer.create({
      data: {
        orgId,
        name,
        company: company ?? null,
        email: email ?? null,
        phone: phone ?? null,
        buyerType,
        skuInterests,
        jurisdictionInterests: jurisdictionInterests ?? [],
        notes: notes ?? null,
      },
    });
    return JSON.stringify(buyer);
  },
});

export const searchBuyers = tool({
  name: "search_buyers",
  description:
    "Search buyers by SKU interest, jurisdiction interest, buyer type, or name",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    sku: z
      .enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"])
      .nullable()
      .describe("Filter by SKU interest"),
    jurisdictionId: z
      .string()
      .uuid()
      .nullable()
      .describe("Filter by jurisdiction interest"),
    buyerType: z
      .enum(["operator", "developer", "investor", "broker"])
      .nullable()
      .describe("Filter by buyer type"),
    nameSearch: z
      .string()
      .nullable()
      .describe("Partial name or company search"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .describe("Maximum results to return (default 20)"),
  }),
  execute: async ({ orgId, sku, jurisdictionId, buyerType, nameSearch, limit }) => {
    const buyers = await prisma.buyer.findMany({
      where: {
        orgId,
        ...(buyerType ? { buyerType } : {}),
        ...(sku ? { skuInterests: { has: sku } } : {}),
        ...(jurisdictionId
          ? { jurisdictionInterests: { has: jurisdictionId } }
          : {}),
        ...(nameSearch
          ? {
              OR: [
                { name: { contains: nameSearch, mode: "insensitive" as const } },
                { company: { contains: nameSearch, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { outreach: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit ?? 20,
    });
    return JSON.stringify(buyers);
  },
});

export const logOutreach = tool({
  name: "log_outreach",
  description: "Record a contact attempt with a buyer for a specific deal",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal this outreach is for"),
    buyerId: z.string().uuid().describe("The buyer being contacted"),
    channel: z
      .enum(["call", "email", "text", "in_person"])
      .describe("Communication channel used"),
    status: z
      .enum(["planned", "sent", "completed", "no_response", "not_interested"])
      .describe("Status of the outreach attempt"),
    notes: z.string().nullable().describe("Notes about the contact attempt"),
    nextFollowupAt: z
      .string()
      .nullable()
      .describe("Next follow-up date (ISO 8601 datetime)"),
  }),
  needsApproval: true,
  execute: async ({
    orgId,
    dealId,
    buyerId,
    channel,
    status,
    notes,
    nextFollowupAt,
  }) => {
    // Verify deal and buyer belong to org
    const [deal, buyer] = await Promise.all([
      prisma.deal.findFirst({ where: { id: dealId, orgId }, select: { id: true } }),
      prisma.buyer.findFirst({ where: { id: buyerId, orgId }, select: { id: true } }),
    ]);

    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }
    if (!buyer) {
      return JSON.stringify({ error: "Buyer not found or access denied" });
    }

    const outreach = await prisma.outreach.create({
      data: {
        orgId,
        dealId,
        buyerId,
        channel,
        status,
        notes: notes ?? null,
        lastContactAt: status !== "planned" ? new Date() : null,
        nextFollowupAt: nextFollowupAt ? new Date(nextFollowupAt) : null,
      },
    });
    return JSON.stringify(outreach);
  },
});
