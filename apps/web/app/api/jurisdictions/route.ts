import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";

// GET /api/jurisdictions - list jurisdictions for the org
export async function GET() {
  try {
    const org = await prisma.org.findFirst();
    if (!org) {
      return NextResponse.json({ jurisdictions: [] });
    }

    const jurisdictions = await prisma.jurisdiction.findMany({
      where: { orgId: org.id },
      include: {
        seedSources: { select: { id: true, active: true } },
        parishPackVersions: {
          where: { status: "current" },
          orderBy: { generatedAt: "desc" },
          take: 1,
          select: { generatedAt: true, version: true },
        },
        _count: { select: { deals: true } },
      },
      orderBy: { name: "asc" },
    });

    const result = jurisdictions.map((j: typeof jurisdictions[number]) => ({
      id: j.id,
      name: j.name,
      kind: j.kind,
      state: j.state,
      timezone: j.timezone,
      officialDomains: j.officialDomains,
      seedSourceCount: j.seedSources.filter((s: { id: string; active: boolean }) => s.active).length,
      dealCount: j._count.deals,
      latestPack: j.parishPackVersions[0] ?? null,
    }));

    return NextResponse.json({ jurisdictions: result });
  } catch (error) {
    console.error("Error fetching jurisdictions:", error);
    return NextResponse.json(
      { error: "Failed to fetch jurisdictions" },
      { status: 500 }
    );
  }
}
