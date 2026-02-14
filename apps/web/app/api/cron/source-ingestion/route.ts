import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { captureEvidence, withTimeout } from "@entitlement-os/evidence";
import { supabaseAdmin } from "@/lib/db/supabaseAdmin";
import { getNotificationService } from "@/lib/services/notification.service";
import {
  computeEvidenceHash,
  computeSourceCaptureManifestHash,
  dedupeEvidenceCitations,
} from "@entitlement-os/shared/evidence";

const EVIDENCE_BUCKET = "evidence";
const MAX_CAPTURE_RETRIES = 2;
const MAX_CAPTURE_TIMEOUT_MS = 45_000;
const CAPTURE_INTERVAL_DAYS = 7;
const QUALITY_LOOKBACK_DAYS = 14;
const STALE_ALERT_DAYS = 21;
const QUALITY_ALERT_THRESHOLD = 0.55;
const STALE_RATIO_ALERT_THRESHOLD = 0.4;
const SOURCE_CAPTURE_BUCKETS = {
  UNKNOWN: "never_captured",
  CRITICAL: "critical",
  STALE: "stale",
  AGING: "aging",
  FRESH: "fresh",
} as const;
const SOURCE_PURPOSE_DISCOVERED = "discovered";

type StaleSource = {
  url: string;
  jurisdictionName: string;
  purpose: string;
  stalenessDays: number | null;
  qualityScore: number;
  qualityBucket: string;
  rankScore: number;
  captureAttempts: number;
  captureError: string | null;
};

type SourceCaptureManifestEntry = {
  sourceUrl: string;
  jurisdictionId: string;
  jurisdictionName: string;
  purpose: string;
  isOfficial: boolean;
  discovered: boolean;
  stalenessDays: number | null;
  qualityScore: number;
  qualityBucket: string;
  rankScore: number;
  needsCapture: boolean;
  captureAttempts: number;
  captureSuccess: boolean;
  captureError: string | null;
  evidenceSourceId?: string;
  evidenceSnapshotId?: string;
  contentHash?: string;
};

type SourceCaptureAttempt = {
  attempts: number;
  captured: boolean;
  captureError: string | null;
  evidenceSourceId?: string;
  evidenceSnapshotId?: string;
  contentHash?: string;
  usedPlaywright?: boolean;
};

type OrgMembershipRecord = {
  userId: string;
};

type ParishPackRecord = {
  jurisdictionId: string;
  sourceUrls: unknown;
  jurisdiction: {
    id: string;
    orgId: string;
  } | null;
};

interface OrgState {
  runId: string;
  stats: {
    totalSources: number;
    captureAttempts: number;
    captureSuccesses: number;
    qualityBuckets: Record<string, number>;
    staleCount: number;
    totalQuality: number;
    qualityCount: number;
    staleSources: StaleSource[];
    errors: string[];
    sourceManifest: SourceCaptureManifestEntry[];
    discoveryCount: number;
    discoveryUrls: string[];
  };
}

function verifyCronSecret(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!header || header.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(header));
  } catch {
    return false;
  }
}

function daysSince(date?: Date | null): number | null {
  if (!date) return null;
  const diff = Date.now() - date.getTime();
  return Math.floor(diff / 86_400_000);
}

function computeQualityScore(stalenessDays: number | null): number {
  if (stalenessDays === null) return 0;
  const normalized = Math.min(stalenessDays, QUALITY_LOOKBACK_DAYS) / QUALITY_LOOKBACK_DAYS;
  return Math.max(0, 1 - normalized);
}

function computeQualityBucket(stalenessDays: number | null, qualityScore: number): string {
  if (stalenessDays === null) return SOURCE_CAPTURE_BUCKETS.UNKNOWN;
  if (qualityScore >= 0.8) return SOURCE_CAPTURE_BUCKETS.FRESH;
  if (qualityScore >= 0.55) return SOURCE_CAPTURE_BUCKETS.AGING;
  if (qualityScore >= 0.3) return SOURCE_CAPTURE_BUCKETS.STALE;
  return SOURCE_CAPTURE_BUCKETS.CRITICAL;
}

