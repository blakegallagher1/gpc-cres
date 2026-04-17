import { prisma } from "@entitlement-os/db";

export type DealContingencyCategory =
  | "title"
  | "survey"
  | "environmental"
  | "appraisal"
  | "financing"
  | "inspection"
  | "hoa"
  | "zoning"
  | "utilities"
  | "other";

export type DealContingencyStatus =
  | "open"
  | "in_progress"
  | "satisfied"
  | "waived"
  | "failed";

export interface DealContingencyRecord {
  id: string;
  orgId: string;
  dealId: string;
  category: DealContingencyCategory;
  title: string;
  description: string | null;
  status: DealContingencyStatus;
  deadline: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  satisfiedAt: string | null;
  satisfiedBy: string | null;
  satisfactionNotes: string | null;
  noticeDaysBeforeDeadline: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDealContingencyInput {
  orgId: string;
  dealId: string;
  category: DealContingencyCategory;
  title: string;
  description?: string | null;
  deadline?: string | Date | null;
  ownerUserId?: string | null;
  noticeDaysBeforeDeadline?: number;
}

export interface UpdateDealContingencyInput {
  orgId: string;
  dealId: string;
  contingencyId: string;
  actorUserId: string;
  patch: {
    status?: DealContingencyStatus;
    deadline?: string | Date | null;
    ownerUserId?: string | null;
    satisfactionNotes?: string | null;
    noticeDaysBeforeDeadline?: number;
    title?: string;
    description?: string | null;
    category?: DealContingencyCategory;
  };
}

const VALID_CATEGORIES: ReadonlySet<DealContingencyCategory> = new Set([
  "title",
  "survey",
  "environmental",
  "appraisal",
  "financing",
  "inspection",
  "hoa",
  "zoning",
  "utilities",
  "other",
]);

const VALID_STATUSES: ReadonlySet<DealContingencyStatus> = new Set([
  "open",
  "in_progress",
  "satisfied",
  "waived",
  "failed",
]);

const MAX_TITLE_LENGTH = 240;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_NOTES_LENGTH = 10_000;

function assertCategory(category: string): asserts category is DealContingencyCategory {
  if (!VALID_CATEGORIES.has(category as DealContingencyCategory)) {
    throw new Error(`Invalid contingency category: ${category}`);
  }
}

function assertStatus(status: string): asserts status is DealContingencyStatus {
  if (!VALID_STATUSES.has(status as DealContingencyStatus)) {
    throw new Error(`Invalid contingency status: ${status}`);
  }
}

function assertTitle(title: string): void {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new Error("Contingency title cannot be empty");
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new Error(`Contingency title exceeds ${MAX_TITLE_LENGTH} characters`);
  }
}

function normalizeDeadline(value: string | Date | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid deadline value");
  }
  return date;
}

async function assertDealInOrg(orgId: string, dealId: string): Promise<void> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true },
  });
  if (!deal) {
    throw new Error("Deal not found for this org");
  }
}

