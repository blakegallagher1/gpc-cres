import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [entities, deals, taxEvents] = await Promise.all([
      prisma.entity.findMany({
        where: { orgId: auth.orgId },
        include: { deals: true },
      }),
      prisma.deal.findMany({
        where: { orgId: auth.orgId },
        include: { parcels: { select: { acreage: true } } },
      }),
      prisma.taxEvent.findMany({
        where: { orgId: auth.orgId, status: "active" },
      }),
    ]);

    // Compute portfolio value from deal data
    const totalAcreage = deals.reduce((sum, d) => {
      const parcelAcreage = d.parcels.reduce(
        (s, p) => s + (p.acreage ? Number(p.acreage.toString()) : 0),
        0
      );
      return sum + parcelAcreage;
    }, 0);

    const activeDealCount = deals.filter((d) => d.status !== "KILLED").length;
    const approvedDeals = deals.filter((d) => ["APPROVED", "EXIT_MARKETED", "EXITED"].includes(d.status));

    // Simple value estimate based on acreage (this is a rough estimate)
    const estimatedRealEstateValue = totalAcreage * 50000; // $50K/acre rough average

    return NextResponse.json({
      summary: {
        entityCount: entities.length,
        totalDeals: activeDealCount,
        totalAcreage,
        estimatedRealEstateValue,
        approvedDealCount: approvedDeals.length,
        activeTaxAlerts: taxEvents.length,
        entities: entities.map((e) => ({
          id: e.id,
          name: e.name,
          entityType: e.entityType,
          dealCount: e.deals.length,
        })),
      },
    });
  } catch (error) {
    console.error("Error computing wealth summary:", error);
    return NextResponse.json({ error: "Failed to compute summary" }, { status: 500 });
  }
}
