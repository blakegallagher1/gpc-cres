import { prisma } from "@entitlement-os/db";
import type {
  EntitlementPathPatchInput,
  PropertySurveyPatchInput,
  PropertyTitlePatchInput,
} from "@entitlement-os/shared";

import { DealAccessError } from "./deal-workspace.service";

type DateOrString = Date | string | null | undefined;
type DecimalLike = { toString: () => string };
type Setbacks = unknown;

export class DealEntitlementPathNotFoundError extends Error {
  constructor() {
    super("Entitlement path not found");
    this.name = "DealEntitlementPathNotFoundError";
  }
}

async function authorizeDeal(
  dealId: string,
  orgId: string,
): Promise<{ dealId: string }> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, orgId: true },
  });

  if (!deal) {
    throw new DealAccessError(404);
  }
  if (deal.orgId !== orgId) {
    throw new DealAccessError(403);
  }

  return { dealId: deal.id };
}

function valueToIsoString(value: DateOrString): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : value.toISOString();
}

function valueToString(value: DecimalLike | number | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toString();
}

function toPropertyTitlePayload(input: PropertyTitlePatchInput) {
  const payload: Record<string, unknown> = {};

  if (input.titleInsuranceReceived !== undefined) {
    payload.titleInsuranceReceived = input.titleInsuranceReceived;
  }
  if (input.exceptions !== undefined) {
    payload.exceptions = input.exceptions;
  }
  if (input.liens !== undefined) {
    payload.liens = input.liens;
  }
  if (input.easements !== undefined) {
    payload.easements = input.easements;
  }

  return payload;
}

function toPropertySurveyPayload(input: PropertySurveyPatchInput) {
  const payload: Record<string, unknown> = {};

  if (input.surveyCompletedDate !== undefined) {
    payload.surveyCompletedDate = input.surveyCompletedDate;
  }
  if (input.acreageConfirmed !== undefined) {
    payload.acreageConfirmed = input.acreageConfirmed;
  }
  if (input.encroachments !== undefined) {
    payload.encroachments = input.encroachments;
  }
  if (input.setbacks !== undefined) {
    payload.setbacks = input.setbacks;
  }

  return payload;
}

function toEntitlementPayload(input: EntitlementPathPatchInput) {
  const payload: Record<string, unknown> = {};

  if (input.recommendedStrategy !== undefined) {
    payload.recommendedStrategy = input.recommendedStrategy;
  }
  if (input.preAppMeetingDate !== undefined) {
    payload.preAppMeetingDate = input.preAppMeetingDate;
  }
  if (input.preAppMeetingNotes !== undefined) {
    payload.preAppMeetingNotes = input.preAppMeetingNotes;
  }
  if (input.applicationType !== undefined) {
    payload.applicationType = input.applicationType;
  }
  if (input.applicationSubmittedDate !== undefined) {
    payload.applicationSubmittedDate = input.applicationSubmittedDate;
  }
  if (input.applicationNumber !== undefined) {
    payload.applicationNumber = input.applicationNumber;
  }
  if (input.publicNoticeDate !== undefined) {
    payload.publicNoticeDate = input.publicNoticeDate;
  }
  if (input.publicNoticePeriodDays !== undefined) {
    payload.publicNoticePeriodDays = input.publicNoticePeriodDays;
  }
  if (input.hearingScheduledDate !== undefined) {
    payload.hearingScheduledDate = input.hearingScheduledDate;
  }
  if (input.hearingBody !== undefined) {
    payload.hearingBody = input.hearingBody;
  }
  if (input.hearingNotes !== undefined) {
    payload.hearingNotes = input.hearingNotes;
  }
  if (input.decisionDate !== undefined) {
    payload.decisionDate = input.decisionDate;
  }
  if (input.decisionType !== undefined) {
    payload.decisionType = input.decisionType;
  }
  if (input.conditions !== undefined) {
    payload.conditions = input.conditions;
  }
  if (input.appealDeadline !== undefined) {
    payload.appealDeadline = input.appealDeadline;
  }
  if (input.appealFiled !== undefined) {
    payload.appealFiled = input.appealFiled;
  }
  if (input.conditionComplianceStatus !== undefined) {
    payload.conditionComplianceStatus = input.conditionComplianceStatus;
  }

  return payload;
}

function serializePropertyTitle(propertyTitle: {
  id: string;
  orgId: string;
  dealId: string;
  titleInsuranceReceived: boolean | null;
  exceptions: string[];
  liens: string[];
  easements: string[];
  createdAt: DateOrString;
  updatedAt: DateOrString;
}) {
  return {
    id: propertyTitle.id,
    orgId: propertyTitle.orgId,
    dealId: propertyTitle.dealId,
    titleInsuranceReceived: propertyTitle.titleInsuranceReceived,
    exceptions: propertyTitle.exceptions,
    liens: propertyTitle.liens,
    easements: propertyTitle.easements,
    createdAt: valueToIsoString(propertyTitle.createdAt),
    updatedAt: valueToIsoString(propertyTitle.updatedAt),
  };
}

function serializePropertySurvey(propertySurvey: {
  id: string;
  orgId: string;
  dealId: string;
  surveyCompletedDate: DateOrString;
  acreageConfirmed: DecimalLike | number | null;
  encroachments: string[];
  setbacks: Setbacks;
  createdAt: DateOrString;
  updatedAt: DateOrString;
}) {
  return {
    id: propertySurvey.id,
    orgId: propertySurvey.orgId,
    dealId: propertySurvey.dealId,
    surveyCompletedDate: valueToIsoString(propertySurvey.surveyCompletedDate),
    acreageConfirmed: valueToString(propertySurvey.acreageConfirmed),
    encroachments: propertySurvey.encroachments,
    setbacks:
      propertySurvey.setbacks &&
      typeof propertySurvey.setbacks === "object" &&
      !Array.isArray(propertySurvey.setbacks)
        ? propertySurvey.setbacks
        : {},
    createdAt: valueToIsoString(propertySurvey.createdAt),
    updatedAt: valueToIsoString(propertySurvey.updatedAt),
  };
}

