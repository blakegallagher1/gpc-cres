import "server-only";

import { prisma } from "@entitlement-os/db";

const ABBREVIATIONS: Record<string, string> = {
  st: "street",
  ave: "avenue",
  dr: "drive",
  blvd: "boulevard",
  ln: "lane",
  ct: "court",
  rd: "road",
  hwy: "highway",
  pl: "place",
  cir: "circle",
  pkwy: "parkway",
  sq: "square",
};

export function normalizeAddress(raw: string): string {
  let addr = raw.toLowerCase().trim().replace(/\s+/g, " ");
  addr = addr.replace(/[.,]+$/, "");
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    addr = addr.replace(new RegExp(`\\b${abbr}\\.?\\b`, "g"), full);
  }
  return addr;
}

export async function resolveEntityId(params: {
  address?: string | null;
  parcelId?: string | null;
  type?: string | null;
  orgId: string;
}): Promise<string> {
  if (params.parcelId) {
    const existing = await prisma.internalEntity.findFirst({
      where: { orgId: params.orgId, parcelId: params.parcelId },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  if (params.address) {
    const canonical = normalizeAddress(params.address);
    const existing = await prisma.internalEntity.findFirst({
      where: { orgId: params.orgId, canonicalAddress: canonical },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await prisma.internalEntity.create({
      data: {
        orgId: params.orgId,
        canonicalAddress: canonical,
        parcelId: params.parcelId ?? null,
        type: params.type ?? "property",
      },
      select: { id: true },
    });
    return created.id;
  }

  if (params.parcelId) {
    const created = await prisma.internalEntity.create({
      data: {
        orgId: params.orgId,
        parcelId: params.parcelId,
        type: params.type ?? "property",
      },
      select: { id: true },
    });
    return created.id;
  }

  throw new Error("Either address or parcelId must be provided for entity resolution");
}
