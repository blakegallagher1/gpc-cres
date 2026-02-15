import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

type EvidenceFreshnessState = "fresh" | "aging" | "stale" | "critical" | "unknown";
type EvidenceDriftSignal = "stable" | "changed" | "insufficient";
type EvidenceAlertLevel = "none" | "warning" | "critical";

type EvidenceSnapshotRecord = {
  id: string;
  retrievedAt: Date;
  httpStatus: number;
  contentType: string;
  contentHash: string;
  runId: string;
  textExtractObjectKey: string | null;
};

type EvidenceFreshnessSignals = {
  freshnessScore: number;
  freshnessState: EvidenceFreshnessState;
  driftSignal: EvidenceDriftSignal;
  alertLevel: EvidenceAlertLevel;
  alertReasons: string[];
};

type EvidenceSourceRecord = {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  isOfficial: boolean;
  firstSeenAt: Date;
  _count: { evidenceSnapshots: number };
  evidenceSnapshots: EvidenceSnapshotRecord[];
};

function parseBoolean(value: string | null): boolean {
  return value === "true";
}

function parseLimit(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), 120));
}

function freshnessStateFromHours(hoursSinceCapture: number): EvidenceFreshnessState {
  if (Number.isNaN(hoursSinceCapture) || !Number.isFinite(hoursSinceCapture)) {
    return "unknown";
  }
  if (hoursSinceCapture <= 24) return "fresh";
  if (hoursSinceCapture <= 72) return "aging";
  if (hoursSinceCapture <= 168) return "stale";
  return "critical";
}

function freshnessScoreFromState(hoursSinceCapture: number, state: EvidenceFreshnessState): number {
  if (Number.isNaN(hoursSinceCapture) || !Number.isFinite(hoursSinceCapture)) return 0;
  if (state === "fresh") return 100;
  if (state === "aging") return 80;
  if (state === "stale") return 45;
  if (state === "critical") return 20;
  return 0;
}

function buildFreshnessSignals(
  latestSnapshot?: EvidenceSnapshotRecord | null,
  previousSnapshot?: EvidenceSnapshotRecord | null,
): EvidenceFreshnessSignals {
  if (!latestSnapshot) {
    return {
      freshnessScore: 0,
      freshnessState: "unknown",
      driftSignal: "insufficient",
      alertLevel: "critical",
      alertReasons: ["No evidence snapshots available for this source."],
    };
  }

  const nowMs = Date.now();
  const hoursSinceCapture = (nowMs - latestSnapshot.retrievedAt.getTime()) / (1000 * 60 * 60);
  const freshnessState = freshnessStateFromHours(hoursSinceCapture);
  const alertReasons: string[] = [];

  if (latestSnapshot.httpStatus >= 500) {
    alertReasons.push("Latest capture returned a server error.");
  } else if (latestSnapshot.httpStatus >= 400) {
    alertReasons.push("Latest capture returned a non-successful status.");
  }

  if (freshnessState === "critical") {
    alertReasons.push("Evidence source has become critically stale.");
  } else if (freshnessState === "stale") {
    alertReasons.push("Evidence source freshness is declining.");
  }

  const driftSignal: EvidenceDriftSignal =
    previousSnapshot == null
      ? "insufficient"
      : latestSnapshot.contentHash === previousSnapshot.contentHash
        ? "stable"
        : "changed";

  if (driftSignal === "changed") {
    alertReasons.push("Content hash drift detected from previous snapshot.");
  }

  const alertLevel: EvidenceAlertLevel =
    freshnessState === "critical" || latestSnapshot.httpStatus >= 500
      ? "critical"
      : alertReasons.length > 0
        ? "warning"
        : "none";

  return {
    freshnessScore: freshnessScoreFromState(hoursSinceCapture, freshnessState),
    freshnessState,
    driftSignal,
    alertLevel,
    alertReasons,
  };
}

// GET /api/evidence - list evidence sources
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const officialOnly = searchParams.get("official");
    const sourceId = searchParams.get("sourceId");
    const includeSnapshots = parseBoolean(searchParams.get("includeSnapshots")) && !!sourceId;
    const snapshotLimit = parseLimit(searchParams.get("snapshotLimit"), 25);

    const where: Record<string, unknown> = { orgId: auth.orgId };
    if (sourceId) where.id = sourceId;
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
          take: includeSnapshots ? snapshotLimit : 2,
          select: {
            id: true,
            retrievedAt: true,
            contentHash: true,
            runId: true,
            httpStatus: true,
            contentType: true,
            textExtractObjectKey: true,
          },
        },
      },
      orderBy: { firstSeenAt: "desc" },
    });

    const result = sources.map((s: EvidenceSourceRecord) => {
      const latestSnapshot = s.evidenceSnapshots[0] ?? null;
      const previousSnapshot = s.evidenceSnapshots[1] ?? null;
      const freshness = buildFreshnessSignals(latestSnapshot, previousSnapshot);

      return {
        id: s.id,
        url: s.url,
        domain: s.domain,
        title: s.title,
        isOfficial: s.isOfficial,
        firstSeenAt: s.firstSeenAt.toISOString(),
        snapshotCount: s._count.evidenceSnapshots,
        freshness,
        latestSnapshot: s.evidenceSnapshots[0]
          ? {
              id: s.evidenceSnapshots[0].id,
              retrievedAt: s.evidenceSnapshots[0].retrievedAt.toISOString(),
              contentHash: s.evidenceSnapshots[0].contentHash,
              runId: s.evidenceSnapshots[0].runId,
              httpStatus: s.evidenceSnapshots[0].httpStatus,
              contentType: s.evidenceSnapshots[0].contentType,
              hasTextExtract: Boolean(s.evidenceSnapshots[0].textExtractObjectKey),
            }
          : null,
        snapshots: includeSnapshots
          ? s.evidenceSnapshots.map((snapshot) => ({
              id: snapshot.id,
              retrievedAt: snapshot.retrievedAt.toISOString(),
              contentHash: snapshot.contentHash,
              runId: snapshot.runId,
              httpStatus: snapshot.httpStatus,
              contentType: snapshot.contentType,
              hasTextExtract: Boolean(snapshot.textExtractObjectKey),
            }))
          : undefined,
      };
    });

    return NextResponse.json({ sources: result });
  } catch (error) {
    console.error("Error fetching evidence sources:", error);
    return NextResponse.json(
      { error: "Failed to fetch evidence sources" },
      { status: 500 },
    );
  }
}
