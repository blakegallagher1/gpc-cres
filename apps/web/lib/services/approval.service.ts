import { prisma } from "@entitlement-os/db";
import { requiresHumanApproval, getAdvancementCriteria } from "@/lib/automation/gates";
import type { DealStatus } from "@entitlement-os/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalRequestRecord {
  id: string;
  dealId: string;
  dealName: string;
  requestedBy: string;
  stageFrom: string;
  stageTo: string;
  status: string;
  reviewerNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  supportingData: Record<string, unknown>;
  createdAt: string;
  criteria: {
    description: string;
    additionalChecks: string[];
  } | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createApprovalRequest(
  dealId: string,
  requestedBy: string,
  stageFrom: DealStatus,
  stageTo: DealStatus,
  supportingData?: Record<string, unknown>
): Promise<string> {
  if (!requiresHumanApproval(stageFrom, stageTo)) {
    throw new Error(
      `Transition ${stageFrom} → ${stageTo} does not require approval`
    );
  }

  // Check for existing pending request for same deal+transition
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      dealId,
      stageFrom,
      stageTo,
      status: "pending",
    },
  });

  if (existing) {
    return existing.id;
  }

  const request = await prisma.approvalRequest.create({
    data: {
      dealId,
      requestedBy,
      stageFrom,
      stageTo,
      supportingData: (supportingData ?? {}) as object,
    },
  });

  return request.id;
}

export async function approveRequest(
  requestId: string,
  decidedBy: string,
  notes?: string
): Promise<void> {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
    select: { dealId: true, stageTo: true, status: true },
  });

  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending")
    throw new Error(`Request is already ${request.status}`);

  // Update the approval request
  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: {
      status: "approved",
      decidedBy,
      decidedAt: new Date(),
      reviewerNotes: notes ?? null,
    },
  });

  // Advance the deal
  await prisma.deal.update({
    where: { id: request.dealId },
    data: { status: request.stageTo as DealStatus },
  });
}

export async function rejectRequest(
  requestId: string,
  decidedBy: string,
  notes: string
): Promise<void> {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
    select: { status: true },
  });

  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending")
    throw new Error(`Request is already ${request.status}`);

  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: {
      status: "rejected",
      decidedBy,
      decidedAt: new Date(),
      reviewerNotes: notes,
    },
  });
}

export async function requestChanges(
  requestId: string,
  decidedBy: string,
  notes: string
): Promise<void> {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
    select: { status: true },
  });

  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending")
    throw new Error(`Request is already ${request.status}`);

  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: {
      status: "changes_requested",
      decidedBy,
      decidedAt: new Date(),
      reviewerNotes: notes,
    },
  });
}

export async function getPendingApprovals(
  orgId: string
): Promise<ApprovalRequestRecord[]> {
  const requests = await prisma.approvalRequest.findMany({
    where: {
      status: "pending",
      deal: { orgId },
    },
    include: {
      deal: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests.map((r) => {
    const criteria = getAdvancementCriteria(r.stageFrom as DealStatus);
    return {
      id: r.id,
      dealId: r.dealId,
      dealName: (r as unknown as { deal: { name: string } }).deal.name,
      requestedBy: r.requestedBy,
      stageFrom: r.stageFrom,
      stageTo: r.stageTo,
      status: r.status,
      reviewerNotes: r.reviewerNotes,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      supportingData: (r.supportingData ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
      criteria: criteria
        ? {
            description: criteria.description,
            additionalChecks: criteria.additionalChecks,
          }
        : null,
    };
  });
}

export async function getApprovalHistory(
  dealId: string,
  limit = 20
): Promise<ApprovalRequestRecord[]> {
  const requests = await prisma.approvalRequest.findMany({
    where: { dealId },
    include: {
      deal: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return requests.map((r) => {
    const criteria = getAdvancementCriteria(r.stageFrom as DealStatus);
    return {
      id: r.id,
      dealId: r.dealId,
      dealName: (r as unknown as { deal: { name: string } }).deal.name,
      requestedBy: r.requestedBy,
      stageFrom: r.stageFrom,
      stageTo: r.stageTo,
      status: r.status,
      reviewerNotes: r.reviewerNotes,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      supportingData: (r.supportingData ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
      criteria: criteria
        ? {
            description: criteria.description,
            additionalChecks: criteria.additionalChecks,
          }
        : null,
    };
  });
}

export async function getPendingCount(orgId: string): Promise<number> {
  return prisma.approvalRequest.count({
    where: {
      status: "pending",
      deal: { orgId },
    },
  });
}
