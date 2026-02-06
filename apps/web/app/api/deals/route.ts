import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";

// GET /api/deals - list deals for the org
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const sku = searchParams.get("sku");
    const jurisdictionId = searchParams.get("jurisdictionId");
    const search = searchParams.get("search");

    // For now, get first org (single-tenant bootstrap).
    const org = await prisma.org.findFirst();
    if (!org) {
      return NextResponse.json({ deals: [] });
    }

    const where: Record<string, unknown> = { orgId: org.id };
    if (status) where.status = status;
    if (sku) where.sku = sku;
    if (jurisdictionId) where.jurisdictionId = jurisdictionId;
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        jurisdiction: { select: { id: true, name: true } },
        runs: {
          where: { runType: "TRIAGE" },
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { outputJson: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = deals.map((d: typeof deals[number]) => {
      const triageRun = d.runs[0];
      let triageTier: string | null = null;
      if (triageRun?.outputJson && typeof triageRun.outputJson === "object") {
        const output = triageRun.outputJson as Record<string, unknown>;
        triageTier = (output.tier as string) ?? null;
      }
      return {
        id: d.id,
        name: d.name,
        sku: d.sku,
        status: d.status,
        jurisdiction: d.jurisdiction,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        notes: d.notes,
        triageTier,
      };
    });

    return NextResponse.json({ deals: result });
  } catch (error) {
    console.error("Error fetching deals:", error);
    return NextResponse.json(
      { error: "Failed to fetch deals" },
      { status: 500 }
    );
  }
}

// POST /api/deals - create a new deal
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.sku || !body.jurisdictionId) {
      return NextResponse.json(
        { error: "name, sku, and jurisdictionId are required" },
        { status: 400 }
      );
    }

    // Validate sku
    const validSkus = ["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"];
    if (!validSkus.includes(body.sku)) {
      return NextResponse.json(
        { error: `Invalid SKU. Must be one of: ${validSkus.join(", ")}` },
        { status: 400 }
      );
    }

    // Get org + user (bootstrap: first org, first user)
    const org = await prisma.org.findFirst();
    if (!org) {
      return NextResponse.json({ error: "No org found" }, { status: 400 });
    }

    const user = await prisma.user.findFirst();
    if (!user) {
      return NextResponse.json({ error: "No user found" }, { status: 400 });
    }

    const deal = await prisma.deal.create({
      data: {
        orgId: org.id,
        name: body.name,
        sku: body.sku,
        jurisdictionId: body.jurisdictionId,
        status: "INTAKE",
        notes: body.notes ?? null,
        targetCloseDate: body.targetCloseDate ? new Date(body.targetCloseDate) : null,
        createdBy: user.id,
      },
      include: {
        jurisdiction: { select: { id: true, name: true } },
      },
    });

    // If a parcel address was provided, create the first parcel
    if (body.parcelAddress) {
      await prisma.parcel.create({
        data: {
          orgId: org.id,
          dealId: deal.id,
          address: body.parcelAddress,
          apn: body.apn ?? null,
        },
      });
    }

    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    console.error("Error creating deal:", error);
    return NextResponse.json(
      { error: "Failed to create deal" },
      { status: 500 }
    );
  }
}
