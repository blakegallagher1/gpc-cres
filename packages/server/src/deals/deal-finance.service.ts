import { Prisma, prisma } from "@entitlement-os/db";
import type {
  DealFinancingPatchInput,
  DealFinancingPatchWithIdInput,
} from "@entitlement-os/shared";

import { DealAccessError } from "./deal-workspace.service";

type DecimalLike = { toString: () => string };
type DateLike = Date | string | null;

type DealScope = {
  dealId: string;
  orgId: string;
};

type DealJsonArrayScope = DealScope & {
  entries: Record<string, unknown>[];
};

type DealFinancingRecord = {
  id: string;
  orgId: string;
  dealId: string;
  lenderName: string | null;
  facilityName: string | null;
  loanType: string | null;
  loanAmount: DecimalLike | number | null;
  commitmentDate: DateLike;
  fundedDate: DateLike;
  interestRate: DecimalLike | number | null;
  loanTermMonths: number | null;
  amortizationYears: number | null;
  ltvPercent: DecimalLike | number | null;
  dscrRequirement: DecimalLike | number | null;
  originationFeePercent: DecimalLike | number | null;
  sourceUploadId: string | null;
  status: string | null;
  notes: string | null;
  createdAt: DateLike;
  updatedAt: DateLike;
};

export type DealFinancingResponseItem = {
  id: string;
  orgId: string;
  dealId: string;
  lenderName: string | null;
  facilityName: string | null;
  loanType: string | null;
  loanAmount: string | null;
  commitmentDate: string | null;
  fundedDate: string | null;
  interestRate: string | null;
  loanTermMonths: number | null;
  amortizationYears: number | null;
  ltvPercent: string | null;
  dscrRequirement: string | null;
  originationFeePercent: string | null;
  sourceUploadId: string | null;
  status: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SavedScenario = {
  id: string;
  name: string;
  assumptions: Record<string, unknown>;
  createdAt: string;
};

export class DealFinancingNotFoundError extends Error {
  constructor() {
    super("Financing not found");
    this.name = "DealFinancingNotFoundError";
  }
}

function toJsonArray(entries: Record<string, unknown>[]): Prisma.InputJsonValue {
  return entries as Prisma.InputJsonValue;
}

function toIsoString(value: DateLike): string | null {
  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value : value.toISOString();
}

function toStringValue(value: DecimalLike | number | null): string | null {
  if (value === null) {
    return null;
  }

  return value.toString();
}

function serializeFinancing(item: DealFinancingRecord): DealFinancingResponseItem {
  return {
    id: item.id,
    orgId: item.orgId,
    dealId: item.dealId,
    lenderName: item.lenderName,
    facilityName: item.facilityName,
    loanType: item.loanType,
    loanAmount: toStringValue(item.loanAmount),
    commitmentDate: toIsoString(item.commitmentDate),
    fundedDate: toIsoString(item.fundedDate),
    interestRate: toStringValue(item.interestRate),
    loanTermMonths: item.loanTermMonths,
    amortizationYears: item.amortizationYears,
    ltvPercent: toStringValue(item.ltvPercent),
    dscrRequirement: toStringValue(item.dscrRequirement),
    originationFeePercent: toStringValue(item.originationFeePercent),
    sourceUploadId: item.sourceUploadId,
    status: item.status,
    notes: item.notes,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  };
}

function toFinancingPayload(input: DealFinancingPatchInput) {
  const payload: Record<string, unknown> = {};

  if (input.lenderName !== undefined) payload.lenderName = input.lenderName;
  if (input.facilityName !== undefined) payload.facilityName = input.facilityName;
  if (input.loanType !== undefined) payload.loanType = input.loanType;
  if (input.loanAmount !== undefined) payload.loanAmount = input.loanAmount;
  if (input.commitmentDate !== undefined) payload.commitmentDate = input.commitmentDate;
  if (input.fundedDate !== undefined) payload.fundedDate = input.fundedDate;
  if (input.interestRate !== undefined) payload.interestRate = input.interestRate;
  if (input.loanTermMonths !== undefined) payload.loanTermMonths = input.loanTermMonths;
  if (input.amortizationYears !== undefined) {
    payload.amortizationYears = input.amortizationYears;
  }
  if (input.ltvPercent !== undefined) payload.ltvPercent = input.ltvPercent;
  if (input.dscrRequirement !== undefined) {
    payload.dscrRequirement = input.dscrRequirement;
  }
  if (input.originationFeePercent !== undefined) {
    payload.originationFeePercent = input.originationFeePercent;
  }
  if (input.sourceUploadId !== undefined) payload.sourceUploadId = input.sourceUploadId;
  if (input.status !== undefined) payload.status = input.status;
  if (input.notes !== undefined) payload.notes = input.notes;

  return payload;
}

async function ensureDealAccess(scope: DealScope): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: scope.dealId },
    select: { id: true, orgId: true },
  });

  if (!deal) {
    throw new DealAccessError(404);
  }

  if (deal.orgId !== scope.orgId) {
    throw new DealAccessError(403);
  }
}

