import { prisma } from "@entitlement-os/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MarketDataType =
  | "comp_sale"
  | "listing"
  | "permit"
  | "vacancy"
  | "rent";

export interface MarketDataRecord {
  id: string;
  parish: string;
  dataType: MarketDataType;
  source: string;
  data: Record<string, unknown>;
  observedAt: string;
  createdAt: string;
}

export interface ParishMarketSummary {
  parish: string;
  compSaleCount: number;
  listingCount: number;
  permitCount: number;
  avgSalePricePsf: number | null;
  avgCapRate: number | null;
  avgDaysOnMarket: number | null;
  recentComps: MarketDataRecord[];
  recentListings: MarketDataRecord[];
}

export interface MarketTrend {
  period: string;
  avgPricePsf: number | null;
  avgCapRate: number | null;
  transactionCount: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function addMarketDataPoint(
  parish: string,
  dataType: MarketDataType,
  source: string,
  data: Record<string, unknown>,
  observedAt?: Date
): Promise<string> {
  const record = await prisma.marketDataPoint.create({
    data: {
      parish,
      dataType,
      source,
      data: data as object,
      observedAt: observedAt ?? new Date(),
    },
  });
  return record.id;
}

export async function addBulkMarketData(
  points: Array<{
    parish: string;
    dataType: MarketDataType;
    source: string;
    data: Record<string, unknown>;
    observedAt?: Date;
  }>
): Promise<number> {
  const result = await prisma.marketDataPoint.createMany({
    data: points.map((p) => ({
      parish: p.parish,
      dataType: p.dataType,
      source: p.source,
      data: p.data as object,
      observedAt: p.observedAt ?? new Date(),
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function getParishSummary(
  parish: string,
  daysBack = 90
): Promise<ParishMarketSummary> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const dataPoints = await prisma.marketDataPoint.findMany({
    where: {
      parish: { equals: parish, mode: "insensitive" },
      observedAt: { gte: since },
    },
    orderBy: { observedAt: "desc" },
  });

  const comps = dataPoints.filter((d) => d.dataType === "comp_sale");
  const listings = dataPoints.filter((d) => d.dataType === "listing");
  const permits = dataPoints.filter((d) => d.dataType === "permit");

  // Calculate averages from comp sale data
  const psfValues = comps
    .map((c) => {
      const d = c.data as Record<string, unknown>;
      return typeof d.price_psf === "number" ? d.price_psf : null;
    })
    .filter((v): v is number => v !== null);

  const capRateValues = comps
    .map((c) => {
      const d = c.data as Record<string, unknown>;
      return typeof d.cap_rate === "number" ? d.cap_rate : null;
    })
    .filter((v): v is number => v !== null);

  const domValues = listings
    .map((l) => {
      const d = l.data as Record<string, unknown>;
      return typeof d.days_on_market === "number" ? d.days_on_market : null;
    })
    .filter((v): v is number => v !== null);

  const mapRecord = (r: typeof dataPoints[number]): MarketDataRecord => ({
    id: r.id,
    parish: r.parish,
    dataType: r.dataType as MarketDataType,
    source: r.source,
    data: (r.data ?? {}) as Record<string, unknown>,
    observedAt: r.observedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  });

  return {
    parish,
    compSaleCount: comps.length,
    listingCount: listings.length,
    permitCount: permits.length,
    avgSalePricePsf:
      psfValues.length > 0
        ? Math.round(
            (psfValues.reduce((a, b) => a + b, 0) / psfValues.length) * 100
          ) / 100
        : null,
    avgCapRate:
      capRateValues.length > 0
        ? Math.round(
            (capRateValues.reduce((a, b) => a + b, 0) / capRateValues.length) *
              100
          ) / 100
        : null,
    avgDaysOnMarket:
      domValues.length > 0
        ? Math.round(
            domValues.reduce((a, b) => a + b, 0) / domValues.length
          )
        : null,
    recentComps: comps.slice(0, 10).map(mapRecord),
    recentListings: listings.slice(0, 10).map(mapRecord),
  };
}

export async function getMarketTrends(
  parish: string,
  monthsBack = 12
): Promise<MarketTrend[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const comps = await prisma.marketDataPoint.findMany({
    where: {
      parish: { equals: parish, mode: "insensitive" },
      dataType: "comp_sale",
      observedAt: { gte: since },
    },
    orderBy: { observedAt: "asc" },
  });

  // Group by month
  const byMonth = new Map<
    string,
    { psfValues: number[]; capRates: number[]; count: number }
  >();

  for (const c of comps) {
    const month = c.observedAt.toISOString().slice(0, 7); // YYYY-MM
    const entry = byMonth.get(month) ?? {
      psfValues: [],
      capRates: [],
      count: 0,
    };
    entry.count++;

    const d = c.data as Record<string, unknown>;
    if (typeof d.price_psf === "number") entry.psfValues.push(d.price_psf);
    if (typeof d.cap_rate === "number") entry.capRates.push(d.cap_rate);

    byMonth.set(month, entry);
  }

  return [...byMonth.entries()].map(([period, data]) => ({
    period,
    avgPricePsf:
      data.psfValues.length > 0
        ? Math.round(
            (data.psfValues.reduce((a, b) => a + b, 0) /
              data.psfValues.length) *
              100
          ) / 100
        : null,
    avgCapRate:
      data.capRates.length > 0
        ? Math.round(
            (data.capRates.reduce((a, b) => a + b, 0) /
              data.capRates.length) *
              100
          ) / 100
        : null,
    transactionCount: data.count,
  }));
}

export async function getRecentDataPoints(
  parish?: string,
  dataType?: MarketDataType,
  limit = 50
): Promise<MarketDataRecord[]> {
  const where: Record<string, unknown> = {};
  if (parish) where.parish = { equals: parish, mode: "insensitive" };
  if (dataType) where.dataType = dataType;

  const records = await prisma.marketDataPoint.findMany({
    where,
    orderBy: { observedAt: "desc" },
    take: limit,
  });

  return records.map((r) => ({
    id: r.id,
    parish: r.parish,
    dataType: r.dataType as MarketDataType,
    source: r.source,
    data: (r.data ?? {}) as Record<string, unknown>,
    observedAt: r.observedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}
