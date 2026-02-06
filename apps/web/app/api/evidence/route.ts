import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";

// GET /api/evidence - list evidence sources
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const officialOnly = searchParams.get("official");

    const org = await prisma.org.findFirst();
    if (!org) {
      return NextResponse.json({ sources: [] });
    }

    const where: Record<string, unknown> = { orgId: org.id };
    if (officialOnly === "true") where.isOfficial = true;
    if (search) {
      where.OR = [
        { url: { contains: search, mode: "insensitive" } },
        { domain: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
      ];
    }

    const sources = await prisma.evidenceSource.findMany({
      where,
      include: {
        _count: { select: { evidenceSnapshots: true } },
        evidenceSnapshots: {
          orderBy: { retrievedAt: "desc" },
          take: 1,
          select: { retrievedAt: true, contentHash: true },
        },
      },
      orderBy: { firstSeenAt: "desc" },
    });

    const result = sources.map((s: typeof sources[number]) => ({
      id: s.id,
      url: s.url,
      domain: s.domain,
      title: s.title,
      isOfficial: s.isOfficial,
      firstSeenAt: s.firstSeenAt.toISOString(),
      snapshotCount: s._count.evidenceSnapshots,
      latestSnapshot: s.evidenceSnapshots[0]
        ? {
            retrievedAt: s.evidenceSnapshots[0].retrievedAt.toISOString(),
            contentHash: s.evidenceSnapshots[0].contentHash,
          }
        : null,
    }));

    return NextResponse.json({ sources: result });
  } catch (error) {
    console.error("Error fetching evidence sources:", error);
    return NextResponse.json(
      { error: "Failed to fetch evidence sources" },
      { status: 500 }
    );
  }
}
