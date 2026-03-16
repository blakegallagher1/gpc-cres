import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const PACK_STALE_DAYS = 7;

const jurisdictionInclude = {
  seedSources: { select: { id: true, active: true } },
  parishPackVersions: {
    where: { status: "current" },
    orderBy: { generatedAt: "desc" },
    take: 1,
    select: {
      id: true,
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
} satisfies Prisma.JurisdictionInclude;

type JurisdictionRecord = Prisma.JurisdictionGetPayload<{
  include: typeof jurisdictionInclude;
}>;
type LatestPackRecord = JurisdictionRecord["parishPackVersions"][number];
type PackLineageFieldName =
  | "sourceUrls"
  | "sourceEvidenceIds"
  | "sourceSnapshotIds"
  | "sourceContentHashes";

function isJsonStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    const itemTypes = Array.from(
      new Set(value.map((item) => (item === null ? "null" : typeof item))),
    );
    return `array<${itemTypes.join("|") || "unknown"}>`;
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function daysSince(value: Date): number {
  return Math.floor((Date.now() - value.getTime()) / (24 * 60 * 60 * 1000));
}

function normalizePackLineageField(
  fieldName: PackLineageFieldName,
  value: unknown,
  context: {
    jurisdictionId: string;
    jurisdictionName: string;
    packId: string;
    packVersion: number;
  },
  missingEvidence: string[],
): string[] {
  const normalized = normalizeStringArray(value);
  const isValid = isJsonStringArray(value);

  if (!isValid) {
    console.warn("[jurisdictions] malformed pack lineage field", {
      jurisdictionId: context.jurisdictionId,
      jurisdictionName: context.jurisdictionName,
      packId: context.packId,
      packVersion: context.packVersion,
      fieldName,
      receivedType: describeValue(value),
    });
  }

  if (normalized.length === 0) {
    missingEvidence.push(`Pack lineage is missing ${fieldName}.`);
  }

  return normalized;
}

function buildJurisdictionResponse(record: JurisdictionRecord) {
  try {
    const latestPackRecord = record.parishPackVersions[0] ?? null;
    const activeSeedSourceCount = record.seedSources.filter(
      (seedSource) => seedSource.active,
    ).length;
    const officialDomains = Array.isArray(record.officialDomains)
      ? record.officialDomains.filter(
          (domain): domain is string => typeof domain === "string" && domain.length > 0,
        )
      : [];

    let latestPack: {
      id: string;
      version: number;
      generatedAt: string;
      sourceUrls: string[];
      sourceEvidenceIds: string[];
      sourceSnapshotIds: string[];
      sourceContentHashes: string[];
      officialOnly: boolean;
      packCoverageScore: number | null;
      canonicalSchemaVersion: string | null;
    } | null = null;

    let stalenessDays: number | null = null;
    let isStale = false;
    const missingEvidence: string[] = [];

    if (!latestPackRecord) {
      missingEvidence.push("No current parish pack found for this jurisdiction.");
    } else {
      stalenessDays = daysSince(latestPackRecord.generatedAt);
      isStale = stalenessDays >= PACK_STALE_DAYS;

      const context = {
        jurisdictionId: record.id,
        jurisdictionName: record.name,
        packId: latestPackRecord.id,
        packVersion: latestPackRecord.version,
      };

      latestPack = {
        id: latestPackRecord.id,
        version: latestPackRecord.version,
        generatedAt: latestPackRecord.generatedAt.toISOString(),
        sourceUrls: normalizePackLineageField(
          "sourceUrls",
          latestPackRecord.sourceUrls,
          context,
          missingEvidence,
        ),
        sourceEvidenceIds: normalizePackLineageField(
          "sourceEvidenceIds",
          latestPackRecord.sourceEvidenceIds,
          context,
          missingEvidence,
        ),
        sourceSnapshotIds: normalizePackLineageField(
          "sourceSnapshotIds",
          latestPackRecord.sourceSnapshotIds,
          context,
          missingEvidence,
        ),
        sourceContentHashes: normalizePackLineageField(
          "sourceContentHashes",
          latestPackRecord.sourceContentHashes,
          context,
          missingEvidence,
        ),
        officialOnly: latestPackRecord.officialOnly,
        packCoverageScore:
          typeof latestPackRecord.packCoverageScore === "number"
            ? latestPackRecord.packCoverageScore
            : null,
        canonicalSchemaVersion:
          typeof latestPackRecord.canonicalSchemaVersion === "string"
            ? latestPackRecord.canonicalSchemaVersion
            : null,
      };

      if (isStale) {
        missingEvidence.push("Pack is stale and should be refreshed.");
      }
      if (
        typeof latestPackRecord.packCoverageScore === "number" &&
        latestPackRecord.packCoverageScore < 0.75
      ) {
        missingEvidence.push("Pack coverage score is below recommended threshold.");
      }
    }

    return {
      id: record.id,
      name: record.name,
      kind: record.kind,
      state: record.state,
      timezone: record.timezone,
      officialDomains,
      seedSourceCount: activeSeedSourceCount,
      dealCount: record._count.deals,
      latestPack,
      packContext: {
        hasPack: latestPack !== null,
        isStale,
        stalenessDays,
        missingEvidence,
      },
    };
  } catch (error) {
    console.error("[jurisdictions] failed to shape jurisdiction response", {
      jurisdictionId: record.id,
      jurisdictionName: record.name,
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      id: record.id,
      name: record.name,
      kind: record.kind,
      state: record.state,
      timezone: record.timezone,
      officialDomains: Array.isArray(record.officialDomains)
        ? record.officialDomains.filter(
            (domain): domain is string => typeof domain === "string" && domain.length > 0,
          )
        : [],
      seedSourceCount: record.seedSources.filter((seedSource) => seedSource.active).length,
      dealCount: record._count.deals,
      latestPack: null,
      packContext: {
        hasPack: false,
        isStale: false,
        stalenessDays: null,
        missingEvidence: ["Pack data could not be shaped for this jurisdiction."],
      },
    };
  }
}

// GET /api/jurisdictions - list jurisdictions for the org
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jurisdictions = await prisma.jurisdiction.findMany({
      where: { orgId: auth.orgId },
      include: jurisdictionInclude,
      orderBy: { name: "asc" },
    });

    const result = jurisdictions.map(buildJurisdictionResponse);

    return NextResponse.json({ jurisdictions: result });
  } catch (error) {
    console.error("Error fetching jurisdictions:", error);
    return NextResponse.json(
      { error: "Failed to fetch jurisdictions" },
      { status: 500 }
    );
  }
}
