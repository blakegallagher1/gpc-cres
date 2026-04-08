import { Prisma, prisma } from "@entitlement-os/db";
import type {
  DealRiskPatchInput,
  DealStakeholderCreateInput,
  DealStakeholderPatchInput,
  DealTermsPatchInput,
} from "@entitlement-os/shared";

type DateLike = Date | string | null | undefined;
type DecimalLike = { toString: () => string };

export class DealAccessError extends Error {
  constructor(public readonly status: 403 | 404) {
    super(status === 403 ? "Forbidden" : "Deal not found");
    this.name = "DealAccessError";
  }
}

export class DealTaskNotFoundError extends Error {
  constructor() {
    super("Task not found");
    this.name = "DealTaskNotFoundError";
  }
}

export class DealStakeholderNotFoundError extends Error {
  constructor() {
    super("Stakeholder not found");
    this.name = "DealStakeholderNotFoundError";
  }
}

export class DealRiskNotFoundError extends Error {
  constructor() {
    super("Deal risk not found");
    this.name = "DealRiskNotFoundError";
  }
}

export class DealTermsNotFoundError extends Error {
  constructor() {
    super("Deal terms not found");
    this.name = "DealTermsNotFoundError";
  }
}

export type DealTaskUpdateInput = {
  title?: string;
  description?: string | null;
  status?: Prisma.TaskUncheckedCreateInput["status"];
  dueAt?: Date | null;
  ownerUserId?: string | null;
  pipelineStep?: number;
};

function toIsoString(value: DateLike): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : value.toISOString();
}

function valueToString(value: DecimalLike | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toString();
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

function serializeStakeholder(item: {
  id: string;
  orgId: string;
  dealId: string;
  role: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  equityOwnership: DecimalLike | number | null;
  decisionRights: string[] | null;
  notes: string | null;
  createdAt: DateLike;
  updatedAt: DateLike;
}) {
  return {
    id: item.id,
    orgId: item.orgId,
    dealId: item.dealId,
    role: item.role,
    name: item.name,
    company: item.company,
    email: item.email,
    phone: item.phone,
    equityOwnership: valueToString(item.equityOwnership),
    decisionRights: item.decisionRights ?? null,
    notes: item.notes,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  };
}

function serializeRisk(item: {
  id: string;
  orgId: string;
  dealId: string;
  category: string | null;
  title: string | null;
  description: string | null;
  severity: string | null;
  status: string | null;
  owner: string | null;
  source: string | null;
  score: number | null;
  notes: string | null;
  createdAt: DateLike;
  updatedAt: DateLike;
}) {
  return {
    id: item.id,
    orgId: item.orgId,
    dealId: item.dealId,
    category: item.category,
    title: item.title,
    description: item.description,
    severity: item.severity,
    status: item.status,
    owner: item.owner,
    source: item.source,
    score: item.score,
    notes: item.notes,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  };
}

function serializeTerms(terms: {
  id: string;
  orgId: string;
  dealId: string;
  offerPrice: DecimalLike | number | null;
  earnestMoney: DecimalLike | number | null;
  closingDate: DateLike;
  titleCompany: string | null;
  dueDiligenceDays: number | null;
  financingContingencyDays: number | null;
  loiSignedAt: DateLike;
  psaSignedAt: DateLike;
  titleReviewDue: DateLike;
  surveyDue: DateLike;
  environmentalDue: DateLike;
  sellerContact: string | null;
  brokerContact: string | null;
  createdAt: DateLike;
  updatedAt: DateLike;
}) {
  return {
    id: terms.id,
    orgId: terms.orgId,
    dealId: terms.dealId,
    offerPrice: valueToString(terms.offerPrice),
    earnestMoney: valueToString(terms.earnestMoney),
    closingDate: toIsoString(terms.closingDate),
    titleCompany: terms.titleCompany,
    dueDiligenceDays: terms.dueDiligenceDays,
    financingContingencyDays: terms.financingContingencyDays,
    loiSignedAt: toIsoString(terms.loiSignedAt),
    psaSignedAt: toIsoString(terms.psaSignedAt),
    titleReviewDue: toIsoString(terms.titleReviewDue),
    surveyDue: toIsoString(terms.surveyDue),
    environmentalDue: toIsoString(terms.environmentalDue),
    sellerContact: terms.sellerContact,
    brokerContact: terms.brokerContact,
    createdAt: toIsoString(terms.createdAt),
    updatedAt: toIsoString(terms.updatedAt),
  };
}

function toStakeholderPayload(
  input: DealStakeholderCreateInput | DealStakeholderPatchInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.role !== undefined) payload.role = input.role;
  if (input.company !== undefined) payload.company = input.company;
  if (input.email !== undefined) payload.email = input.email;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.equityOwnership !== undefined) payload.equityOwnership = input.equityOwnership;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.decisionRights !== undefined) payload.decisionRights = input.decisionRights;
  return payload;
}

