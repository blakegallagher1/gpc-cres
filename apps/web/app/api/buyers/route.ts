import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import type { Prisma } from "@entitlement-os/db";

// GET /api/buyers - list buyers for the org
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const buyerType = searchParams.get("buyerType");
    const dealId = searchParams.get("dealId");
    const withDeals =
      searchParams.get("withDeals") === "1" ||
      searchParams.get("withDeals")?.toLowerCase() === "true";

    const where: Prisma.BuyerWhereInput = { orgId: auth.orgId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }
    if (buyerType) {
      where.buyerType = buyerType;
    }
    if (dealId) {
      where.outreach = {
        some: { dealId },
      };
    }

    if (!withDeals) {
      const buyers = await prisma.buyer.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ buyers });
    }

    const buyers = await prisma.buyer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        outreach: {
          where: dealId ? { dealId } : undefined,
          select: {
            status: true,
            channel: true,
            lastContactAt: true,
            nextFollowupAt: true,
            deal: {
              select: {
                id: true,
                name: true,
                status: true,
                sku: true,
                jurisdiction: {
                  select: {
                    id: true,
                    name: true,
                    kind: true,
                    state: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const normalizedBuyers = buyers.map((buyer) => {
      const dealsById = new Map<
        string,
        {
          id: string;
          name: string;
          status: string;
          sku: string;
          jurisdiction?: {
            id: string;
            name: string;
            kind: string;
            state: string;
          } | null;
        }
      >();

      const outreach = buyer.outreach ?? [];

      for (const relation of outreach) {
        if (!relation.deal) {
          continue;
        }

        const { deal } = relation;
        if (dealsById.has(deal.id)) continue;
        dealsById.set(deal.id, {
          id: deal.id,
          name: deal.name,
          status: String(deal.status),
          sku: String(deal.sku),
          jurisdiction: deal.jurisdiction
            ? {
                id: deal.jurisdiction.id,
                name: deal.jurisdiction.name,
                kind: deal.jurisdiction.kind,
                state: deal.jurisdiction.state,
              }
            : null,
        });
      }

      return {
        ...buyer,
        deals: Array.from(dealsById.values()),
        outreach: undefined,
      };
    });

    return NextResponse.json({ buyers: normalizedBuyers });
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
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.name || !body.buyerType) {
      return NextResponse.json(
        { error: "name and buyerType are required" },
        { status: 400 }
      );
    }

    const buyer = await prisma.buyer.create({
      data: {
        orgId: auth.orgId,
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
