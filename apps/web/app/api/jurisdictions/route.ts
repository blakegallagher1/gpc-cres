import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const PACK_STALE_DAYS = 7;

const jurisdictionBaseSelect = {
  id: true,
  name: true,
  kind: true,
  state: true,
  timezone: true,
  seedSources: { select: { id: true, active: true } },
  _count: { select: { deals: true } },
} satisfies Prisma.JurisdictionSelect;

type JurisdictionRecord = Prisma.JurisdictionGetPayload<{
  select: typeof jurisdictionBaseSelect;
}>;
const latestPackSelect = {
  id: true,
  jurisdictionId: true,
  generatedAt: true,
  version: true,
  sourceUrls: true,
  sourceEvidenceIds: true,
  sourceSnapshotIds: true,
  sourceContentHashes: true,
  officialOnly: true,
  packCoverageScore: true,
  canonicalSchemaVersion: true,
} satisfies Prisma.ParishPackVersionSelect;

type LatestPackRecord = Prisma.ParishPackVersionGetPayload<{
  select: typeof latestPackSelect;
}>;
type PackLineageFieldName =
  | "sourceUrls"
  | "sourceEvidenceIds"
  | "sourceSnapshotIds"
  | "sourceContentHashes";

type OfficialDomainsRow = {
  id: string;
  officialDomainsRaw: string | null;
};

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

function parsePostgresTextArray(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return [];
  }

  const body = trimmed.slice(1, -1);
  if (body.length === 0) {
    return [];
  }

  const items: string[] = [];
  let current = "";
  let inQuotes = false;
  let escaping = false;

  for (const character of body) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = true;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      items.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  items.push(current);
  return normalizeStringArray(items);
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

function normalizeOfficialDomains(
  value: unknown,
  context: {
    jurisdictionId: string;
    jurisdictionName: string;
  },
): string[] {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }

  if (typeof value !== "string") {
    if (value !== null && value !== undefined) {
      console.warn("[jurisdictions] malformed official domains", {
        jurisdictionId: context.jurisdictionId,
        jurisdictionName: context.jurisdictionName,
        receivedType: describeValue(value),
      });
    }
    return [];
  }

  let candidate: unknown = value.trim();
  if (typeof candidate !== "string" || candidate.length === 0) {
    return [];
  }

  for (let depth = 0; depth < 2; depth += 1) {
    if (Array.isArray(candidate)) {
      return normalizeStringArray(candidate);
    }

    if (typeof candidate !== "string") {
      break;
    }

    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
      return [];
    }

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return parsePostgresTextArray(trimmed);
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return normalizeStringArray(parsed);
      }
      candidate = parsed;
      continue;
    } catch {
      break;
    }
  }

  console.warn("[jurisdictions] malformed official domains", {
    jurisdictionId: context.jurisdictionId,
    jurisdictionName: context.jurisdictionName,
    receivedType: describeValue(value),
  });
  return [];
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

function buildJurisdictionResponse(
  record: JurisdictionRecord,
  officialDomains: string[],
  latestPackRecord: LatestPackRecord | null,
  packLookupFailed: boolean,
) {
  try {
    const activeSeedSourceCount = record.seedSources.filter(
      (seedSource) => seedSource.active,
    ).length;

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
      missingEvidence.push(
        packLookupFailed
          ? "Current parish pack data is temporarily unavailable."
          : "No current parish pack found for this jurisdiction.",
      );
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
      officialDomains,
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
      select: jurisdictionBaseSelect,
      orderBy: { name: "asc" },
    });

    const jurisdictionIds = jurisdictions.map((jurisdiction) => jurisdiction.id);
    const officialDomainsByJurisdictionId = new Map<string, string[]>();

    if (jurisdictionIds.length > 0) {
      try {
        const officialDomainRows = await prisma.$queryRaw<OfficialDomainsRow[]>`
          SELECT
            id::text AS id,
            official_domains::text AS "officialDomainsRaw"
          FROM jurisdictions
          WHERE org_id = ${auth.orgId}::uuid
        `;

        for (const row of officialDomainRows) {
          const jurisdiction = jurisdictions.find((item) => item.id === row.id);
          if (!jurisdiction) {
            continue;
          }

          officialDomainsByJurisdictionId.set(
            row.id,
            normalizeOfficialDomains(row.officialDomainsRaw, {
              jurisdictionId: jurisdiction.id,
              jurisdictionName: jurisdiction.name,
            }),
          );
        }
      } catch (error) {
        console.warn("[jurisdictions] failed to load official domains", {
          orgId: auth.orgId,
          jurisdictionCount: jurisdictionIds.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let packLookupFailed = false;
    const latestPackByJurisdictionId = new Map<string, LatestPackRecord>();

    if (jurisdictionIds.length > 0) {
      try {
        const latestPacks = await prisma.parishPackVersion.findMany({
          where: {
            orgId: auth.orgId,
            status: "current",
            jurisdictionId: { in: jurisdictionIds },
          },
          orderBy: [{ jurisdictionId: "asc" }, { generatedAt: "desc" }],
          select: latestPackSelect,
        });

        for (const pack of latestPacks) {
          if (!latestPackByJurisdictionId.has(pack.jurisdictionId)) {
            latestPackByJurisdictionId.set(pack.jurisdictionId, pack);
          }
        }
      } catch (error) {
        packLookupFailed = true;
        console.warn("[jurisdictions] failed to load current parish packs", {
          orgId: auth.orgId,
          jurisdictionCount: jurisdictionIds.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result = jurisdictions.map((jurisdiction) =>
      buildJurisdictionResponse(
        jurisdiction,
        officialDomainsByJurisdictionId.get(jurisdiction.id) ?? [],
        latestPackByJurisdictionId.get(jurisdiction.id) ?? null,
        packLookupFailed,
      ),
    );

    return NextResponse.json({ jurisdictions: result });
  } catch (error) {
    console.error("Error fetching jurisdictions:", error);
    return NextResponse.json(
      { error: "Failed to fetch jurisdictions" },
      { status: 500 }
    );
  }
}
