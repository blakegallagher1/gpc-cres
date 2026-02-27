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
  // Remove trailing periods and commas
  addr = addr.replace(/[.,]+$/, "");
  // Standardize abbreviations (word boundary match)
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    addr = addr.replace(
      new RegExp(`\\b${abbr}\\.?\\b`, "g"),
      full,
    );
  }
  return addr;
}

export async function resolveEntityId({
  address,
  parcelId,
  type,
  orgId,
}: {
  address?: string | null;
  parcelId?: string | null;
  type?: string | null;
  orgId: string;
}): Promise<string> {
  // Try lookup by parcelId first
  if (parcelId) {
    const existing = await prisma.internalEntity.findFirst({
      where: { orgId, parcelId },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  // Try lookup by canonicalAddress
  if (address) {
    const canonical = normalizeAddress(address);
    const existing = await prisma.internalEntity.findFirst({
      where: { orgId, canonicalAddress: canonical },
      select: { id: true },
    });
    if (existing) return existing.id;

    // Create new entity
    const created = await prisma.internalEntity.create({
      data: {
        orgId,
        canonicalAddress: canonical,
        parcelId: parcelId ?? null,
        type: type ?? "property",
      },
      select: { id: true },
    });
    return created.id;
  }

  // No address — create entity with parcelId only
  if (parcelId) {
    const created = await prisma.internalEntity.create({
      data: {
        orgId,
        parcelId,
        type: type ?? "property",
      },
      select: { id: true },
    });
    return created.id;
  }

  throw new Error("Either address or parcelId must be provided for entity resolution");
}
