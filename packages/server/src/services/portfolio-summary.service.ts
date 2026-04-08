import { prisma } from "@entitlement-os/db";
import { ParcelTriageSchema } from "@entitlement-os/shared";

export async function getPortfolioSummary(orgId: string) {
  const deals = await prisma.deal.findMany({
    where: { orgId },
    include: {
      jurisdiction: { select: { name: true } },
      parcels: { select: { acreage: true } },
      _count: { select: { tasks: true, parcels: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const dealIds = deals.map((deal) => deal.id);
  const triageRuns = await prisma.run.findMany({
    where: {
      orgId,
      runType: "TRIAGE",
      status: "succeeded",
      dealId: { in: dealIds },
    },
    orderBy: { startedAt: "desc" },
    distinct: ["dealId"],
    select: { dealId: true, outputJson: true },
  });

  const triageByDeal = new Map(
    triageRuns.map((run) => [run.dealId, run.outputJson as Record<string, unknown> | null]),
  );

  const mappedDeals = deals.map((deal) => {
    const triageOutput = triageByDeal.get(deal.id);
    const totalAcreage = deal.parcels.reduce(
      (sum, parcel) => sum + (parcel.acreage ? Number(parcel.acreage.toString()) : 0),
      0,
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

  const activeDeals = mappedDeals.filter(
    (deal) => deal.status !== "KILLED" && deal.status !== "EXITED",
  );
  const totalAcreage = mappedDeals.reduce((sum, deal) => sum + deal.acreage, 0);
  const scoredDeals = mappedDeals.filter((deal) => deal.triageScore !== null);
  const avgTriageScore =
    scoredDeals.length > 0
      ? Math.round(
          scoredDeals.reduce((sum, deal) => sum + (deal.triageScore ?? 0), 0) /
            scoredDeals.length,
        )
      : null;

  const byStatus: Record<string, number> = {};
  const bySku: Record<string, number> = {};
  const byJurisdiction: Record<string, number> = {};
  for (const deal of mappedDeals) {
    byStatus[deal.status] = (byStatus[deal.status] ?? 0) + 1;
    bySku[deal.sku] = (bySku[deal.sku] ?? 0) + 1;
    byJurisdiction[deal.jurisdiction] = (byJurisdiction[deal.jurisdiction] ?? 0) + 1;
  }

  return {
    deals: mappedDeals,
    metrics: {
      totalDeals: activeDeals.length,
      totalAcreage,
      avgTriageScore,
      byStatus,
      bySku,
      byJurisdiction,
    },
  };
}