function mapRow(row: {
  id: string;
  orgId: string;
  dealId: string;
  category: string;
  title: string;
  description: string | null;
  status: string;
  deadline: Date | null;
  ownerUserId: string | null;
  satisfiedAt: Date | null;
  satisfiedBy: string | null;
  satisfactionNotes: string | null;
  noticeDaysBeforeDeadline: number;
  createdAt: Date;
  updatedAt: Date;
  owner?: { email: string | null } | null;
}): DealContingencyRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    dealId: row.dealId,
    category: row.category as DealContingencyCategory,
    title: row.title,
    description: row.description,
    status: row.status as DealContingencyStatus,
    deadline: row.deadline ? row.deadline.toISOString() : null,
    ownerUserId: row.ownerUserId,
    ownerEmail: row.owner?.email ?? null,
    satisfiedAt: row.satisfiedAt ? row.satisfiedAt.toISOString() : null,
    satisfiedBy: row.satisfiedBy,
    satisfactionNotes: row.satisfactionNotes,
    noticeDaysBeforeDeadline: row.noticeDaysBeforeDeadline,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createContingency(
  input: CreateDealContingencyInput,
): Promise<DealContingencyRecord> {
  assertCategory(input.category);
  assertTitle(input.title);
  if (input.description && input.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Description exceeds ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  const deadline = normalizeDeadline(input.deadline ?? null);
  const noticeDays =
    typeof input.noticeDaysBeforeDeadline === "number"
      ? Math.max(0, Math.floor(input.noticeDaysBeforeDeadline))
      : 7;

  await assertDealInOrg(input.orgId, input.dealId);

  const created = await prisma.dealContingency.create({
    data: {
      orgId: input.orgId,
      dealId: input.dealId,
      category: input.category,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      deadline,
      ownerUserId: input.ownerUserId ?? null,
      noticeDaysBeforeDeadline: noticeDays,
    },
    include: { owner: { select: { email: true } } },
  });

  return mapRow(created);
}

export async function listContingencies(
  orgId: string,
  dealId: string,
): Promise<DealContingencyRecord[]> {
  await assertDealInOrg(orgId, dealId);

  const rows = await prisma.dealContingency.findMany({
    where: { orgId, dealId },
    include: { owner: { select: { email: true } } },
  });

  // Sort: deadline asc, nulls last; tie-break by createdAt asc for stability.
  rows.sort((a, b) => {
    if (a.deadline && b.deadline) {
      const diff = a.deadline.getTime() - b.deadline.getTime();
      if (diff !== 0) return diff;
    } else if (a.deadline && !b.deadline) {
      return -1;
    } else if (!a.deadline && b.deadline) {
      return 1;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return rows.map(mapRow);
}

export async function updateContingency(
  input: UpdateDealContingencyInput,
): Promise<DealContingencyRecord> {
  const existing = await prisma.dealContingency.findFirst({
    where: {
      id: input.contingencyId,
      orgId: input.orgId,
      dealId: input.dealId,
    },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw new Error("Contingency not found");
  }

  const data: {
    status?: string;
    deadline?: Date | null;
    ownerUserId?: string | null;
    satisfactionNotes?: string | null;
    noticeDaysBeforeDeadline?: number;
    title?: string;
    description?: string | null;
    category?: string;
    satisfiedAt?: Date | null;
    satisfiedBy?: string | null;
  } = {};

  if (input.patch.status !== undefined) {
    assertStatus(input.patch.status);
    data.status = input.patch.status;
    if (input.patch.status === "satisfied" && existing.status !== "satisfied") {
      data.satisfiedAt = new Date();
      data.satisfiedBy = input.actorUserId;
    } else if (input.patch.status !== "satisfied" && existing.status === "satisfied") {
      // Reopened/reclassified — clear satisfaction stamp.
      data.satisfiedAt = null;
      data.satisfiedBy = null;
    }
  }

  if (input.patch.deadline !== undefined) {
    data.deadline = normalizeDeadline(input.patch.deadline);
  }

  if (input.patch.ownerUserId !== undefined) {
    data.ownerUserId = input.patch.ownerUserId;
  }

  if (input.patch.satisfactionNotes !== undefined) {
    if (
      input.patch.satisfactionNotes &&
      input.patch.satisfactionNotes.length > MAX_NOTES_LENGTH
    ) {
      throw new Error(`Satisfaction notes exceeds ${MAX_NOTES_LENGTH} characters`);
    }
    data.satisfactionNotes = input.patch.satisfactionNotes || null;
  }

  if (input.patch.noticeDaysBeforeDeadline !== undefined) {
    data.noticeDaysBeforeDeadline = Math.max(
      0,
      Math.floor(input.patch.noticeDaysBeforeDeadline),
    );
  }

  if (input.patch.title !== undefined) {
    assertTitle(input.patch.title);
    data.title = input.patch.title.trim();
  }

  if (input.patch.description !== undefined) {
    if (
      input.patch.description &&
      input.patch.description.length > MAX_DESCRIPTION_LENGTH
    ) {
      throw new Error(`Description exceeds ${MAX_DESCRIPTION_LENGTH} characters`);
    }
    data.description = input.patch.description?.trim() || null;
  }

  if (input.patch.category !== undefined) {
    assertCategory(input.patch.category);
    data.category = input.patch.category;
  }

  const updated = await prisma.dealContingency.update({
    where: { id: input.contingencyId },
    data,
    include: { owner: { select: { email: true } } },
  });

  return mapRow(updated);
}

export async function deleteContingency(params: {
  orgId: string;
  dealId: string;
  contingencyId: string;
}): Promise<void> {
  const existing = await prisma.dealContingency.findFirst({
    where: {
      id: params.contingencyId,
      orgId: params.orgId,
      dealId: params.dealId,
    },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("Contingency not found");
  }
  await prisma.dealContingency.delete({ where: { id: params.contingencyId } });
}

export async function countUpcomingContingencies(
  orgId: string,
  withinDays: number,
): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
  return prisma.dealContingency.count({
    where: {
      orgId,
      status: { in: ["open", "in_progress"] },
      deadline: { not: null, lte: horizon },
    },
  });
}
