import { prisma, type Prisma } from "@entitlement-os/db";

// MOAT Phase 4-003 — Asset Management + Disposition Tracking
// Naming: this file sits under packages/server/src/deals and uses the
// `deal-asset-performance` prefix because `packages/server/src/services/
// asset-management.service.ts` already exists for a different concern (asset
// CRUD). This service focuses on post-close performance tracking against a
// Deal.

// -----------------------------------------------------------------------------
// Shared types
// -----------------------------------------------------------------------------

export interface AssetPerformancePeriodRecord {
  id: string;
  dealId: string;
  periodYear: number;
  periodMonth: number;
  rentBilled: number | null;
  rentCollected: number | null;
  vacancyUnits: number | null;
  totalUnits: number | null;
  operatingExpense: number | null;
  netOperatingIncome: number | null;
  notes: string | null;
  capturedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapExItemRecord {
  id: string;
  dealId: string;
  category: string;
  description: string;
  estimatedCost: number | null;
  actualCost: number | null;
  plannedFor: string | null;
  completedAt: string | null;
  status: string;
  vendor: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantChangeEventRecord {
  id: string;
  dealId: string;
  tenantId: string | null;
  eventType: string;
  eventDate: string;
  rentDelta: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CAPEX_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "canceled",
] as const;
export type CapExStatus = (typeof CAPEX_STATUSES)[number];

export const CAPEX_CATEGORIES = [
  "roof",
  "hvac",
  "paving",
  "plumbing",
  "electrical",
  "landscaping",
  "tenant_improvement",
  "other",
] as const;
export type CapExCategory = (typeof CAPEX_CATEGORIES)[number];

export const TENANT_EVENT_TYPES = [
  "move_in",
  "move_out",
  "renewal",
  "default",
  "eviction",
  "other",
] as const;
export type TenantEventType = (typeof TENANT_EVENT_TYPES)[number];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export class AssetManagementAccessError extends Error {
  status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.name = "AssetManagementAccessError";
    this.status = status;
  }
}

async function assertDealInOrg(orgId: string, dealId: string): Promise<void> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true },
  });
  if (!deal) {
    throw new AssetManagementAccessError("Deal not found for this org", 404);
  }
}

