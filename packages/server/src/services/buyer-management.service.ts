import { prisma, type Prisma } from "@entitlement-os/db";

export class BuyerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuyerValidationError";
  }
}

type BuyerListFilters = {
  search?: string | null;
  buyerType?: string | null;
  dealId?: string | null;
  withDeals?: boolean;
};

export async function listBuyers(orgId: string, filters: BuyerListFilters) {
  const where: Prisma.BuyerWhereInput = { orgId };
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { company: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.buyerType) {
    where.buyerType = filters.buyerType;
  }
  if (filters.dealId) {
    where.outreach = { some: { dealId: filters.dealId } };
  }

  if (!filters.withDeals) {
    return prisma.buyer.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  const buyers = await prisma.buyer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      outreach: {
        where: filters.dealId ? { dealId: filters.dealId } : undefined,
        select: {
          status: true,
          channel: true,
          lastContactAt: true,
          nextFollowupAt: true,
          deal: {
            select: {
              id: true,
              name: true,
              status: true,
              sku: true,
              jurisdiction: {
                select: {
                  id: true,
                  name: true,
                  kind: true,
                  state: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return buyers.map((buyer) => {
    const dealsById = new Map<
      string,
      {
        id: string;
        name: string;
        status: string;
        sku: string;
        jurisdiction: {
          id: string;
          name: string;
          kind: string;
          state: string;
        } | null;
      }
    >();

    for (const relation of buyer.outreach ?? []) {
      if (!relation.deal || dealsById.has(relation.deal.id)) continue;
      dealsById.set(relation.deal.id, {
        id: relation.deal.id,
        name: relation.deal.name,
        status: String(relation.deal.status),
        sku: String(relation.deal.sku),
        jurisdiction: relation.deal.jurisdiction
          ? {
              id: relation.deal.jurisdiction.id,
              name: relation.deal.jurisdiction.name,
              kind: relation.deal.jurisdiction.kind,
              state: relation.deal.jurisdiction.state,
            }
          : null,
      });
    }

    const { outreach, ...buyerFields } = buyer;
    return {
      ...buyerFields,
      deals: Array.from(dealsById.values()),
      outreach: undefined,
    };
  });
}

export async function createBuyer(orgId: string, body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const buyerType = typeof body.buyerType === "string" ? body.buyerType.trim() : "";

  if (!name || !buyerType) {
    throw new BuyerValidationError("name and buyerType are required");
  }

  return prisma.buyer.create({
    data: {
      orgId,
      name,
      company: typeof body.company === "string" ? body.company : null,
      email: typeof body.email === "string" ? body.email : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      buyerType,
      skuInterests:
        normalizeStringArray(body.skuInterests) as Prisma.BuyerCreateInput["skuInterests"],
      jurisdictionInterests: normalizeStringArray(body.jurisdictionInterests),
      notes: typeof body.notes === "string" ? body.notes : null,
    },
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
