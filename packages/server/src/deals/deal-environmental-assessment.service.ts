import { prisma } from "@entitlement-os/db";
import type {
  EnvironmentalAssessmentPatchInput,
  EnvironmentalAssessmentPatchWithIdInput,
} from "@entitlement-os/shared";

import { DealAccessError } from "./deal-workspace.service";

type DecimalLike = { toString: () => string };
type DateLike = Date | string | null | undefined;

type DealScope = {
  dealId: string;
  orgId: string;
};

type EnvironmentalAssessmentRecord = {
  id: string;
  orgId: string;
  dealId: string;
  reportType: string | null;
  reportDate: DateLike;
  consultantName: string | null;
  reportTitle: string | null;
  recs: string[];
  deMinimisConditions: string[];
  phaseIiRecommended: boolean | null;
  phaseIiScope: string | null;
  estimatedRemediationCost: DecimalLike | number | null;
  sourceUploadId: string | null;
  notes: string | null;
  createdAt: DateLike;
  updatedAt: DateLike;
};

export type EnvironmentalAssessmentResponseItem = {
  id: string;
  orgId: string;
  dealId: string;
  reportType: string | null;
  reportDate: string | null;
  consultantName: string | null;
  reportTitle: string | null;
  recs: string[];
  deMinimisConditions: string[];
  phaseIiRecommended: boolean | null;
  phaseIiScope: string | null;
  estimatedRemediationCost: string | null;
  sourceUploadId: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export class EnvironmentalAssessmentNotFoundError extends Error {
  constructor() {
    super("Environmental assessment not found");
    this.name = "EnvironmentalAssessmentNotFoundError";
  }
}

function toIsoString(value: DateLike): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : value.toISOString();
}

function toStringValue(value: DecimalLike | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return value.toString();
}

function serializeAssessment(
  item: EnvironmentalAssessmentRecord,
): EnvironmentalAssessmentResponseItem {
  return {
    id: item.id,
    orgId: item.orgId,
    dealId: item.dealId,
    reportType: item.reportType,
    reportDate: toIsoString(item.reportDate),
    consultantName: item.consultantName,
    reportTitle: item.reportTitle,
    recs: item.recs,
    deMinimisConditions: item.deMinimisConditions,
    phaseIiRecommended: item.phaseIiRecommended,
    phaseIiScope: item.phaseIiScope,
    estimatedRemediationCost: toStringValue(item.estimatedRemediationCost),
    sourceUploadId: item.sourceUploadId,
    notes: item.notes,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  };
}

function toAssessmentPayload(input: EnvironmentalAssessmentPatchInput) {
  const payload: Record<string, unknown> = {};

  if (input.reportType !== undefined) payload.reportType = input.reportType;
  if (input.reportDate !== undefined) payload.reportDate = input.reportDate;
  if (input.consultantName !== undefined) {
    payload.consultantName = input.consultantName;
  }
  if (input.reportTitle !== undefined) payload.reportTitle = input.reportTitle;
  if (input.recs !== undefined) payload.recs = input.recs;
  if (input.deMinimisConditions !== undefined) {
    payload.deMinimisConditions = input.deMinimisConditions;
  }
  if (input.phaseIiRecommended !== undefined) {
    payload.phaseIiRecommended = input.phaseIiRecommended;
  }
  if (input.phaseIiScope !== undefined) payload.phaseIiScope = input.phaseIiScope;
  if (input.estimatedRemediationCost !== undefined) {
    payload.estimatedRemediationCost = input.estimatedRemediationCost;
  }
  if (input.sourceUploadId !== undefined) payload.sourceUploadId = input.sourceUploadId;
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

export async function listEnvironmentalAssessmentsForDeal(
  scope: DealScope,
): Promise<EnvironmentalAssessmentResponseItem[]> {
  await ensureDealAccess(scope);

  const assessments = await prisma.environmentalAssessment.findMany({
    where: { dealId: scope.dealId },
    orderBy: { createdAt: "desc" },
  });

  return assessments.map((item) =>
    serializeAssessment(item as EnvironmentalAssessmentRecord),
  );
}

export async function createEnvironmentalAssessmentForDeal(
  scope: DealScope & { input: EnvironmentalAssessmentPatchInput },
): Promise<EnvironmentalAssessmentResponseItem> {
  await ensureDealAccess(scope);

  const assessment = await prisma.environmentalAssessment.create({
    data: {
      ...toAssessmentPayload(scope.input),
      orgId: scope.orgId,
      dealId: scope.dealId,
    },
  });

  return serializeAssessment(assessment as EnvironmentalAssessmentRecord);
}

export async function updateEnvironmentalAssessmentForDeal(
  scope: DealScope & { input: EnvironmentalAssessmentPatchWithIdInput },
): Promise<EnvironmentalAssessmentResponseItem> {
  await ensureDealAccess(scope);

  const { id, ...rest } = scope.input;
  const existing = await prisma.environmentalAssessment.findFirst({
    where: { id, orgId: scope.orgId, dealId: scope.dealId },
    select: { id: true },
  });

  if (!existing) {
    throw new EnvironmentalAssessmentNotFoundError();
  }

  const assessment = await prisma.environmentalAssessment.update({
    where: { id },
    data: toAssessmentPayload(rest),
  });

  return serializeAssessment(assessment as EnvironmentalAssessmentRecord);
}

export async function deleteEnvironmentalAssessmentForDeal(
  scope: DealScope & { environmentalAssessmentId: string },
): Promise<EnvironmentalAssessmentResponseItem> {
  await ensureDealAccess(scope);

  const existing = await prisma.environmentalAssessment.findFirst({
    where: {
      id: scope.environmentalAssessmentId,
      orgId: scope.orgId,
      dealId: scope.dealId,
    },
    select: { id: true },
  });

  if (!existing) {
    throw new EnvironmentalAssessmentNotFoundError();
  }

  const assessment = await prisma.environmentalAssessment.delete({
    where: { id: scope.environmentalAssessmentId },
  });

  return serializeAssessment(assessment as EnvironmentalAssessmentRecord);
}
