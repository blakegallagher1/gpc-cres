import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";

// GET /api/buyers - list buyers for the org
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const buyerType = searchParams.get("buyerType");

    const org = await prisma.org.findFirst();
    if (!org) {
      return NextResponse.json({ buyers: [] });
    }

    const where: Record<string, unknown> = { orgId: org.id };
    if (buyerType) where.buyerType = buyerType;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    const buyers = await prisma.buyer.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ buyers });
  } catch (error) {
    console.error("Error fetching buyers:", error);
    return NextResponse.json(
      { error: "Failed to fetch buyers" },
      { status: 500 }
    );
  }
}

// POST /api/buyers - create a new buyer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.buyerType) {
      return NextResponse.json(
        { error: "name and buyerType are required" },
        { status: 400 }
      );
    }

    const org = await prisma.org.findFirst();
    if (!org) {
      return NextResponse.json({ error: "No org found" }, { status: 400 });
    }

    const buyer = await prisma.buyer.create({
      data: {
        orgId: org.id,
        name: body.name,
        company: body.company ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        buyerType: body.buyerType,
        skuInterests: body.skuInterests ?? [],
        jurisdictionInterests: body.jurisdictionInterests ?? [],
        notes: body.notes ?? null,
      },
    });

    return NextResponse.json({ buyer }, { status: 201 });
  } catch (error) {
    console.error("Error creating buyer:", error);
    return NextResponse.json(
      { error: "Failed to create buyer" },
      { status: 500 }
    );
  }
}