function toRiskPayload(input: DealRiskPatchInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.category !== undefined) payload.category = input.category;
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.severity !== undefined) payload.severity = input.severity;
  if (input.status !== undefined) payload.status = input.status;
  if (input.owner !== undefined) payload.owner = input.owner;
  if (input.source !== undefined) payload.source = input.source;
  if (input.score !== undefined) payload.score = input.score;
  if (input.notes !== undefined) payload.notes = input.notes;
  return payload;
}

function toTermsPayload(input: DealTermsPatchInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.offerPrice !== undefined) payload.offerPrice = input.offerPrice;
  if (input.earnestMoney !== undefined) payload.earnestMoney = input.earnestMoney;
  if (input.closingDate !== undefined) payload.closingDate = input.closingDate;
  if (input.titleCompany !== undefined) payload.titleCompany = input.titleCompany;
  if (input.dueDiligenceDays !== undefined) payload.dueDiligenceDays = input.dueDiligenceDays;
  if (input.financingContingencyDays !== undefined) {
    payload.financingContingencyDays = input.financingContingencyDays;
  }
  if (input.loiSignedAt !== undefined) payload.loiSignedAt = input.loiSignedAt;
  if (input.psaSignedAt !== undefined) payload.psaSignedAt = input.psaSignedAt;
  if (input.titleReviewDue !== undefined) payload.titleReviewDue = input.titleReviewDue;
  if (input.surveyDue !== undefined) payload.surveyDue = input.surveyDue;
  if (input.environmentalDue !== undefined) payload.environmentalDue = input.environmentalDue;
  if (input.sellerContact !== undefined) payload.sellerContact = input.sellerContact;
  if (input.brokerContact !== undefined) payload.brokerContact = input.brokerContact;
  return payload;
}

