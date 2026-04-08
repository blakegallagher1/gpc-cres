import "server-only";

import { prisma } from "@entitlement-os/db";

import { normalizeAddress } from "./entity-resolution.service";
import { getTruthView } from "./truth-view.service";

export async function lookupEntityByAddressOrParcel(params: {
  orgId: string;
  address?: string | null;
  parcelId?: string | null;
}) {
  if (params.parcelId) {
    const entity = await prisma.internalEntity.findFirst({
      where: { orgId: params.orgId, parcelId: params.parcelId },
      select: { id: true, canonicalAddress: true, parcelId: true },
    });
    if (entity) {
      return {
        found: true as const,
        entityId: entity.id,
        canonicalAddress: entity.canonicalAddress,
        parcelId: entity.parcelId,
        truth: await getTruthView(entity.id, params.orgId),
      };
    }
  }

  if (params.address) {
    const canonical = normalizeAddress(params.address);
    const entity = await prisma.internalEntity.findFirst({
      where: { orgId: params.orgId, canonicalAddress: canonical },
      select: { id: true, canonicalAddress: true, parcelId: true },
    });
    if (entity) {
      return {
        found: true as const,
        entityId: entity.id,
        canonicalAddress: entity.canonicalAddress,
        parcelId: entity.parcelId,
        truth: await getTruthView(entity.id, params.orgId),
      };
    }
  }

  return { found: false as const };
}
