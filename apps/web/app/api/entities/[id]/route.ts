import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const entity = await prisma.entity.findFirst({
    where: { id, orgId: auth.orgId },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true, entityType: true } },
      deals: { include: { deal: { select: { id: true, name: true, status: true } } } },
      taxEvents: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  return NextResponse.json({ entity });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.entity.findFirst({ where: { id, orgId: auth.orgId } });
  if (!existing) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  try {
    const body = await request.json();
    const { name, entityType, parentId, ownershipPct, taxId, state } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (entityType !== undefined) updateData.entityType = entityType;
    if (parentId !== undefined) updateData.parentId = parentId || null;
    if (ownershipPct !== undefined) updateData.ownershipPct = ownershipPct;
    if (taxId !== undefined) updateData.taxId = taxId || null;
    if (state !== undefined) updateData.state = state || null;

    const entity = await prisma.entity.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ entity });
  } catch (error) {
    console.error("Error updating entity:", error);
    return NextResponse.json({ error: "Failed to update entity" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.entity.findFirst({ where: { id, orgId: auth.orgId } });
  if (!existing) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  await prisma.entity.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
