import "server-only";

import { prisma, type Prisma } from "@entitlement-os/db";

const VALID_ENTITY_TYPES = ["LLC", "TRUST", "CORP", "INDIVIDUAL"] as const;

type EntityMutationBody = Record<string, unknown>;

export class EntityValidationError extends Error {}
export class EntityNotFoundError extends Error {}

export async function listEntities(orgId: string) {
  return prisma.entity.findMany({
    where: { orgId },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true } },
      deals: { include: { deal: { select: { id: true, name: true } } } },
      _count: { select: { taxEvents: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getEntity(orgId: string, id: string) {
  return prisma.entity.findFirst({
    where: { id, orgId },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true, entityType: true } },
      deals: { include: { deal: { select: { id: true, name: true, status: true } } } },
      taxEvents: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
}

export async function createEntity(orgId: string, body: EntityMutationBody) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const entityType = typeof body.entityType === "string" ? body.entityType : "";
  const parentId = typeof body.parentId === "string" && body.parentId.length > 0 ? body.parentId : null;
  const ownershipPct = typeof body.ownershipPct === "number" ? body.ownershipPct : undefined;
  const taxId = typeof body.taxId === "string" && body.taxId.length > 0 ? body.taxId : null;
  const state = typeof body.state === "string" && body.state.length > 0 ? body.state : null;

  if (!name || !entityType) {
    throw new EntityValidationError("name and entityType are required");
  }

  if (!VALID_ENTITY_TYPES.includes(entityType as (typeof VALID_ENTITY_TYPES)[number])) {
    throw new EntityValidationError(
      `entityType must be one of: ${VALID_ENTITY_TYPES.join(", ")}`,
    );
  }

  const normalizedEntityType = entityType as Prisma.EntityCreateInput["entityType"];

  if (parentId) {
    const parent = await prisma.entity.findFirst({ where: { id: parentId, orgId } });
    if (!parent) throw new EntityNotFoundError("Parent entity not found");
  }

  return prisma.entity.create({
    data: {
      orgId,
      name,
      entityType: normalizedEntityType,
      parentId,
      ownershipPct: ownershipPct ?? 100,
      taxId,
      state,
    },
  });
}

export async function updateEntity(orgId: string, id: string, body: EntityMutationBody) {
  const existing = await prisma.entity.findFirst({ where: { id, orgId } });
  if (!existing) throw new EntityNotFoundError("Entity not found");

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.entityType !== undefined) updateData.entityType = body.entityType;
  if (body.parentId !== undefined) updateData.parentId = body.parentId || null;
  if (body.ownershipPct !== undefined) updateData.ownershipPct = body.ownershipPct;
  if (body.taxId !== undefined) updateData.taxId = body.taxId || null;
  if (body.state !== undefined) updateData.state = body.state || null;

  return prisma.entity.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteEntity(orgId: string, id: string) {
  const existing = await prisma.entity.findFirst({ where: { id, orgId } });
  if (!existing) throw new EntityNotFoundError("Entity not found");

  await prisma.entity.delete({ where: { id } });
}
