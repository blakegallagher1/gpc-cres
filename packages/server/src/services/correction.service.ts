import "server-only";

import { prisma } from "@entitlement-os/db";
import type { Prisma, MemoryVerified } from "@entitlement-os/db";
import type { CorrectionPayload } from "../../../../apps/web/lib/schemas/memoryWrite";

export async function applyCorrection(
  entityId: string,
  orgId: string,
  correction: CorrectionPayload,
  eventLogId: string,
  requestId: string,
): Promise<MemoryVerified> {
  return prisma.memoryVerified.create({
    data: {
      orgId,
      entityId,
      factType: "correction",
      sourceType: "correction",
      economicWeight: 1.0,
      volatilityClass: "stable",
      payloadJson: correction as unknown as Prisma.InputJsonValue,
      requestId,
      eventLogId,
    },
  });
}
