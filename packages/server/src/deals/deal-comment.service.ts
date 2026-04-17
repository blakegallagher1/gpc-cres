import { prisma } from "@entitlement-os/db";

export interface DealCommentRecord {
  id: string;
  dealId: string;
  authorUserId: string;
  authorEmail: string | null;
  parentCommentId: string | null;
  body: string;
  mentions: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
}

export interface CreateDealCommentInput {
  orgId: string;
  dealId: string;
  authorUserId: string;
  body: string;
  parentCommentId?: string | null;
  mentions?: string[];
}

const MAX_BODY_LENGTH = 10_000;

function assertBody(body: string): void {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error("Deal comment body cannot be empty");
  }
  if (trimmed.length > MAX_BODY_LENGTH) {
    throw new Error(`Deal comment body exceeds ${MAX_BODY_LENGTH} characters`);
  }
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

export async function createDealComment(
  input: CreateDealCommentInput,
): Promise<DealCommentRecord> {
  assertBody(input.body);
  await assertDealInOrg(input.orgId, input.dealId);

  if (input.parentCommentId) {
    const parent = await prisma.dealComment.findFirst({
      where: {
        id: input.parentCommentId,
        orgId: input.orgId,
        dealId: input.dealId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!parent) {
      throw new Error("Parent comment not found on this deal");
    }
  }

  const created = await prisma.dealComment.create({
    data: {
      orgId: input.orgId,
      dealId: input.dealId,
      authorUserId: input.authorUserId,
      body: input.body.trim(),
      parentCommentId: input.parentCommentId ?? null,
      mentions: input.mentions ?? [],
    },
    include: {
      author: { select: { email: true } },
      _count: { select: { replies: true } },
    },
  });

  return {
    id: created.id,
    dealId: created.dealId,
    authorUserId: created.authorUserId,
    authorEmail: created.author?.email ?? null,
    parentCommentId: created.parentCommentId,
    body: created.body,
    mentions: created.mentions,
    pinned: created.pinned,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
    replyCount: created._count.replies,
  };
}

export async function listDealComments(
  orgId: string,
  dealId: string,
): Promise<DealCommentRecord[]> {
  await assertDealInOrg(orgId, dealId);

  const rows = await prisma.dealComment.findMany({
    where: { orgId, dealId, deletedAt: null },
    orderBy: [{ pinned: "desc" }, { createdAt: "asc" }],
    include: {
      author: { select: { email: true } },
      _count: { select: { replies: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    dealId: row.dealId,
    authorUserId: row.authorUserId,
    authorEmail: row.author?.email ?? null,
    parentCommentId: row.parentCommentId,
    body: row.body,
    mentions: row.mentions,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    replyCount: row._count.replies,
  }));
}

export async function updateDealComment(params: {
  orgId: string;
  dealId: string;
  commentId: string;
  actorUserId: string;
  body?: string;
  pinned?: boolean;
}): Promise<DealCommentRecord> {
  const existing = await prisma.dealComment.findFirst({
    where: {
      id: params.commentId,
      orgId: params.orgId,
      dealId: params.dealId,
      deletedAt: null,
    },
    select: { authorUserId: true },
  });
  if (!existing) {
    throw new Error("Comment not found");
  }

  if (typeof params.body === "string") {
    assertBody(params.body);
    if (existing.authorUserId !== params.actorUserId) {
      throw new Error("Only the author can edit a comment");
    }
  }

  const updated = await prisma.dealComment.update({
    where: { id: params.commentId },
    data: {
      ...(typeof params.body === "string" ? { body: params.body.trim() } : {}),
      ...(typeof params.pinned === "boolean" ? { pinned: params.pinned } : {}),
    },
    include: {
      author: { select: { email: true } },
      _count: { select: { replies: true } },
    },
  });

  return {
    id: updated.id,
    dealId: updated.dealId,
    authorUserId: updated.authorUserId,
    authorEmail: updated.author?.email ?? null,
    parentCommentId: updated.parentCommentId,
    body: updated.body,
    mentions: updated.mentions,
    pinned: updated.pinned,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    replyCount: updated._count.replies,
  };
}

export async function deleteDealComment(params: {
  orgId: string;
  dealId: string;
  commentId: string;
  actorUserId: string;
}): Promise<void> {
  const existing = await prisma.dealComment.findFirst({
    where: {
      id: params.commentId,
      orgId: params.orgId,
      dealId: params.dealId,
      deletedAt: null,
    },
    select: { authorUserId: true },
  });
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.authorUserId !== params.actorUserId) {
    throw new Error("Only the author can delete a comment");
  }

  await prisma.dealComment.update({
    where: { id: params.commentId },
    data: { deletedAt: new Date() },
  });
}
