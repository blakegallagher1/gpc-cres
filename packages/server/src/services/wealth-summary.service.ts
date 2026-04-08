import { prisma } from "@entitlement-os/db";

export async function getWealthSummary(orgId: string): Promise<{
  summary: {
    entityCount: number;
    totalDeals: number;
    totalAcreage: number;
    estimatedRealEstateValue: number;
    approvedDealCount: number;
    activeTaxAlerts: number;
    entities: Array<{
      id: string;
      name: string;
      entityType: string;
      dealCount: number;
    }>;
  };
}> {
  const [entities, deals, taxEvents] = await Promise.all([
    prisma.entity.findMany({
      where: { orgId },
      include: { deals: true },
    }),
    prisma.deal.findMany({
      where: { orgId },
      include: { parcels: { select: { acreage: true } } },
    }),
    prisma.taxEvent.findMany({
      where: { orgId, status: "active" },
    }),
  ]);

  const totalAcreage = deals.reduce((sum, deal) => {
    const parcelAcreage = deal.parcels.reduce(
      (parcelSum, parcel) =>
        parcelSum + (parcel.acreage ? Number(parcel.acreage.toString()) : 0),
      0,
    );
    return sum + parcelAcreage;
  }, 0);

  const activeDealCount = deals.filter((deal) => deal.status !== "KILLED").length;
  const approvedDealCount = deals.filter((deal) =>
    ["APPROVED", "EXIT_MARKETED", "EXITED"].includes(deal.status),
  ).length;

  return {
    summary: {
      entityCount: entities.length,
      totalDeals: activeDealCount,
      totalAcreage,
      estimatedRealEstateValue: totalAcreage * 50000,
      approvedDealCount,
      activeTaxAlerts: taxEvents.length,
      entities: entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        entityType: entity.entityType,
        dealCount: entity.deals.length,
      })),
    },
  };
}