function computeSourceRankScore(params: {
  isOfficial: boolean;
  discovered: boolean;
  needsCapture: boolean;
  stalenessDays: number | null;
  qualityBucket: string;
}): number {
  const { qualityBucket } = params;
  const officialityScore = params.isOfficial ? 120 : 20;
  const discoveredScore = params.discovered ? 30 : 0;
  const captureScore = params.needsCapture ? 70 : 0;
  const staleDays = params.stalenessDays === null ? STALE_ALERT_DAYS + CAPTURE_INTERVAL_DAYS : params.stalenessDays;
  const stalenessScore = Math.min(staleDays, QUALITY_LOOKBACK_DAYS * 2) * 1.2;
  const bucketPenalty = {
    [SOURCE_CAPTURE_BUCKETS.UNKNOWN]: 8,
    [SOURCE_CAPTURE_BUCKETS.CRITICAL]: 0,
    [SOURCE_CAPTURE_BUCKETS.STALE]: 2,
    [SOURCE_CAPTURE_BUCKETS.AGING]: 4,
    [SOURCE_CAPTURE_BUCKETS.FRESH]: 8,
  }[qualityBucket] ?? 0;
  return officialityScore + discoveredScore + captureScore + stalenessScore + bucketPenalty;
}

function isOfficialSource(url: string, officialDomains: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return officialDomains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureSourceWithRetry(params: {
  url: string;
  orgId: string;
  runId: string;
  label: string;
  officialDomains?: string[];
}): Promise<SourceCaptureAttempt> {
  let attempts = 0;
  let lastError: unknown;
  let result;

  for (let retryIndex = 1; retryIndex <= MAX_CAPTURE_RETRIES; retryIndex++) {
    attempts = retryIndex;
    try {
      result = await withTimeout(
        captureEvidence({
          url: params.url,
          orgId: params.orgId,
          runId: params.runId,
          prisma,
          supabase: supabaseAdmin,
          evidenceBucket: EVIDENCE_BUCKET,
          allowPlaywrightFallback: true,
          officialDomains: params.officialDomains ?? [],
        }),
        MAX_CAPTURE_TIMEOUT_MS,
        `${params.label} (attempt ${retryIndex}/${MAX_CAPTURE_RETRIES})`,
      );
      return {
        attempts,
        captured: true,
        captureError: null,
        evidenceSourceId: result.sourceId,
        evidenceSnapshotId: result.snapshotId,
        contentHash: result.contentHash,
        usedPlaywright: result.usedPlaywright,
      };
    } catch (error) {
      lastError = error;
      if (retryIndex < MAX_CAPTURE_RETRIES) {
        await sleepMs(250 * 2 ** (retryIndex - 1));
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown");
  return {
    attempts,
    captured: false,
    captureError: message,
  };
}

const recipientCache = new Map<string, string[]>();
async function getNotificationRecipients(orgId: string): Promise<string[]> {
  if (recipientCache.has(orgId)) {
    return recipientCache.get(orgId)!;
  }

  const owners = (await prisma.orgMembership.findMany({
    where: { orgId, role: { in: ["owner", "admin"] } },
    select: { userId: true },
  })) as OrgMembershipRecord[];

  const members = owners.length > 0
    ? owners.map((member: OrgMembershipRecord) => member.userId)
    : ((await prisma.orgMembership.findMany({
      where: { orgId },
      select: { userId: true },
    })) as OrgMembershipRecord[]).map((member: OrgMembershipRecord) => member.userId);

  const uniqueMembers = Array.from(new Set(members));
  recipientCache.set(orgId, uniqueMembers);
  return uniqueMembers;
}

async function discoverSources(initialSources: Array<{
  jurisdictionId: string;
  url: string;
}>): Promise<Array<{ orgId: string; jurisdictionId: string; url: string }>> {
  const existingKeys = new Set(initialSources.map((source) => `${source.jurisdictionId}|${source.url}`));
  const discovered: Array<{ orgId: string; jurisdictionId: string; url: string }> = [];

  const packs = (await prisma.parishPackVersion.findMany({
    where: { status: "current" },
    select: {
      jurisdictionId: true,
      sourceUrls: true,
      jurisdiction: {
        select: {
          id: true,
          orgId: true,
        },
      },
    },
  })) as ParishPackRecord[];

  for (const pack of packs) {
    if (!pack.jurisdiction) continue;

    const urls = Array.isArray(pack.sourceUrls)
      ? (pack.sourceUrls.filter((url): url is string => typeof url === "string"))
      : [];
    for (const candidate of urls) {
      const normalized = String(candidate ?? "").trim();
      if (!normalized) continue;

      const key = `${pack.jurisdictionId}|${normalized}`;
      if (existingKeys.has(key)) continue;

      try {
        await prisma.jurisdictionSeedSource.create({
          data: {
            jurisdictionId: pack.jurisdictionId,
            purpose: SOURCE_PURPOSE_DISCOVERED,
            url: normalized,
            active: true,
          },
        });
        existingKeys.add(key);
        discovered.push({
          orgId: pack.jurisdiction.orgId,
          jurisdictionId: pack.jurisdictionId,
          url: normalized,
        });
      } catch (error) {
        console.warn(`[source-ingestion] failed to discover ${normalized} — ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return discovered;
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const notificationService = getNotificationService();
    const initialSources = await prisma.jurisdictionSeedSource.findMany({
      where: { active: true },
      select: {
        jurisdictionId: true,
        url: true,
      },
    });

    const discoveries = await discoverSources(initialSources);
    const discoveryByOrg = new Map<string, { count: number; urls: string[] }>();
    for (const record of discoveries) {
      const bucket = discoveryByOrg.get(record.orgId) ?? { count: 0, urls: [] };
      bucket.count += 1;
      bucket.urls.push(record.url);
      discoveryByOrg.set(record.orgId, bucket);
    }

    const sources = await prisma.jurisdictionSeedSource.findMany({
      where: { active: true },
      include: {
        jurisdiction: {
          select: {
            id: true,
            name: true,
            orgId: true,
            officialDomains: true,
          },
        },
      },
    });

    if (sources.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No active sources to ingest",
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startTime,
      });
    }

    const discoveredSourceLookup = new Set(
      discoveries.map((record) => `${record.jurisdictionId}|${record.url}`),
    );
    const sourcePlan: Array<{
      source: (typeof sources)[number];
      jurisdictionName: string;
      stalenessDays: number | null;
      qualityScore: number;
      qualityBucket: string;
      isOfficial: boolean;
      needsCapture: boolean;
      discovered: boolean;
      rankScore: number;
    }> = [];

    for (const source of sources) {
      if (!source.jurisdiction) continue;
      const latestSnapshot = await prisma.evidenceSnapshot.findFirst({
        where: {
          evidenceSource: {
            url: source.url,
            orgId: source.jurisdiction.orgId,
          },
        },
        orderBy: { retrievedAt: "desc" },
        select: { retrievedAt: true },
      });

      const stalenessDays = daysSince(latestSnapshot?.retrievedAt);
      const qualityScore = computeQualityScore(stalenessDays);
      const qualityBucket = computeQualityBucket(stalenessDays, qualityScore);
      const isOfficial = isOfficialSource(source.url, source.jurisdiction.officialDomains);
      const needsCapture = !latestSnapshot || stalenessDays === null || stalenessDays >= CAPTURE_INTERVAL_DAYS;
      const discovered = discoveredSourceLookup.has(`${source.jurisdictionId}|${source.url}`);
      const rankScore = computeSourceRankScore({
        isOfficial,
        discovered,
        needsCapture,
        stalenessDays,
        qualityBucket,
      });

      sourcePlan.push({
        source,
        jurisdictionName: source.jurisdiction.name,
        stalenessDays,
        qualityScore,
        qualityBucket,
        isOfficial,
        needsCapture,
        discovered,
        rankScore,
      });
    }

    const rankedSources = sourcePlan
      .slice()
      .sort((a, b) => b.rankScore - a.rankScore);
    const orgStates = new Map<string, OrgState>();

    for (const entry of rankedSources) {
      const source = entry.source;
      const jurisdiction = source.jurisdiction;
      if (!jurisdiction) continue;
      const orgId = jurisdiction.orgId;

      let orgState = orgStates.get(orgId);
      if (!orgState) {
        const discoveryInfo = discoveryByOrg.get(orgId);
        const run = await prisma.run.create({
          data: {
            orgId,
            runType: "SOURCE_INGEST",
            status: "running",
          },
        });
        orgState = {
          runId: run.id,
          stats: {
            totalSources: 0,
            captureAttempts: 0,
            captureSuccesses: 0,
            qualityCount: 0,
            totalQuality: 0,
            qualityBuckets: {
              [SOURCE_CAPTURE_BUCKETS.UNKNOWN]: 0,
              [SOURCE_CAPTURE_BUCKETS.CRITICAL]: 0,
              [SOURCE_CAPTURE_BUCKETS.STALE]: 0,
              [SOURCE_CAPTURE_BUCKETS.AGING]: 0,
              [SOURCE_CAPTURE_BUCKETS.FRESH]: 0,
            },
            staleCount: 0,
            staleSources: [],
            errors: [],
            sourceManifest: [],
            discoveryCount: discoveryInfo?.count ?? 0,
            discoveryUrls: discoveryInfo?.urls ?? [],
          },
        };
        orgStates.set(orgId, orgState);
      }

      const stats = orgState.stats;
      const label = `${jurisdiction.name}: ${source.url}`;
      let finalStalenessDays = entry.stalenessDays;
      let finalQualityScore = entry.qualityScore;

      const captureResult = entry.needsCapture
        ? await captureSourceWithRetry({
            url: source.url,
            orgId,
            runId: orgState.runId,
            label,
            officialDomains: source.jurisdiction.officialDomains,
          })
        : {
            attempts: 0,
            captured: false,
            captureError: "skipped: within freshness threshold",
          };

      if (captureResult.captured) {
        finalStalenessDays = 0;
        finalQualityScore = 1;
        stats.captureSuccesses += 1;
      } else if (entry.needsCapture) {
        const msg = captureResult.captureError ?? "Unknown capture failure";
        stats.errors.push(`${label}: ${msg}`);
      }

      const finalQualityBucket = computeQualityBucket(
        finalStalenessDays,
        finalQualityScore,
      );
      stats.captureAttempts += captureResult.attempts;
      stats.qualityBuckets[finalQualityBucket] =
        (stats.qualityBuckets[finalQualityBucket] ?? 0) + 1;

      const manifestEntry: SourceCaptureManifestEntry = {
        sourceUrl: source.url,
        jurisdictionId: jurisdiction.id,
        jurisdictionName: entry.jurisdictionName,
        purpose: source.purpose,
        isOfficial: entry.isOfficial,
        discovered: entry.discovered,
        stalenessDays: finalStalenessDays,
        qualityScore: finalQualityScore,
        qualityBucket: finalQualityBucket,
        rankScore: entry.rankScore,
        needsCapture: entry.needsCapture,
        captureAttempts: captureResult.attempts,
        captureSuccess: captureResult.captured,
        captureError: captureResult.captured ? null : captureResult.captureError,
        evidenceSourceId: captureResult.evidenceSourceId,
        evidenceSnapshotId: captureResult.evidenceSnapshotId,
        contentHash: captureResult.contentHash,
      };

      stats.totalSources += 1;
      stats.totalQuality += finalQualityScore;
      stats.qualityCount += 1;
      stats.sourceManifest.push(manifestEntry);

      const isStale =
        finalStalenessDays === null ||
        finalStalenessDays >= STALE_ALERT_DAYS ||
        finalQualityBucket === SOURCE_CAPTURE_BUCKETS.CRITICAL ||
        finalQualityScore < QUALITY_ALERT_THRESHOLD;
      if (isStale) {
        stats.staleCount += 1;
        stats.staleSources.push({
          url: source.url,
          jurisdictionName: jurisdiction.name,
          qualityBucket: finalQualityBucket,
          rankScore: entry.rankScore,
          purpose: source.purpose,
          stalenessDays: finalStalenessDays,
          qualityScore: finalQualityScore,
          captureAttempts: captureResult.attempts,
          captureError: captureResult.captureError,
        });
      }
    }

    const orgSummaries: Array<{
      orgId: string;
      runId: string;
      staleRatio: number;
      staleSources: StaleSource[];
      totalSources: number;
      staleCount: number;
      discovery: { count: number; urls: string[] };
    }> = [];
    let totalStale = 0;
    let totalDiscovery = discoveries.length;
    let totalSources = 0;

    for (const [orgId, state] of orgStates) {
      const stats = state.stats;
      const averageQualityScore =
        stats.qualityCount > 0 ? stats.totalQuality / stats.qualityCount : null;
      const staleRatio =
        stats.totalSources > 0 ? stats.staleCount / stats.totalSources : 0;
      const evidenceCitations = dedupeEvidenceCitations(
        stats.sourceManifest
          .filter((entry) => entry.captureSuccess)
          .map((entry) => ({
            tool: "evidence_snapshot",
            sourceId: entry.evidenceSourceId,
            snapshotId: entry.evidenceSnapshotId,
            contentHash: entry.contentHash,
            url: entry.sourceUrl,
            isOfficial: entry.isOfficial,
          })),
      );
      const evidenceHash = computeEvidenceHash(evidenceCitations);
      const captureFailure = stats.errors.length > 0;
      const status = captureFailure ? "failed" : "succeeded";
      const sourceManifestHash = computeSourceCaptureManifestHash(stats.sourceManifest);

      await prisma.run.update({
        where: { id: state.runId },
        data: {
          status,
          finishedAt: new Date(),
          outputJson: {
            runState: {
              status,
              runId: state.runId,
              partialOutput: JSON.stringify({
                totalSources: stats.totalSources,
                captureAttempts: stats.captureAttempts,
                captureSuccesses: stats.captureSuccesses,
                staleSources: stats.staleSources,
                staleRatio,
              }),
              lastUpdatedAt: new Date().toISOString(),
              runStartedAt: new Date().toISOString(),
              runInputHash: null,
              correlationId: "source-ingestion",
              qualityBuckets: stats.qualityBuckets,
            },
            totalSources: stats.totalSources,
            captureAttempts: stats.captureAttempts,
            captureSuccesses: stats.captureSuccesses,
            averageQualityScore,
            staleRatio,
            qualityBuckets: stats.qualityBuckets,
            staleSources: stats.staleSources,
            discoveryCount: stats.discoveryCount,
            discoveryUrls: stats.discoveryUrls,
            errors: stats.errors,
            stalenessThresholdDays: STALE_ALERT_DAYS,
            qualityLookbackDays: QUALITY_LOOKBACK_DAYS,
            staleRatioThreshold: STALE_RATIO_ALERT_THRESHOLD,
            qualityAlertThreshold: QUALITY_ALERT_THRESHOLD,
            sourceManifest: stats.sourceManifest,
            sourceManifestHash,
            evidenceCitations,
            evidenceHash,
          },
        },
      });

      totalSources += stats.totalSources;
      totalStale += stats.staleSources.length;
      orgSummaries.push({
        orgId,
        runId: state.runId,
        staleRatio,
        staleSources: stats.staleSources,
        totalSources: stats.totalSources,
        staleCount: stats.staleCount,
        discovery: {
          count: stats.discoveryCount,
          urls: stats.discoveryUrls,
        },
      });
    }

    for (const summary of orgSummaries) {
      const shouldAlert = summary.staleRatio >= STALE_RATIO_ALERT_THRESHOLD;
      if (!shouldAlert || summary.staleSources.length === 0) continue;

      const recipients = await getNotificationRecipients(summary.orgId);
      if (recipients.length === 0) continue;

      const highlighted = summary.staleSources.slice(0, 4);
      const bodyLines = [
        `Source ingestion found ${summary.staleSources.length} stale/weak-confidence seeds for this org (ratio ${(summary.staleRatio * 100).toFixed(1)}%).`,
        `Stale ratio threshold is ${(STALE_RATIO_ALERT_THRESHOLD * 100).toFixed(0)}%.`,
        `Quality lookback window: ${QUALITY_LOOKBACK_DAYS} days.`,
        "Examples:",
        ...highlighted.map(
          (entry) =>
            `- ${entry.url} (${entry.jurisdictionName}: ${
              entry.stalenessDays === null
                ? "never refreshed"
                : `${entry.stalenessDays}d stale`
            }, quality ${entry.qualityScore.toFixed(2)}, bucket ${entry.qualityBucket})`
        ),
        "",
        "Please refresh these sources or add new seed URLs so downstream packs stay grounded.",
      ];

      const metadata = {
        runId: summary.runId,
        staleCount: summary.staleCount,
        staleRatio: summary.staleRatio,
      };

      await Promise.all(
        recipients.map((userId) =>
          notificationService.create({
            orgId: summary.orgId,
            userId,
            type: "ALERT",
            title: "Source ingestion: stale seed sources detected",
            body: bodyLines.join("\n"),
            priority: "HIGH",
            actionUrl: "/jurisdictions",
            sourceAgent: "source-ingestion",
            metadata,
          })
        )
      );
    }

    const summary = {
      ok: true,
      message: "Source ingestion run complete",
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startTime,
      stats: {
        orgsProcessed: orgStates.size,
        totalSources,
        staleSources: totalStale,
        discoveryCount: totalDiscovery,
        staleRatios: orgSummaries.map((item) => ({
          orgId: item.orgId,
          staleRatio: item.staleRatio,
        })),
      },
    };

    console.log("[source-ingestion] summary:", summary.stats);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[cron/source-ingestion] failed:", error);
    return NextResponse.json(
      {
        error: "Source ingestion failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
