import "server-only";

import { prisma } from "@entitlement-os/db";

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

export async function addMarketDataPoint(
  parish: string,
  dataType: MarketDataType,
  source: string,
  data: Record<string, unknown>,
  observedAt?: Date,
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
  }>,
): Promise<number> {
  const result = await prisma.marketDataPoint.createMany({
    data: points.map((point) => ({
      parish: point.parish,
      dataType: point.dataType,
      source: point.source,
      data: point.data as object,
      observedAt: point.observedAt ?? new Date(),
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function getParishSummary(
  parish: string,
  daysBack = 90,
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

  const comps = dataPoints.filter((point) => point.dataType === "comp_sale");
  const listings = dataPoints.filter((point) => point.dataType === "listing");
  const permits = dataPoints.filter((point) => point.dataType === "permit");

  const psfValues = comps
    .map((comp) => {
      const data = comp.data as Record<string, unknown>;
      return typeof data.price_psf === "number" ? data.price_psf : null;
    })
    .filter((value): value is number => value !== null);

  const capRateValues = comps
    .map((comp) => {
      const data = comp.data as Record<string, unknown>;
      return typeof data.cap_rate === "number" ? data.cap_rate : null;
    })
    .filter((value): value is number => value !== null);

  const domValues = listings
    .map((listing) => {
      const data = listing.data as Record<string, unknown>;
      return typeof data.days_on_market === "number" ? data.days_on_market : null;
    })
    .filter((value): value is number => value !== null);

  const mapRecord = (record: typeof dataPoints[number]): MarketDataRecord => ({
    id: record.id,
    parish: record.parish,
    dataType: record.dataType as MarketDataType,
    source: record.source,
    data: (record.data ?? {}) as Record<string, unknown>,
    observedAt: record.observedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  });

  return {
    parish,
    compSaleCount: comps.length,
    listingCount: listings.length,
    permitCount: permits.length,
    avgSalePricePsf:
      psfValues.length > 0
        ? Math.round((psfValues.reduce((left, right) => left + right, 0) / psfValues.length) * 100) /
          100
        : null,
    avgCapRate:
      capRateValues.length > 0
        ? Math.round(
            (capRateValues.reduce((left, right) => left + right, 0) / capRateValues.length) * 100,
          ) / 100
        : null,
    avgDaysOnMarket:
      domValues.length > 0
        ? Math.round(domValues.reduce((left, right) => left + right, 0) / domValues.length)
        : null,
    recentComps: comps.slice(0, 10).map(mapRecord),
    recentListings: listings.slice(0, 10).map(mapRecord),
  };
}

export async function getMarketTrends(
  parish: string,
  monthsBack = 12,
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

  const byMonth = new Map<string, { psfValues: number[]; capRates: number[]; count: number }>();

  for (const comp of comps) {
    const month = comp.observedAt.toISOString().slice(0, 7);
    const entry = byMonth.get(month) ?? {
      psfValues: [],
      capRates: [],
      count: 0,
    };
    entry.count++;

    const data = comp.data as Record<string, unknown>;
    if (typeof data.price_psf === "number") entry.psfValues.push(data.price_psf);
    if (typeof data.cap_rate === "number") entry.capRates.push(data.cap_rate);

    byMonth.set(month, entry);
  }

  return [...byMonth.entries()].map(([period, data]) => ({
    period,
    avgPricePsf:
      data.psfValues.length > 0
        ? Math.round(
            (data.psfValues.reduce((left, right) => left + right, 0) / data.psfValues.length) * 100,
          ) / 100
        : null,
    avgCapRate:
      data.capRates.length > 0
        ? Math.round(
            (data.capRates.reduce((left, right) => left + right, 0) / data.capRates.length) * 100,
          ) / 100
        : null,
    transactionCount: data.count,
  }));
}

export async function getRecentDataPoints(
  parish?: string,
  dataType?: MarketDataType,
  limit = 50,
): Promise<MarketDataRecord[]> {
  const where: Record<string, unknown> = {};
  if (parish) where.parish = { equals: parish, mode: "insensitive" };
  if (dataType) where.dataType = dataType;

  const records = await prisma.marketDataPoint.findMany({
    where,
    orderBy: { observedAt: "desc" },
    take: limit,
  });

  return records.map((record) => ({
    id: record.id,
    parish: record.parish,
    dataType: record.dataType as MarketDataType,
    source: record.source,
    data: (record.data ?? {}) as Record<string, unknown>,
    observedAt: record.observedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  }));
}
