import "server-only";

import { prisma } from "@entitlement-os/db";

export type CreateMemoryFeedbackInput = {
  orgId: string;
  userId: string;
  requestId: string;
  memoryId: string;
  positive: boolean;
};

export async function createMemoryFeedback(input: CreateMemoryFeedbackInput) {
  return prisma.memoryFeedback.create({
    data: {
      orgId: input.orgId,
      requestId: input.requestId,
      memoryId: input.memoryId,
      positive: input.positive,
      userId: input.userId,
    },
  });
}