async function ensureScopedDeal(scope: DealScope): Promise<void> {
  const deal = await prisma.deal.findFirst({
    where: { id: scope.dealId, orgId: scope.orgId },
    select: { id: true },
  });

  if (!deal) {
    throw new DealAccessError(404);
  }
}

export async function listDealFinancings(
  scope: DealScope,
): Promise<DealFinancingResponseItem[]> {
  await ensureDealAccess(scope);

  const financings = await prisma.dealFinancing.findMany({
    where: { dealId: scope.dealId },
    orderBy: { createdAt: "desc" },
  });

  return financings.map((item) => serializeFinancing(item as DealFinancingRecord));
}

export async function createDealFinancing(
  scope: DealScope & { input: DealFinancingPatchInput },
): Promise<DealFinancingResponseItem> {
  await ensureDealAccess(scope);

  const financing = await prisma.dealFinancing.create({
    data: {
      ...toFinancingPayload(scope.input),
      orgId: scope.orgId,
      dealId: scope.dealId,
    },
  });

  return serializeFinancing(financing as DealFinancingRecord);
}

export async function updateDealFinancing(
  scope: DealScope & { input: DealFinancingPatchWithIdInput },
): Promise<DealFinancingResponseItem> {
  await ensureDealAccess(scope);

  const { id, ...rest } = scope.input;
  const existing = await prisma.dealFinancing.findFirst({
    where: { id, dealId: scope.dealId, orgId: scope.orgId },
    select: { id: true },
  });

  if (!existing) {
    throw new DealFinancingNotFoundError();
  }

  const financing = await prisma.dealFinancing.update({
    where: { id },
    data: toFinancingPayload(rest),
  });

  return serializeFinancing(financing as DealFinancingRecord);
}

export async function deleteDealFinancing(
  scope: DealScope & { financingId: string },
): Promise<DealFinancingResponseItem> {
  await ensureDealAccess(scope);

  const existing = await prisma.dealFinancing.findFirst({
    where: { id: scope.financingId, dealId: scope.dealId, orgId: scope.orgId },
    select: { id: true },
  });

  if (!existing) {
    throw new DealFinancingNotFoundError();
  }

  const financing = await prisma.dealFinancing.delete({
    where: { id: scope.financingId },
  });

  return serializeFinancing(financing as DealFinancingRecord);
}

export async function getDealDebtComparisons(scope: DealScope) {
  await ensureScopedDeal(scope);

  const deal = await prisma.deal.findFirst({
    where: { id: scope.dealId, orgId: scope.orgId },
    select: { debtComparisons: true },
  });

  return (deal?.debtComparisons as Record<string, unknown>[] | null) ?? [];
}

export async function saveDealDebtComparisons(scope: DealJsonArrayScope) {
  await ensureScopedDeal(scope);

  await prisma.deal.update({
    where: { id: scope.dealId },
    data: { debtComparisons: toJsonArray(scope.entries) },
  });
}

export async function getDealFinancialModelScenarios(
  scope: DealScope,
): Promise<SavedScenario[]> {
  await ensureScopedDeal(scope);

  const deal = await prisma.deal.findFirst({
    where: { id: scope.dealId, orgId: scope.orgId },
    select: { financialModelScenarios: true },
  });

  return (deal?.financialModelScenarios as SavedScenario[] | null) ?? [];
}

export async function saveDealFinancialModelScenarios(
  scope: DealJsonArrayScope,
) {
  await ensureScopedDeal(scope);

  await prisma.deal.update({
    where: { id: scope.dealId },
    data: { financialModelScenarios: toJsonArray(scope.entries) },
  });
}

export async function getDealWaterfallStructures(scope: DealScope) {
  await ensureScopedDeal(scope);

  const deal = await prisma.deal.findFirst({
    where: { id: scope.dealId, orgId: scope.orgId },
    select: { waterfallStructures: true },
  });

  return (deal?.waterfallStructures as Record<string, unknown>[] | null) ?? [];
}

export async function saveDealWaterfallStructures(scope: DealJsonArrayScope) {
  await ensureScopedDeal(scope);

  await prisma.deal.update({
    where: { id: scope.dealId },
    data: { waterfallStructures: toJsonArray(scope.entries) },
  });
}