function decimalToNumber(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function dateToIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function mapPerformance(
  row: Prisma.AssetPerformancePeriodGetPayload<Record<string, never>>,
): AssetPerformancePeriodRecord {
  return {
    id: row.id,
    dealId: row.dealId,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    rentBilled: decimalToNumber(row.rentBilled),
    rentCollected: decimalToNumber(row.rentCollected),
    vacancyUnits: row.vacancyUnits,
    totalUnits: row.totalUnits,
    operatingExpense: decimalToNumber(row.operatingExpense),
    netOperatingIncome: decimalToNumber(row.netOperatingIncome),
    notes: row.notes,
    capturedBy: row.capturedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCapEx(
  row: Prisma.CapExItemGetPayload<Record<string, never>>,
): CapExItemRecord {
  return {
    id: row.id,
    dealId: row.dealId,
    category: row.category,
    description: row.description,
    estimatedCost: decimalToNumber(row.estimatedCost),
    actualCost: decimalToNumber(row.actualCost),
    plannedFor: dateToIso(row.plannedFor),
    completedAt: dateToIso(row.completedAt),
    status: row.status,
    vendor: row.vendor,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapTenantEvent(
  row: Prisma.TenantChangeEventGetPayload<Record<string, never>>,
): TenantChangeEventRecord {
  return {
    id: row.id,
    dealId: row.dealId,
    tenantId: row.tenantId,
    eventType: row.eventType,
    eventDate: dateToIso(row.eventDate) ?? row.eventDate.toISOString().slice(0, 10),
    rentDelta: decimalToNumber(row.rentDelta),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// -----------------------------------------------------------------------------
// AssetPerformancePeriod CRUD
// -----------------------------------------------------------------------------

export interface UpsertAssetPerformancePeriodInput {
  orgId: string;
  dealId: string;
  periodYear: number;
  periodMonth: number;
  rentBilled?: number | null;
  rentCollected?: number | null;
  vacancyUnits?: number | null;
  totalUnits?: number | null;
  operatingExpense?: number | null;
  netOperatingIncome?: number | null;
  notes?: string | null;
  capturedBy?: string | null;
}

export async function listAssetPerformancePeriods(
  orgId: string,
  dealId: string,
): Promise<AssetPerformancePeriodRecord[]> {
  await assertDealInOrg(orgId, dealId);
  const rows = await prisma.assetPerformancePeriod.findMany({
    where: { orgId, dealId },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
  return rows.map(mapPerformance);
}

export async function upsertAssetPerformancePeriod(
  input: UpsertAssetPerformancePeriodInput,
): Promise<AssetPerformancePeriodRecord> {
  await assertDealInOrg(input.orgId, input.dealId);

  if (input.periodMonth < 1 || input.periodMonth > 12) {
    throw new AssetManagementAccessError("periodMonth must be 1..12", 400);
  }
  if (input.periodYear < 1900 || input.periodYear > 2200) {
    throw new AssetManagementAccessError("periodYear out of range", 400);
  }
  if (
    input.totalUnits !== undefined &&
    input.totalUnits !== null &&
    input.totalUnits < 0
  ) {
    throw new AssetManagementAccessError("totalUnits must be >= 0", 400);
  }
  if (
    input.vacancyUnits !== undefined &&
    input.vacancyUnits !== null &&
    input.vacancyUnits < 0
  ) {
    throw new AssetManagementAccessError("vacancyUnits must be >= 0", 400);
  }

  const data = {
    rentBilled: input.rentBilled ?? null,
    rentCollected: input.rentCollected ?? null,
    vacancyUnits: input.vacancyUnits ?? null,
    totalUnits: input.totalUnits ?? null,
    operatingExpense: input.operatingExpense ?? null,
    netOperatingIncome: input.netOperatingIncome ?? null,
    notes: input.notes ?? null,
    capturedBy: input.capturedBy ?? null,
  };

  const row = await prisma.assetPerformancePeriod.upsert({
    where: {
      orgId_dealId_periodYear_periodMonth: {
        orgId: input.orgId,
        dealId: input.dealId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
      },
    },
    create: {
      orgId: input.orgId,
      dealId: input.dealId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      ...data,
    },
    update: data,
  });

  return mapPerformance(row);
}

export async function deleteAssetPerformancePeriod(params: {
  orgId: string;
  dealId: string;
  periodId: string;
}): Promise<void> {
  await assertDealInOrg(params.orgId, params.dealId);
  const existing = await prisma.assetPerformancePeriod.findFirst({
    where: { id: params.periodId, orgId: params.orgId, dealId: params.dealId },
    select: { id: true },
  });
  if (!existing) {
    throw new AssetManagementAccessError("Performance period not found", 404);
  }
  await prisma.assetPerformancePeriod.delete({ where: { id: params.periodId } });
}

// -----------------------------------------------------------------------------
// CapExItem CRUD
// -----------------------------------------------------------------------------

export interface CreateCapExItemInput {
  orgId: string;
  dealId: string;
  category: CapExCategory;
  description: string;
  estimatedCost?: number | null;
  actualCost?: number | null;
  plannedFor?: string | null;
  completedAt?: string | null;
  status?: CapExStatus;
  vendor?: string | null;
  notes?: string | null;
}

export interface UpdateCapExItemInput {
  orgId: string;
  dealId: string;
  itemId: string;
  category?: CapExCategory;
  description?: string;
  estimatedCost?: number | null;
  actualCost?: number | null;
  plannedFor?: string | null;
  completedAt?: string | null;
  status?: CapExStatus;
  vendor?: string | null;
  notes?: string | null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AssetManagementAccessError(`Invalid date: ${value}`, 400);
  }
  return d;
}

export async function listCapExItems(
  orgId: string,
  dealId: string,
): Promise<CapExItemRecord[]> {
  await assertDealInOrg(orgId, dealId);
  const rows = await prisma.capExItem.findMany({
    where: { orgId, dealId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(mapCapEx);
}

export async function createCapExItem(
  input: CreateCapExItemInput,
): Promise<CapExItemRecord> {
  await assertDealInOrg(input.orgId, input.dealId);

  if (!input.description.trim()) {
    throw new AssetManagementAccessError("description is required", 400);
  }

  const row = await prisma.capExItem.create({
    data: {
      orgId: input.orgId,
      dealId: input.dealId,
      category: input.category,
      description: input.description.trim(),
      estimatedCost: input.estimatedCost ?? null,
      actualCost: input.actualCost ?? null,
      plannedFor: parseDate(input.plannedFor),
      completedAt: parseDate(input.completedAt),
      status: input.status ?? "planned",
      vendor: input.vendor ?? null,
      notes: input.notes ?? null,
    },
  });

  return mapCapEx(row);
}

export async function updateCapExItem(
  input: UpdateCapExItemInput,
): Promise<CapExItemRecord> {
  await assertDealInOrg(input.orgId, input.dealId);

  const existing = await prisma.capExItem.findFirst({
    where: { id: input.itemId, orgId: input.orgId, dealId: input.dealId },
    select: { id: true },
  });
  if (!existing) {
    throw new AssetManagementAccessError("CapEx item not found", 404);
  }

  const data: Prisma.CapExItemUpdateInput = {};
  if (input.category !== undefined) data.category = input.category;
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.estimatedCost !== undefined) data.estimatedCost = input.estimatedCost;
  if (input.actualCost !== undefined) data.actualCost = input.actualCost;
  if (input.plannedFor !== undefined) data.plannedFor = parseDate(input.plannedFor);
  if (input.completedAt !== undefined) data.completedAt = parseDate(input.completedAt);
  if (input.status !== undefined) data.status = input.status;
  if (input.vendor !== undefined) data.vendor = input.vendor;
  if (input.notes !== undefined) data.notes = input.notes;

  const row = await prisma.capExItem.update({
    where: { id: input.itemId },
    data,
  });

  return mapCapEx(row);
}

export async function deleteCapExItem(params: {
  orgId: string;
  dealId: string;
  itemId: string;
}): Promise<void> {
  await assertDealInOrg(params.orgId, params.dealId);
  const existing = await prisma.capExItem.findFirst({
    where: { id: params.itemId, orgId: params.orgId, dealId: params.dealId },
    select: { id: true },
  });
  if (!existing) {
    throw new AssetManagementAccessError("CapEx item not found", 404);
  }
  await prisma.capExItem.delete({ where: { id: params.itemId } });
}

// -----------------------------------------------------------------------------
// TenantChangeEvent CRUD
// -----------------------------------------------------------------------------

export interface CreateTenantChangeEventInput {
  orgId: string;
  dealId: string;
  tenantId?: string | null;
  eventType: TenantEventType;
  eventDate: string;
  rentDelta?: number | null;
  notes?: string | null;
}

export async function listTenantChangeEvents(
  orgId: string,
  dealId: string,
): Promise<TenantChangeEventRecord[]> {
  await assertDealInOrg(orgId, dealId);
  const rows = await prisma.tenantChangeEvent.findMany({
    where: { orgId, dealId },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(mapTenantEvent);
}

export async function createTenantChangeEvent(
  input: CreateTenantChangeEventInput,
): Promise<TenantChangeEventRecord> {
  await assertDealInOrg(input.orgId, input.dealId);

  const eventDate = parseDate(input.eventDate);
  if (!eventDate) {
    throw new AssetManagementAccessError("eventDate is required", 400);
  }

  const row = await prisma.tenantChangeEvent.create({
    data: {
      orgId: input.orgId,
      dealId: input.dealId,
      tenantId: input.tenantId ?? null,
      eventType: input.eventType,
      eventDate,
      rentDelta: input.rentDelta ?? null,
      notes: input.notes ?? null,
    },
  });

  return mapTenantEvent(row);
}

export async function deleteTenantChangeEvent(params: {
  orgId: string;
  dealId: string;
  eventId: string;
}): Promise<void> {
  await assertDealInOrg(params.orgId, params.dealId);
  const existing = await prisma.tenantChangeEvent.findFirst({
    where: { id: params.eventId, orgId: params.orgId, dealId: params.dealId },
    select: { id: true },
  });
  if (!existing) {
    throw new AssetManagementAccessError("Tenant event not found", 404);
  }
  await prisma.tenantChangeEvent.delete({ where: { id: params.eventId } });
}

// -----------------------------------------------------------------------------
// Summary + Disposition Readiness
// -----------------------------------------------------------------------------

export interface AssetPerformanceSummary {
  trailing12mRentCollected: number;
  trailing12mRentBilled: number;
  currentVacancyRate: number | null;
  noiTrend: Array<{ periodYear: number; periodMonth: number; noi: number | null }>;
  openCapexEstimatedCost: number;
  completedCapexActualCost: number;
  periodCount: number;
  latestPeriod: {
    periodYear: number;
    periodMonth: number;
  } | null;
}

export interface DispositionReadiness {
  ready: boolean;
  score: number; // 0..100
  factors: string[];
}

export async function getAssetPerformanceSummary(
  orgId: string,
  dealId: string,
): Promise<AssetPerformanceSummary> {
  await assertDealInOrg(orgId, dealId);

  const periods = await prisma.assetPerformancePeriod.findMany({
    where: { orgId, dealId },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    take: 24,
  });

  const capex = await prisma.capExItem.findMany({
    where: { orgId, dealId },
    select: { status: true, estimatedCost: true, actualCost: true },
  });

  // Trailing 12-month rent totals
  const trailing = periods.slice(0, 12);
  let trailing12mRentCollected = 0;
  let trailing12mRentBilled = 0;
  for (const p of trailing) {
    trailing12mRentCollected += decimalToNumber(p.rentCollected) ?? 0;
    trailing12mRentBilled += decimalToNumber(p.rentBilled) ?? 0;
  }

  // Current vacancy rate (from most recent period with totalUnits set)
  const latestWithUnits = periods.find(
    (p) => p.totalUnits !== null && p.totalUnits !== undefined && p.totalUnits > 0,
  );
  const currentVacancyRate = latestWithUnits
    ? (latestWithUnits.vacancyUnits ?? 0) / (latestWithUnits.totalUnits ?? 1)
    : null;

  // NOI trend (oldest-first for charts)
  const noiTrend = trailing
    .slice()
    .reverse()
    .map((p) => ({
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      noi: decimalToNumber(p.netOperatingIncome),
    }));

  let openCapexEstimatedCost = 0;
  let completedCapexActualCost = 0;
  for (const item of capex) {
    if (item.status === "completed") {
      completedCapexActualCost += decimalToNumber(item.actualCost) ?? 0;
    } else if (item.status === "planned" || item.status === "in_progress") {
      openCapexEstimatedCost += decimalToNumber(item.estimatedCost) ?? 0;
    }
  }

  return {
    trailing12mRentCollected,
    trailing12mRentBilled,
    currentVacancyRate,
    noiTrend,
    openCapexEstimatedCost,
    completedCapexActualCost,
    periodCount: periods.length,
    latestPeriod: periods[0]
      ? { periodYear: periods[0].periodYear, periodMonth: periods[0].periodMonth }
      : null,
  };
}

/**
 * Simple heuristic scoring — NOT a market-timing model. Intended as a
 * discussion-starter signal for the AM team, not an autonomous disposition
 * trigger. Four factors, roughly equal weight. Score is 0..100; `ready` is
 * score >= 70.
 */
export async function computeDispositionReadiness(
  orgId: string,
  dealId: string,
): Promise<DispositionReadiness> {
  await assertDealInOrg(orgId, dealId);

  const [summary, dealRow, capex] = await Promise.all([
    getAssetPerformanceSummary(orgId, dealId),
    prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { createdAt: true, currentStageKey: true, targetCloseDate: true },
    }),
    prisma.capExItem.findMany({
      where: { orgId, dealId, status: { in: ["planned", "in_progress"] } },
      select: { id: true, estimatedCost: true },
    }),
  ]);

  const factors: string[] = [];
  let score = 0;

  // --- Factor 1: rent collection health (0..25)
  const collectionRatio =
    summary.trailing12mRentBilled > 0
      ? summary.trailing12mRentCollected / summary.trailing12mRentBilled
      : null;
  if (collectionRatio === null) {
    factors.push("No trailing-12m rent data recorded yet");
  } else if (collectionRatio >= 0.98) {
    score += 25;
    factors.push(`Rent collection strong (${Math.round(collectionRatio * 100)}%)`);
  } else if (collectionRatio >= 0.9) {
    score += 15;
    factors.push(`Rent collection acceptable (${Math.round(collectionRatio * 100)}%)`);
  } else {
    factors.push(`Rent collection weak (${Math.round(collectionRatio * 100)}%)`);
  }

  // --- Factor 2: vacancy (0..25)
  if (summary.currentVacancyRate === null) {
    factors.push("No vacancy data recorded");
  } else if (summary.currentVacancyRate <= 0.05) {
    score += 25;
    factors.push(
      `Vacancy low (${Math.round(summary.currentVacancyRate * 100)}%)`,
    );
  } else if (summary.currentVacancyRate <= 0.15) {
    score += 12;
    factors.push(
      `Vacancy moderate (${Math.round(summary.currentVacancyRate * 100)}%)`,
    );
  } else {
    factors.push(
      `Vacancy high (${Math.round(summary.currentVacancyRate * 100)}%)`,
    );
  }

  // --- Factor 3: capex backlog (0..25)
  const openCapexCount = capex.length;
  if (openCapexCount === 0) {
    score += 25;
    factors.push("No open capex backlog");
  } else if (openCapexCount <= 2) {
    score += 12;
    factors.push(`${openCapexCount} open capex item(s)`);
  } else {
    factors.push(`${openCapexCount} open capex items — consider finishing before sale`);
  }

  // --- Factor 4: hold period (0..25). Reward holds >= 18 months.
  if (dealRow?.createdAt) {
    const months = monthsBetween(dealRow.createdAt, new Date());
    if (months >= 36) {
      score += 25;
      factors.push(`Hold period ${months}mo (mature)`);
    } else if (months >= 18) {
      score += 15;
      factors.push(`Hold period ${months}mo (moderate)`);
    } else {
      factors.push(`Hold period ${months}mo (short — tax/NPV usually favors holding)`);
    }
  }

  // NOI trend nudge: if NOI monotonically improving for 3+ months, +5 bonus.
  const noiSeries = summary.noiTrend
    .map((p) => p.noi)
    .filter((n): n is number => n !== null);
  if (noiSeries.length >= 3) {
    const last3 = noiSeries.slice(-3);
    const improving = last3[0]! < last3[1]! && last3[1]! < last3[2]!;
    if (improving) {
      score += 5;
      factors.push("NOI trending up over last 3 periods");
    }
  }

  score = Math.min(100, score);

  return {
    ready: score >= 70,
    score,
    factors,
  };
}

function monthsBetween(a: Date, b: Date): number {
  const years = b.getUTCFullYear() - a.getUTCFullYear();
  const months = b.getUTCMonth() - a.getUTCMonth();
  return years * 12 + months;
}
