import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entities = await prisma.entity.findMany({
    where: { orgId: auth.orgId },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true } },
      deals: { include: { deal: { select: { id: true, name: true } } } },
      _count: { select: { taxEvents: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ entities });
}

export async function POST(request: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, entityType, parentId, ownershipPct, taxId, state } = body;

    if (!name || !entityType) {
      return NextResponse.json({ error: "name and entityType are required" }, { status: 400 });
    }

    const validTypes = ["LLC", "TRUST", "CORP", "INDIVIDUAL"];
    if (!validTypes.includes(entityType)) {
      return NextResponse.json({ error: `entityType must be one of: ${validTypes.join(", ")}` }, { status: 400 });
    }

    if (parentId) {
      const parent = await prisma.entity.findFirst({ where: { id: parentId, orgId: auth.orgId } });
      if (!parent) return NextResponse.json({ error: "Parent entity not found" }, { status: 404 });
    }

    const entity = await prisma.entity.create({
      data: {
        orgId: auth.orgId,
        name,
        entityType,
        parentId: parentId || null,
        ownershipPct: ownershipPct ?? 100,
        taxId: taxId || null,
        state: state || null,
      },
    });

    return NextResponse.json({ entity }, { status: 201 });
  } catch (error) {
    console.error("Error creating entity:", error);
    return NextResponse.json({ error: "Failed to create entity" }, { status: 500 });
  }
}
