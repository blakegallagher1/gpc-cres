import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { captureEvidence, withRetry, withTimeout } from "@entitlement-os/evidence";
import { supabaseAdmin } from "@/lib/db/supabaseAdmin";
import { getNotificationService } from "@/lib/services/notification.service";

const EVIDENCE_BUCKET = "evidence";
const MAX_CAPTURE_RETRIES = 2;
const MAX_CAPTURE_TIMEOUT_MS = 45_000;
const CAPTURE_INTERVAL_DAYS = 7;
const QUALITY_LOOKBACK_DAYS = 14;
const STALE_ALERT_DAYS = 21;
const QUALITY_ALERT_THRESHOLD = 0.55;
const SOURCE_PURPOSE_DISCOVERED = "discovered";

type StaleSource = {
  url: string;
  jurisdictionName: string;
  purpose: string;
  stalenessDays: number | null;
  qualityScore: number;
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
    qualityTotal: number;
    qualityCount: number;
    staleSources: StaleSource[];
    errors: string[];
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

    const orgStates = new Map<string, OrgState>();

    for (const source of sources) {
      const jurisdiction = source.jurisdiction;
      if (!jurisdiction) continue;
      const orgId = jurisdiction.orgId;
      let orgState = orgStates.get(orgId);

      if (!orgState) {
        const run = await prisma.run.create({
          data: {
            orgId,
            runType: "SOURCE_INGEST",
            status: "running",
          },
        });
        const discoveryInfo = discoveryByOrg.get(orgId);
        orgState = {
          runId: run.id,
          stats: {
            totalSources: 0,
            captureAttempts: 0,
            captureSuccesses: 0,
            qualityTotal: 0,
            qualityCount: 0,
            staleSources: [],
            errors: [],
            discoveryCount: discoveryInfo?.count ?? 0,
            discoveryUrls: discoveryInfo?.urls ?? [],
          },
        };
        orgStates.set(orgId, orgState);
      }

      const stats = orgState.stats;
      const label = `${jurisdiction.name}: ${source.url}`;
      let latestSnapshot = await prisma.evidenceSnapshot.findFirst({
        where: {
          evidenceSource: {
            url: source.url,
            orgId,
          },
        },
        orderBy: { retrievedAt: "desc" },
        select: {
          retrievedAt: true,
        },
      });

      let stalenessDays = daysSince(latestSnapshot?.retrievedAt);
      let qualityScore = computeQualityScore(stalenessDays);

      const needsCapture = !latestSnapshot || stalenessDays === null || stalenessDays >= CAPTURE_INTERVAL_DAYS;
      if (needsCapture) {
        stats.captureAttempts++;
        try {
          await withRetry(
            () =>
              withTimeout(
                captureEvidence({
                  url: source.url,
                  orgId,
                  runId: orgState.runId,
                  prisma,
                  supabase: supabaseAdmin,
                  evidenceBucket: EVIDENCE_BUCKET,
                  allowPlaywrightFallback: true,
                  officialDomains: jurisdiction.officialDomains,
                }),
                MAX_CAPTURE_TIMEOUT_MS,
                label
              ),
            MAX_CAPTURE_RETRIES,
            label
          );
          stats.captureSuccesses++;
          stalenessDays = 0;
          qualityScore = 1;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          stats.errors.push(`${label}: ${msg}`);
        }
      }

      stats.totalSources++;
      stats.qualityTotal += qualityScore;
      stats.qualityCount++;

      if (
        stalenessDays === null
        || stalenessDays >= STALE_ALERT_DAYS
        || qualityScore < QUALITY_ALERT_THRESHOLD
      ) {
        stats.staleSources.push({
          url: source.url,
          jurisdictionName: jurisdiction.name,
          purpose: source.purpose,
          stalenessDays,
          qualityScore,
        });
      }
    }

    const orgSummaries: Array<{
      orgId: string;
      staleSources: StaleSource[];
      discovery: { count: number; urls: string[] };
    }> = [];
    let totalStale = 0;
    let totalDiscovery = discoveries.length;

    for (const [orgId, state] of orgStates) {
      const stats = state.stats;
      const avgQuality =
        stats.qualityCount > 0 ? stats.qualityTotal / stats.qualityCount : null;
      const isFailed = stats.errors.length > 0;

      await prisma.run.update({
        where: { id: state.runId },
        data: {
          status: isFailed ? "failed" : "succeeded",
          finishedAt: new Date(),
          outputJson: {
            totalSources: stats.totalSources,
            captureAttempts: stats.captureAttempts,
            captureSuccesses: stats.captureSuccesses,
            averageQualityScore: avgQuality,
            staleSources: stats.staleSources,
            discoveryCount: stats.discoveryCount,
            discoveryUrls: stats.discoveryUrls,
            errors: stats.errors,
            stalenessThresholdDays: STALE_ALERT_DAYS,
          },
        },
      });

      totalStale += stats.staleSources.length;
      orgSummaries.push({
        orgId,
        staleSources: stats.staleSources,
        discovery: {
          count: stats.discoveryCount,
          urls: stats.discoveryUrls,
        },
      });
    }

    for (const summary of orgSummaries) {
      if (summary.staleSources.length === 0) continue;

      const recipients = await getNotificationRecipients(summary.orgId);
      if (recipients.length === 0) continue;

      const highlighted = summary.staleSources.slice(0, 4);
      const bodyLines = [
        `Source ingestion found ${summary.staleSources.length} stale seeds (threshold ${STALE_ALERT_DAYS} days).`,
        "Examples:",
        ...highlighted.map(
          (entry) =>
            `- ${entry.url} (${entry.jurisdictionName}: ${
              entry.stalenessDays === null ? "never refreshed" : `${entry.stalenessDays}d stale`
            }, quality ${entry.qualityScore.toFixed(2)})`
        ),
        "",
        "Please refresh these sources or add new seed URLs so downstream packs stay grounded.",
      ];

      const metadata = {
        runId: orgStates.get(summary.orgId)?.runId,
        staleCount: summary.staleSources.length,
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
        totalSources: sources.length,
        staleSources: totalStale,
        discoveryCount: totalDiscovery,
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
