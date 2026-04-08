import "server-only";

import { prisma } from "@entitlement-os/db";

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

type EvidenceSourceListParams = {
  orgId: string;
  search?: string | null;
  officialOnly?: boolean;
  sourceId?: string | null;
  includeSnapshots?: boolean;
  snapshotLimit: number;
};

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

export async function listEvidenceSources(params: EvidenceSourceListParams) {
  const where: Record<string, unknown> = { orgId: params.orgId };
  if (params.sourceId) where.id = params.sourceId;
  if (params.officialOnly) where.isOfficial = true;
  if (params.search) {
    where.OR = [
      { url: { contains: params.search, mode: "insensitive" } },
      { domain: { contains: params.search, mode: "insensitive" } },
      { title: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const sources = await prisma.evidenceSource.findMany({
    where,
    include: {
      _count: { select: { evidenceSnapshots: true } },
      evidenceSnapshots: {
        orderBy: { retrievedAt: "desc" },
        take: params.includeSnapshots ? params.snapshotLimit : 2,
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

  return sources.map((source: EvidenceSourceRecord) => {
    const latestSnapshot = source.evidenceSnapshots[0] ?? null;
    const previousSnapshot = source.evidenceSnapshots[1] ?? null;
    const freshness = buildFreshnessSignals(latestSnapshot, previousSnapshot);

    return {
      id: source.id,
      url: source.url,
      domain: source.domain,
      title: source.title,
      isOfficial: source.isOfficial,
      firstSeenAt: source.firstSeenAt.toISOString(),
      snapshotCount: source._count.evidenceSnapshots,
      freshness,
      latestSnapshot: latestSnapshot
        ? {
            id: latestSnapshot.id,
            retrievedAt: latestSnapshot.retrievedAt.toISOString(),
            contentHash: latestSnapshot.contentHash,
            runId: latestSnapshot.runId,
            httpStatus: latestSnapshot.httpStatus,
            contentType: latestSnapshot.contentType,
            hasTextExtract: Boolean(latestSnapshot.textExtractObjectKey),
          }
        : null,
      snapshots: params.includeSnapshots
        ? source.evidenceSnapshots.map((snapshot) => ({
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
}
