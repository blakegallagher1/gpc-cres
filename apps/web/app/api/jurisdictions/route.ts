import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const PACK_STALE_DAYS = 7;

function isJsonStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function daysSince(value: Date): number {
  return Math.floor((Date.now() - value.getTime()) / (24 * 60 * 60 * 1000));
}

// GET /api/jurisdictions - list jurisdictions for the org
export async function GET() {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jurisdictions = await prisma.jurisdiction.findMany({
      where: { orgId: auth.orgId },
      include: {
        seedSources: { select: { id: true, active: true } },
        parishPackVersions: {
          where: { status: "current" },
          orderBy: { generatedAt: "desc" },
          take: 1,
          select: {
            generatedAt: true,
            version: true,
            sourceUrls: true,
            sourceEvidenceIds: true,
            sourceSnapshotIds: true,
            sourceContentHashes: true,
            officialOnly: true,
            packCoverageScore: true,
            canonicalSchemaVersion: true,
          },
        },
        _count: { select: { deals: true } },
      },
      orderBy: { name: "asc" },
    });

    const result = jurisdictions.map((j: typeof jurisdictions[number]) => {
      const latestPack = j.parishPackVersions[0] ?? null;
      const stalenessDays = latestPack ? daysSince(latestPack.generatedAt) : null;
      const isStale = stalenessDays !== null && stalenessDays >= PACK_STALE_DAYS;
      const missingEvidence: string[] = [];

      if (!latestPack) {
        missingEvidence.push("No current parish pack found for this jurisdiction.");
      } else {
        if (!isJsonStringArray(latestPack.sourceEvidenceIds)) {
          missingEvidence.push("Pack lineage is missing sourceEvidenceIds.");
        }
        if (!isJsonStringArray(latestPack.sourceSnapshotIds)) {
          missingEvidence.push("Pack lineage is missing sourceSnapshotIds.");
        }
        if (!isJsonStringArray(latestPack.sourceUrls)) {
          missingEvidence.push("Pack lineage is missing sourceUrls.");
        }
        if (!isJsonStringArray(latestPack.sourceContentHashes)) {
          missingEvidence.push("Pack lineage is missing sourceContentHashes.");
        }
        if (isStale) {
          missingEvidence.push("Pack is stale and should be refreshed.");
        }
        if (
          typeof latestPack.packCoverageScore === "number" &&
          latestPack.packCoverageScore < 0.75
        ) {
          missingEvidence.push("Pack coverage score is below recommended threshold.");
        }
      }

      return {
        id: j.id,
        name: j.name,
        kind: j.kind,
        state: j.state,
        timezone: j.timezone,
        officialDomains: j.officialDomains,
        seedSourceCount: j.seedSources.filter((s: { id: string; active: boolean }) => s.active).length,
        dealCount: j._count.deals,
        latestPack,
        packContext: {
          hasPack: !!latestPack,
          isStale,
          stalenessDays,
          missingEvidence,
        },
      };
    });

    return NextResponse.json({ jurisdictions: result });
  } catch (error) {
    console.error("Error fetching jurisdictions:", error);
    return NextResponse.json(
      { error: "Failed to fetch jurisdictions" },
      { status: 500 }
    );
  }
}
