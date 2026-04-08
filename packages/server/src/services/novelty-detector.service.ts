import { prisma } from "@entitlement-os/db";

const NOVELTY_THRESHOLDS = {
  HIGH_SOURCE_RELIABILITY: 0.7,
  LOW_AGREEMENT: 0.3,
} as const;

export interface NoveltyCheckResult {
  isNovel: boolean;
  reason: string;
  sourceReliability: number;
  agreementScore: number;
}

export function checkNovelty(
  sourceReliability: number,
  agreementScore: number,
): NoveltyCheckResult {
  const isHighReliability =
    sourceReliability >= NOVELTY_THRESHOLDS.HIGH_SOURCE_RELIABILITY;
  const isLowAgreement = agreementScore < NOVELTY_THRESHOLDS.LOW_AGREEMENT;
  const isNovel = isHighReliability && isLowAgreement;

  let reason = "";
  if (isNovel) {
    reason = `Novel: source reliability ${(sourceReliability * 100).toFixed(0)}% >= ${NOVELTY_THRESHOLDS.HIGH_SOURCE_RELIABILITY * 100}% but agreement ${(agreementScore * 100).toFixed(0)}% < ${NOVELTY_THRESHOLDS.LOW_AGREEMENT * 100}%`;
  }

  return { isNovel, reason, sourceReliability, agreementScore };
}

export async function queueForReview(input: {
  orgId: string;
  entityId: string;
  memoryVerifiedId?: string;
  memoryDraftId?: string;
  factType: string;
  sourceReliability: number;
  agreementScore: number;
  noveltyReason: string;
}): Promise<{ id: string }> {
  const record = await prisma.innovationQueue.create({
    data: {
      orgId: input.orgId,
      entityId: input.entityId,
      memoryVerifiedId: input.memoryVerifiedId ?? null,
      memoryDraftId: input.memoryDraftId ?? null,
      factType: input.factType,
      sourceReliability: input.sourceReliability,
      agreementScore: input.agreementScore,
      noveltyReason: input.noveltyReason,
    },
  });

  return { id: record.id };
}

export async function getPendingInnovations(
  orgId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    entityId: string;
    factType: string;
    sourceReliability: number;
    agreementScore: number;
    noveltyReason: string;
    status: string;
    createdAt: Date;
  }>
> {
  return prisma.innovationQueue.findMany({
    where: { orgId, status: "pending" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function reviewInnovation(
  orgId: string,
  innovationId: string,
  reviewedBy: string,
  decision: "approve" | "reject",
): Promise<void> {
  await prisma.innovationQueue.update({
    where: { id: innovationId, orgId },
    data: {
      status: decision === "approve" ? "approved" : "rejected",
      reviewedBy,
      reviewedAt: new Date(),
      reviewDecision: decision,
    },
  });
}