export async function listDealTasks(input: {
  dealId: string;
  orgId: string;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const tasks = await prisma.task.findMany({
    where: { dealId: authorized.dealId },
    orderBy: [{ pipelineStep: "asc" }, { createdAt: "asc" }],
  });
  return { tasks };
}

export async function createDealTask(input: {
  dealId: string;
  orgId: string;
  title: string;
  description: string | null;
  status: Prisma.TaskUncheckedCreateInput["status"];
  pipelineStep: number;
  dueAt: Date | null;
  ownerUserId: string | null;
}) {
  await authorizeDeal(input.dealId, input.orgId);
  const data: Prisma.TaskUncheckedCreateInput = {
    orgId: input.orgId,
    dealId: input.dealId,
    title: input.title,
    description: input.description,
    status: input.status,
    pipelineStep: input.pipelineStep,
    dueAt: input.dueAt,
    ownerUserId: input.ownerUserId,
  };
  const task = await prisma.task.create({
    data,
  });
  return { task };
}

export async function updateDealTask(input: {
  dealId: string;
  orgId: string;
  taskId: string;
  data: DealTaskUpdateInput;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const existingTask = await prisma.task.findFirst({
    where: { id: input.taskId, dealId: authorized.dealId },
    select: { id: true, status: true },
  });

  if (!existingTask) {
    throw new DealTaskNotFoundError();
  }

  const data: Prisma.TaskUncheckedUpdateInput = {
    title: input.data.title,
    description: input.data.description,
    status: input.data.status,
    dueAt: input.data.dueAt,
    ownerUserId: input.data.ownerUserId,
    pipelineStep: input.data.pipelineStep,
  };

  const task = await prisma.task.update({
    where: { id: input.taskId },
    data,
  });

  return {
    task,
    completedTransition:
      input.data.status === "DONE" && existingTask.status !== "DONE",
  };
}

export async function listDealStakeholders(input: {
  dealId: string;
  orgId: string;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const stakeholders = await prisma.dealStakeholder.findMany({
    where: { dealId: authorized.dealId },
    orderBy: { createdAt: "desc" },
  });
  return {
    stakeholders: stakeholders.map((item) => serializeStakeholder(item)),
  };
}

export async function createDealStakeholder(input: {
  dealId: string;
  orgId: string;
  payload: DealStakeholderCreateInput;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const stakeholder = await prisma.dealStakeholder.create({
    data: {
      ...input.payload,
      orgId: input.orgId,
      dealId: authorized.dealId,
    },
  });
  return { stakeholder: serializeStakeholder(stakeholder) };
}

export async function updateDealStakeholder(input: {
  dealId: string;
  orgId: string;
  stakeholderId: string;
  payload: DealStakeholderPatchInput;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const existing = await prisma.dealStakeholder.findFirst({
    where: { id: input.stakeholderId, orgId: input.orgId, dealId: authorized.dealId },
    select: { id: true },
  });

  if (!existing) {
    throw new DealStakeholderNotFoundError();
  }

  const stakeholder = await prisma.dealStakeholder.update({
    where: { id: input.stakeholderId },
    data: toStakeholderPayload(input.payload),
  });

  return { stakeholder: serializeStakeholder(stakeholder) };
}

export async function deleteDealStakeholder(input: {
  dealId: string;
  orgId: string;
  stakeholderId: string;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const existing = await prisma.dealStakeholder.findFirst({
    where: { id: input.stakeholderId, orgId: input.orgId, dealId: authorized.dealId },
    select: { id: true },
  });

  if (!existing) {
    throw new DealStakeholderNotFoundError();
  }

  const stakeholder = await prisma.dealStakeholder.delete({
    where: { id: input.stakeholderId },
  });

  return { stakeholder: serializeStakeholder(stakeholder) };
}

export async function listDealRisks(input: {
  dealId: string;
  orgId: string;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const risks = await prisma.dealRisk.findMany({
    where: { dealId: authorized.dealId },
    orderBy: { createdAt: "desc" },
  });
  return { risks: risks.map((risk) => serializeRisk(risk)) };
}

export async function createDealRisk(input: {
  dealId: string;
  orgId: string;
  payload: DealRiskPatchInput;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const risk = await prisma.dealRisk.create({
    data: {
      ...toRiskPayload(input.payload),
      orgId: input.orgId,
      dealId: authorized.dealId,
    },
  });
  return { risk: serializeRisk(risk) };
}

export async function updateDealRisk(input: {
  dealId: string;
  orgId: string;
  riskId: string;
  payload: DealRiskPatchInput;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const existing = await prisma.dealRisk.findFirst({
    where: { id: input.riskId, orgId: input.orgId, dealId: authorized.dealId },
    select: { id: true },
  });

  if (!existing) {
    throw new DealRiskNotFoundError();
  }

  const risk = await prisma.dealRisk.update({
    where: { id: input.riskId },
    data: toRiskPayload(input.payload),
  });

  return { risk: serializeRisk(risk) };
}

export async function deleteDealRisk(input: {
  dealId: string;
  orgId: string;
  riskId: string;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const existing = await prisma.dealRisk.findFirst({
    where: { id: input.riskId, orgId: input.orgId, dealId: authorized.dealId },
    select: { id: true },
  });

  if (!existing) {
    throw new DealRiskNotFoundError();
  }

  const risk = await prisma.dealRisk.delete({
    where: { id: input.riskId },
  });

  return { risk: serializeRisk(risk) };
}

export async function getDealTerms(input: {
  dealId: string;
  orgId: string;
}) {
  const authorized = await authorizeDeal(input.dealId, input.orgId);
  const terms = await prisma.dealTerms.findUnique({
    where: { dealId: authorized.dealId },
  });
  return { terms: terms ? serializeTerms(terms) : null };
}

export async function upsertDealTerms(input: {
  dealId: string;
  orgId: string;
  payload: DealTermsPatchInput;
}) {
  await authorizeDeal(input.dealId, input.orgId);
  const terms = await prisma.dealTerms.upsert({
    where: { dealId: input.dealId },
    create: {
      ...toTermsPayload(input.payload),
      dealId: input.dealId,
      orgId: input.orgId,
    },
    update: toTermsPayload(input.payload),
  });
  return { terms: serializeTerms(terms) };
}

export async function deleteDealTerms(input: {
  dealId: string;
  orgId: string;
}) {
  await authorizeDeal(input.dealId, input.orgId);
  try {
    const terms = await prisma.dealTerms.delete({ where: { dealId: input.dealId } });
    return { terms: serializeTerms(terms) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to delete does not exist")) {
      throw new DealTermsNotFoundError();
    }
    throw error;
  }
}
