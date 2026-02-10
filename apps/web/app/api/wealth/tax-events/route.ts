import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const eventType = searchParams.get("eventType");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = { orgId: auth.orgId };
  if (eventType) where.eventType = eventType;
  if (status) where.status = status;

  const taxEvents = await prisma.taxEvent.findMany({
    where,
    include: {
      entity: { select: { id: true, name: true, entityType: true } },
      deal: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ taxEvents });
}

export async function POST(request: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { entityId, dealId, eventType, title, description, severity, deadline, metadata } = body;

    if (!eventType || !title || !severity) {
      return NextResponse.json({ error: "eventType, title, and severity are required" }, { status: 400 });
    }

    if (entityId) {
      const entity = await prisma.entity.findFirst({ where: { id: entityId, orgId: auth.orgId } });
      if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    if (dealId) {
      const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId: auth.orgId } });
      if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const taxEvent = await prisma.taxEvent.create({
      data: {
        orgId: auth.orgId,
        entityId: entityId || null,
        dealId: dealId || null,
        eventType,
        title,
        description: description || null,
        severity,
        deadline: deadline ? new Date(deadline) : null,
        metadata: metadata || null,
      },
    });

    return NextResponse.json({ taxEvent }, { status: 201 });
  } catch (error) {
    console.error("Error creating tax event:", error);
    return NextResponse.json({ error: "Failed to create tax event" }, { status: 500 });
  }
}
