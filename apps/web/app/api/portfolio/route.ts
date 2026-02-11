import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { ParcelTriageSchema } from "@entitlement-os/shared";

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deals = await prisma.deal.findMany({
      where: { orgId: auth.orgId },
      include: {
        jurisdiction: { select: { name: true } },
        parcels: { select: { acreage: true } },
        _count: { select: { tasks: true, parcels: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Batch-load latest triage runs for all deals
    const dealIds = deals.map((d) => d.id);
    const triageRuns = await prisma.run.findMany({
      where: {
        orgId: auth.orgId,
        runType: "TRIAGE",
        status: "succeeded",
        dealId: { in: dealIds },
      },
      orderBy: { startedAt: "desc" },
      distinct: ["dealId"],
      select: { dealId: true, outputJson: true },
    });

    const triageByDeal = new Map(
      triageRuns.map((r) => [r.dealId, r.outputJson as Record<string, unknown> | null])
    );

    // Map deals to portfolio format
    const mappedDeals = deals.map((deal) => {
      const triageOutput = triageByDeal.get(deal.id);
      const totalAcreage = deal.parcels.reduce(
        (sum, p) => sum + (p.acreage ? Number(p.acreage.toString()) : 0),
        0
      );
      const triageCandidate =
        triageOutput &&
        typeof triageOutput === "object" &&
        "triage" in triageOutput &&
        triageOutput.triage &&
        typeof triageOutput.triage === "object"
          ? (triageOutput.triage as Record<string, unknown>)
          : ((triageOutput as Record<string, unknown> | null) ?? null);
      const triageParsed =
        triageCandidate != null
          ? ParcelTriageSchema.safeParse({
              ...triageCandidate,
              generated_at: triageCandidate.generated_at ?? new Date().toISOString(),
              deal_id: triageCandidate.deal_id ?? deal.id,
            })
          : null;
      const triage = triageParsed?.success ? triageParsed.data : null;
      const triageScore =
        triageOutput &&
        typeof triageOutput === "object" &&
        "triageScore" in triageOutput &&
        typeof triageOutput.triageScore === "number"
          ? Number(triageOutput.triageScore)
          : triage
          ? Math.round(
              ((10 -
                Object.values(triage.risk_scores).reduce((sum, value) => sum + value, 0) /
                  Math.max(Object.keys(triage.risk_scores).length, 1)) /
                10) *
                10000,
            ) / 100
          : null;
      const triageTier = triage?.decision ?? null;

      return {
        id: deal.id,
        name: deal.name,
        sku: deal.sku,
        status: deal.status,
        jurisdiction: deal.jurisdiction?.name ?? "Unknown",
        acreage: totalAcreage,
        triageScore,
        triageTier,
        taskCount: deal._count.tasks,
        parcelCount: deal._count.parcels,
        updatedAt: deal.updatedAt.toISOString(),
        createdAt: deal.createdAt.toISOString(),
      };
    });

    // Compute aggregate metrics
    const activeDeals = mappedDeals.filter(
      (d) => d.status !== "KILLED" && d.status !== "EXITED"
    );
    const totalAcreage = mappedDeals.reduce((s, d) => s + d.acreage, 0);
    const scoredDeals = mappedDeals.filter((d) => d.triageScore !== null);
    const avgTriageScore =
      scoredDeals.length > 0
        ? Math.round(
            scoredDeals.reduce((s, d) => s + (d.triageScore ?? 0), 0) /
              scoredDeals.length
          )
        : null;

    // Pipeline distribution
    const byStatus: Record<string, number> = {};
    for (const d of mappedDeals) {
      byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    }

    const bySku: Record<string, number> = {};
    for (const d of mappedDeals) {
      bySku[d.sku] = (bySku[d.sku] ?? 0) + 1;
    }

    const byJurisdiction: Record<string, number> = {};
    for (const d of mappedDeals) {
      byJurisdiction[d.jurisdiction] = (byJurisdiction[d.jurisdiction] ?? 0) + 1;
    }

    return NextResponse.json({
      deals: mappedDeals,
      metrics: {
        totalDeals: activeDeals.length,
        totalAcreage,
        avgTriageScore,
        byStatus,
        bySku,
        byJurisdiction,
      },
    });
  } catch (error) {
    console.error("Error fetching portfolio:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 }
    );
  }
}