function serializeEntitlementPath(path: {
  id: string;
  orgId: string;
  dealId: string;
  recommendedStrategy: string | null;
  preAppMeetingDate: Date | string | null;
  preAppMeetingNotes: string | null;
  applicationType: string | null;
  applicationSubmittedDate: Date | string | null;
  applicationNumber: string | null;
  publicNoticeDate: Date | string | null;
  publicNoticePeriodDays: number | null;
  hearingScheduledDate: Date | string | null;
  hearingBody: string | null;
  hearingNotes: string | null;
  decisionDate: Date | string | null;
  decisionType: string | null;
  conditions: string[];
  appealDeadline: Date | string | null;
  appealFiled: boolean | null;
  conditionComplianceStatus: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}) {
  return {
    id: path.id,
    orgId: path.orgId,
    dealId: path.dealId,
    recommendedStrategy: path.recommendedStrategy,
    preAppMeetingDate: valueToIsoString(path.preAppMeetingDate),
    preAppMeetingNotes: path.preAppMeetingNotes,
    applicationType: path.applicationType,
    applicationSubmittedDate: valueToIsoString(path.applicationSubmittedDate),
    applicationNumber: path.applicationNumber,
    publicNoticeDate: valueToIsoString(path.publicNoticeDate),
    publicNoticePeriodDays: path.publicNoticePeriodDays,
    hearingScheduledDate: valueToIsoString(path.hearingScheduledDate),
    hearingBody: path.hearingBody,
    hearingNotes: path.hearingNotes,
    decisionDate: valueToIsoString(path.decisionDate),
    decisionType: path.decisionType,
    conditions: path.conditions,
    appealDeadline: valueToIsoString(path.appealDeadline),
    appealFiled: path.appealFiled,
    conditionComplianceStatus: path.conditionComplianceStatus,
    createdAt: valueToIsoString(path.createdAt),
    updatedAt: valueToIsoString(path.updatedAt),
  };
}

export async function getPropertyTitleForDeal(input: {
  dealId: string;
  orgId: string;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const propertyTitle = await prisma.propertyTitle.findUnique({
    where: { dealId: authorized.dealId },
  });

  return {
    propertyTitle: propertyTitle ? serializePropertyTitle(propertyTitle) : null,
  };
}

export async function upsertPropertyTitleForDeal(input: {
  dealId: string;
  orgId: string;
  payload: PropertyTitlePatchInput;
}) {
  await authorizeDeal(input.dealId, input.orgId);
  const propertyTitle = await prisma.propertyTitle.upsert({
    where: { dealId: input.dealId },
    create: {
      ...toPropertyTitlePayload(input.payload),
      dealId: input.dealId,
      orgId: input.orgId,
    },
    update: toPropertyTitlePayload(input.payload),
  });

  return { propertyTitle: serializePropertyTitle(propertyTitle) };
}

export async function getPropertySurveyForDeal(input: {
  dealId: string;
  orgId: string;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const propertySurvey = await prisma.propertySurvey.findUnique({
    where: { dealId: authorized.dealId },
  });

  return {
    propertySurvey: propertySurvey ? serializePropertySurvey(propertySurvey) : null,
  };
}

export async function upsertPropertySurveyForDeal(input: {
  dealId: string;
  orgId: string;
  payload: PropertySurveyPatchInput;
}) {
  await authorizeDeal(input.dealId, input.orgId);
  const propertySurvey = await prisma.propertySurvey.upsert({
    where: { dealId: input.dealId },
    create: {
      ...toPropertySurveyPayload(input.payload),
      dealId: input.dealId,
      orgId: input.orgId,
    },
    update: toPropertySurveyPayload(input.payload),
  });

  return { propertySurvey: serializePropertySurvey(propertySurvey) };
}

export async function getEntitlementPathForDeal(input: {
  dealId: string;
  orgId: string;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const entitlementPath = await prisma.entitlementPath.findUnique({
    where: { dealId: authorized.dealId },
  });

  return {
    entitlementPath: entitlementPath
      ? serializeEntitlementPath(entitlementPath)
      : null,
  };
}

export async function upsertEntitlementPathForDeal(input: {
  dealId: string;
  orgId: string;
  payload: EntitlementPathPatchInput;
}) {
  await authorizeDeal(input.dealId, input.orgId);
  const entitlementPath = await prisma.entitlementPath.upsert({
    where: { dealId: input.dealId },
    create: {
      ...toEntitlementPayload(input.payload),
      dealId: input.dealId,
      orgId: input.orgId,
    },
    update: toEntitlementPayload(input.payload),
  });

  return { entitlementPath: serializeEntitlementPath(entitlementPath) };
}

export async function deleteEntitlementPathForDeal(input: {
  dealId: string;
  orgId: string;
}) {
  await authorizeDeal(input.dealId, input.orgId);
  try {
    const entitlementPath = await prisma.entitlementPath.delete({
      where: { dealId: input.dealId },
    });
    return { entitlementPath: serializeEntitlementPath(entitlementPath) };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Record to delete does not exist")
    ) {
      throw new DealEntitlementPathNotFoundError();
    }
    throw error;
  }
}
