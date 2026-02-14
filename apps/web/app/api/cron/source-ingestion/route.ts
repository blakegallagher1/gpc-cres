import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { captureEvidence, withTimeout } from "@entitlement-os/evidence";
import { supabaseAdmin } from "@/lib/db/supabaseAdmin";
import {
  type NotificationPriority,
  getNotificationService,
} from "@/lib/services/notification.service";
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
const STALE_OFFENDER_ALERT_LIMIT = 6;
const SOURCE_INGEST_ALERT_TAG = "source-ingestion-stale-offender";
const SOURCE_INGEST_ALERT_DEFAULTS = {
  quietStartHour: 22,
  quietEndHour: 6,
  retryAttempts: 3,
  retryBaseMs: 250,
  dedupeWindowHours: 12,
  escalationStreak: 3,
} as const;

type SourceIngestionAlertConfig = {
  quietStartHour: number;
  quietEndHour: number;
  retryAttempts: number;
  retryBaseMs: number;
  dedupeWindowHours: number;
  escalationStreak: number;
};

type SourceIngestionAlertDecision = {
  shouldSend: boolean;
  escalationLevel: AlertEscalationLevel;
  reason: AlertDecisionReason;
  priorMatchCount: number;
  staleRatio: number | null;
  offenderSignature: string;
};

type SourceIngestionAlertCandidate = {
  orgId: string;
  runId: string;
  staleRatio: number;
  staleCount: number;
  staleOffenderCount: number;
  staleOffenders: StaleSourceOffender[];
  sourceManifestHash: string;
};

type SourceIngestionAlertNotificationRecord = {
  id: string;
  createdAt: Date;
  metadata: unknown;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

type SourceIngestionAlertMetadata = {
  alertTag: string;
  staleRatio: number;
  staleOffenderCount: number;
  staleSourceManifestHash: string;
  staleOffenderSamples?: StaleSourceOffender[];
  reason: AlertDecisionReason;
  escalationLevel: AlertEscalationLevel;
  priorMatchCount: number;
  offenderSignature: string;
  staleRatioThreshold?: number;
};

type SourceIngestionAlertNotificationMetadata = {
  sourceIngestAlertTag?: string;
  offenderSignature?: string;
  staleSourceManifestHash?: string;
  staleOffenderCount?: number;
};

type SourceIngestionAlertNotificationRecordEnvelope = {
  id: string;
  createdAt: Date;
  metadata: unknown;
};

type SourceIngestionAlertDecisionInput = {
  candidate: SourceIngestionAlertCandidate;
  now: Date;
  config: SourceIngestionAlertConfig;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuietHour(now: Date, config: SourceIngestionAlertConfig): boolean {
  const hour = now.getUTCHours();
  if (config.quietStartHour === config.quietEndHour) {
    return false;
  }
  if (config.quietStartHour < config.quietEndHour) {
    return hour >= config.quietStartHour && hour < config.quietEndHour;
  }
  return hour >= config.quietStartHour || hour < config.quietEndHour;
}

function trimSourceIngestionAlertSamples(
  offenders: StaleSourceOffender[],
  limit = STALE_OFFENDER_ALERT_LIMIT,
): StaleSourceOffender[] {
  return offenders
    .slice()
    .sort(sortByOffenderPriority)
    .slice(0, limit)
    .map((offender) => ({
      ...offender,
      alertReasons: offender.alertReasons.slice(0, 3),
    }));
}

function buildSourceIngestionAlertSignature(candidate: SourceIngestionAlertCandidate): string {
  const signaturePayload = {
    orgId: candidate.orgId,
    staleRatio: Math.round(candidate.staleRatio * 10_000) / 10_000,
    staleOffenderCount: candidate.staleOffenderCount,
    staleSourceManifestHash: candidate.sourceManifestHash,
    staleOffenders: trimSourceIngestionAlertSamples(candidate.staleOffenders),
  };
  const serialized = JSON.stringify(signaturePayload);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

function parseSourceIngestionAlertMetadata(
  value: unknown,
): SourceIngestionAlertMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const staleSourceManifestHash = typeof value.staleSourceManifestHash === "string"
    ? value.staleSourceManifestHash
    : null;
  const offenderSignature = typeof value.offenderSignature === "string"
    ? value.offenderSignature
    : null;
  const staleOffenderCount = toNumber(value.staleOffenderCount);
  const staleRatio = toNumber(value.staleRatio);

  if (staleSourceManifestHash === null || offenderSignature === null) {
    return null;
  }

  return {
    alertTag: typeof value.sourceIngestAlertTag === "string"
      ? value.sourceIngestAlertTag
      : SOURCE_INGEST_ALERT_TAG,
    staleOffenderCount: Number.isFinite(staleOffenderCount)
      ? staleOffenderCount
      : 0,
    staleSourceManifestHash,
    staleRatio: Number.isFinite(staleRatio) ? staleRatio : 0,
    offenderSignature,
    reason:
      value.reason === "not-alert" ||
      value.reason === "quiet-hours" ||
      value.reason === "escalation" ||
      value.reason === "suppressed-duplicate" ||
      value.reason === "send-now"
        ? value.reason
        : "not-alert",
    escalationLevel:
      value.escalationLevel === "critical" ? "critical" : "normal",
    priorMatchCount: Number.isFinite(toNumber(value.priorMatchCount))
      ? toNumber(value.priorMatchCount)
      : 0,
  };
}

function buildSourceIngestionAlertNotificationMetadata(
  input: SourceIngestionAlertMetadata,
): SourceIngestionAlertNotificationMetadata {
  return {
    sourceIngestAlertTag: input.alertTag,
    offenderSignature: input.offenderSignature,
    staleSourceManifestHash: input.staleSourceManifestHash,
    staleOffenderCount: input.staleOffenderCount,
  };
}

function buildSourceIngestionAlertBodyLines(params: {
  totalStaleSources: number;
  staleRatio: number;
  prioritizedOffenders: StaleSourceOffender[];
  examples: StaleSource[];
  staleRatioThreshold: number;
}): string[] {
  return [
    `Source ingestion found ${params.totalStaleSources} stale/weak-confidence seeds for this org (ratio ${(params.staleRatio * 100).toFixed(1)}%).`,
    `Stale ratio threshold is ${(params.staleRatioThreshold * 100).toFixed(0)}%.`,
    `Quality lookback window: ${QUALITY_LOOKBACK_DAYS} days.`,
    `Top prioritized stale offenders (${params.totalStaleSources} total, ${params.prioritizedOffenders.length} shown):`,
    ...params.prioritizedOffenders.map((entry) => `- ${formatOffenderLine(entry)}`),
    "Examples:",
    ...params.examples.map(
      (entry) =>
        `- ${entry.url} (${entry.jurisdictionName}: ${
          entry.stalenessDays === null
            ? "never refreshed"
            : `${entry.stalenessDays}d stale`
        }, quality ${entry.qualityScore.toFixed(2)}, bucket ${entry.qualityBucket})`,
    ),
    "",
    "Please refresh these sources or add new seed URLs so downstream packs stay grounded.",
  ];
}

function buildSourceIngestionAlertMetadataRecord(
  candidate: SourceIngestionAlertCandidate,
  decision: SourceIngestionAlertDecision,
): SourceIngestionAlertMetadata {
  return {
    alertTag: SOURCE_INGEST_ALERT_TAG,
    staleRatio: candidate.staleRatio,
    staleOffenderCount: candidate.staleOffenderCount,
    staleSourceManifestHash: candidate.sourceManifestHash,
    staleOffenderSamples: candidate.staleOffenders,
    reason: decision.reason,
    escalationLevel: decision.escalationLevel,
    priorMatchCount: decision.priorMatchCount,
    offenderSignature: decision.offenderSignature,
    staleRatioThreshold: STALE_RATIO_ALERT_THRESHOLD,
  };
}

async function getRecentSourceIngestionAlertRecords(
  orgId: string,
  cutoff: Date,
): Promise<SourceIngestionAlertNotificationRecordEnvelope[]> {
  return prisma.notification.findMany({
    where: {
      orgId,
      type: "ALERT",
      sourceAgent: "source-ingestion",
      createdAt: { gte: cutoff },
      metadata: {
        path: ["sourceIngestAlertTag"],
        equals: SOURCE_INGEST_ALERT_TAG,
      },
    },
    select: {
      id: true,
      createdAt: true,
      metadata: true,
    },
    orderBy: { createdAt: "desc" },
  }) as Promise<SourceIngestionAlertNotificationRecordEnvelope[]>;
}

async function getSourceIngestionAlertDecision(
  input: SourceIngestionAlertDecisionInput,
): Promise<SourceIngestionAlertDecision> {
  const { candidate, now, config } = input;
  const staleRatio = candidate.staleRatio;
  const isQuiet = isQuietHour(now, config);
  if (staleRatio < STALE_RATIO_ALERT_THRESHOLD || candidate.staleOffenderCount <= 0) {
    return {
      shouldSend: false,
      escalationLevel: "normal",
      reason: "not-alert",
      priorMatchCount: 0,
      staleRatio,
      offenderSignature: "",
    };
  }

  const offenderSignature = buildSourceIngestionAlertSignature(candidate);
  const cutoff = new Date(
    now.getTime() - config.dedupeWindowHours * 3_600_000,
  );
  const recentAlerts = await getRecentSourceIngestionAlertRecords(
    candidate.orgId,
    cutoff,
  );
  const priorMatchCount = recentAlerts.filter((record) => {
    const metadata = parseSourceIngestionAlertMetadata(record.metadata);
    if (!metadata) return false;
    return (
      metadata.offenderSignature === offenderSignature
      || metadata.staleSourceManifestHash === candidate.sourceManifestHash
    );
  }).length;

  const escalationThreshold = Math.max(config.escalationStreak - 1, 0);
  if (priorMatchCount >= escalationThreshold && priorMatchCount > 0) {
    return {
      shouldSend: true,
      escalationLevel: "critical",
      reason: "escalation",
      priorMatchCount,
      staleRatio,
      offenderSignature,
    };
  }

  if (isQuiet) {
    return {
      shouldSend: false,
      escalationLevel: "normal",
      reason: "quiet-hours",
      priorMatchCount,
      staleRatio,
      offenderSignature,
    };
  }

  if (priorMatchCount > 0) {
    return {
      shouldSend: false,
      escalationLevel: "normal",
      reason: "suppressed-duplicate",
      priorMatchCount,
      staleRatio,
      offenderSignature,
    };
  }

  return {
    shouldSend: true,
    escalationLevel: "normal",
    reason: "send-now",
    priorMatchCount: 0,
    staleRatio,
    offenderSignature,
  };
}

async function sendSourceIngestionAlertBatch(params: {
  orgId: string;
  recipients: string[];
  summary: SourceIngestionAlertCandidate;
  notificationMetadata: SourceIngestionAlertMetadata;
  staleRatioThreshold: number;
  prioritizedOffenders: StaleSourceOffender[];
  examples: StaleSource[];
  decision: SourceIngestionAlertDecision;
  config: SourceIngestionAlertConfig;
}) {
  const {
    orgId,
    recipients,
    summary,
    notificationMetadata,
    staleRatioThreshold,
    prioritizedOffenders,
    examples,
    decision,
    config,
  } = params;

  if (recipients.length === 0) {
    return;
  }

  const title = decision.escalationLevel === "critical"
    ? "Source ingestion: repeated stale-offender pattern detected"
    : "Source ingestion: stale seed sources detected";
  const bodyLines = buildSourceIngestionAlertBodyLines({
    totalStaleSources: summary.staleCount,
    staleRatio: summary.staleRatio,
    prioritizedOffenders,
    examples,
    staleRatioThreshold,
  });
  const priority: NotificationPriority =
    decision.escalationLevel === "critical" ? "CRITICAL" : "HIGH";

  const notifications = recipients.map((userId) => ({
    orgId,
    userId,
    type: "ALERT" as const,
    title,
    body: bodyLines.join("\n"),
    priority,
    actionUrl: "/jurisdictions",
    sourceAgent: "source-ingestion",
    metadata: buildSourceIngestionAlertNotificationMetadata(notificationMetadata),
  }));

  const operation = () =>
    getNotificationService().createBatch(notifications);

  let lastError: unknown;
  for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= config.retryAttempts) {
        break;
      }
      const delay = config.retryBaseMs * 2 ** (attempt - 1);
      await sleepMs(delay);
    }
  }

  throw lastError;
}

function parseIntEnvValue(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function getSourceIngestionAlertConfig(): SourceIngestionAlertConfig {
  return {
    quietStartHour: parseIntEnvValue(
      process.env.SOURCE_INGEST_ALERT_QUIET_START_HOUR,
      SOURCE_INGEST_ALERT_DEFAULTS.quietStartHour,
      0,
      23,
    ),
    quietEndHour: parseIntEnvValue(
      process.env.SOURCE_INGEST_ALERT_QUIET_END_HOUR,
      SOURCE_INGEST_ALERT_DEFAULTS.quietEndHour,
      0,
      23,
    ),
    retryAttempts: Math.max(
      1,
      parseIntEnvValue(
        process.env.SOURCE_INGEST_STALE_ALERT_RETRY_ATTEMPTS,
        SOURCE_INGEST_ALERT_DEFAULTS.retryAttempts,
        1,
        16,
      ),
    ),
    retryBaseMs: Math.max(
      25,
      parseIntEnvValue(
        process.env.SOURCE_INGEST_STALE_ALERT_RETRY_BASE_MS,
        SOURCE_INGEST_ALERT_DEFAULTS.retryBaseMs,
        25,
        30_000,
      ),
    ),
    dedupeWindowHours: Math.max(
      1,
      parseIntEnvValue(
        process.env.SOURCE_INGEST_STALE_OFFENDER_DEDUPE_WINDOW_HOURS,
        SOURCE_INGEST_ALERT_DEFAULTS.dedupeWindowHours,
        1,
        7 * 24,
      ),
    ),
    escalationStreak: Math.max(
      2,
      parseIntEnvValue(
        process.env.SOURCE_INGEST_STALE_OFFENDER_ESCALATION_STREAK,
        SOURCE_INGEST_ALERT_DEFAULTS.escalationStreak,
        2,
        20,
      ),
    ),
  };
}

type AlertDecisionReason =
  | "not-alert"
  | "quiet-hours"
  | "escalation"
  | "suppressed-duplicate"
  | "send-now";

type AlertEscalationLevel = "normal" | "critical";
const SOURCE_CAPTURE_BUCKETS = {
  UNKNOWN: "never_captured",
  CRITICAL: "critical",
  STALE: "stale",
  AGING: "aging",
  FRESH: "fresh",
} as const;
const SOURCE_PURPOSE_DISCOVERED = "discovered";

type StaleOffenderPriority = "critical" | "warning";

type StaleSourceOffender = {
  url: string;
  jurisdictionId: string;
  jurisdictionName: string;
  purpose: string;
  stalenessDays: number | null;
  qualityScore: number;
  qualityBucket: string;
  rankScore: number;
  captureAttempts: number;
  captureError: string | null;
  isOfficial: boolean;
  discovered: boolean;
  evidenceSourceId: string | null;
  evidenceSnapshotId: string | null;
  contentHash: string | null;
  captureSuccess: boolean;
  alertReasons: string[];
  priority: StaleOffenderPriority;
  priorityWeight: number;
};

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
    staleSourceOffenders: StaleSourceOffender[];
    errors: string[];
    sourceManifest: SourceCaptureManifestEntry[];
    discoveryCount: number;
    discoveryUrls: string[];
  };
}

function buildOffenderPriority(entry: SourceCaptureManifestEntry): {
  priority: StaleOffenderPriority;
  priorityWeight: number;
  alertReasons: string[];
} {
  const alertReasons: string[] = [];
  let priority: StaleOffenderPriority = "warning";
  let priorityWeight = entry.rankScore;

  if (!entry.captureSuccess) {
    priority = "critical";
    priorityWeight += 12_000;
    alertReasons.push("Capture failed after retries.");
  }

  if (entry.stalenessDays === null) {
    priority = "critical";
    priorityWeight += 9_000;
    alertReasons.push("No successful snapshot exists yet.");
  } else if (entry.stalenessDays >= STALE_ALERT_DAYS) {
    priority = "critical";
    priorityWeight += Math.min(entry.stalenessDays * 80, 8_000);
    alertReasons.push(`Source is ${entry.stalenessDays} days stale.`);
  }

  if (entry.qualityBucket === SOURCE_CAPTURE_BUCKETS.CRITICAL) {
    priority = "critical";
    priorityWeight += 4_000;
    alertReasons.push("Evidence quality is in critical bucket.");
  } else if (
    entry.qualityBucket === SOURCE_CAPTURE_BUCKETS.STALE &&
    priority !== "critical"
  ) {
    alertReasons.push("Evidence quality is stale.");
    priorityWeight += 1_000;
  }

  if (entry.qualityScore < QUALITY_ALERT_THRESHOLD) {
    priority = "critical";
    priorityWeight += 1_500;
    alertReasons.push(`Freshness score ${entry.qualityScore.toFixed(2)} below alert threshold.`);
  }

  if (!entry.captureSuccess && entry.captureError) {
    alertReasons.push(entry.captureError);
  }

  return {
    priority,
    priorityWeight,
    alertReasons: Array.from(new Set(alertReasons)),
  };
}

function sortByOffenderPriority(
  a: StaleSourceOffender,
  b: StaleSourceOffender,
): number {
  if (a.priority !== b.priority) {
    return a.priority === "critical" ? -1 : 1;
  }

  return (
    b.priorityWeight - a.priorityWeight ||
    b.rankScore - a.rankScore ||
    b.captureAttempts - a.captureAttempts ||
    a.url.localeCompare(b.url)
  );
}

function formatOffenderLine(
  entry: StaleSourceOffender,
): string {
  const stalenessText = entry.stalenessDays === null
    ? "never captured"
    : `${entry.stalenessDays}d stale`;
  const statusText = `${entry.priority} score ${Math.round(entry.qualityScore * 100)} (${entry.qualityBucket})`;
  const reasons = entry.alertReasons.length > 0
    ? ` - ${entry.alertReasons.join(", ")}`
    : "";
  return `${entry.url} (${entry.jurisdictionName}) [${statusText}], ${stalenessText}, rank ${entry.rankScore}${reasons}`;
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
    const alertDecisionConfig = getSourceIngestionAlertConfig();
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
            staleSourceOffenders: [],
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

        const { priority, priorityWeight, alertReasons } = buildOffenderPriority(manifestEntry);
        const staleSourceOffender: StaleSourceOffender = {
          url: source.url,
          jurisdictionId: jurisdiction.id,
          jurisdictionName: entry.jurisdictionName,
          purpose: source.purpose,
          stalenessDays: finalStalenessDays,
          qualityScore: finalQualityScore,
          qualityBucket: finalQualityBucket,
          rankScore: entry.rankScore,
          captureAttempts: captureResult.attempts,
          captureError: captureResult.captured ? null : captureResult.captureError,
          isOfficial: entry.isOfficial,
          discovered: entry.discovered,
          evidenceSourceId: captureResult.evidenceSourceId ?? null,
          evidenceSnapshotId: captureResult.evidenceSnapshotId ?? null,
          contentHash: captureResult.contentHash ?? null,
          captureSuccess: captureResult.captured,
          alertReasons,
          priority,
          priorityWeight,
        };
        stats.staleSourceOffenders.push(staleSourceOffender);
      }
    }

    const orgSummaries: Array<{
      orgId: string;
      runId: string;
      staleRatio: number;
      staleSources: StaleSource[];
      staleOffenders: StaleSourceOffender[];
      staleOffenderCount: number;
      sourceManifestHash: string;
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
      const prioritizedStaleOffenders = [...stats.staleSourceOffenders].sort(
        sortByOffenderPriority
      );
      const staleOffenderPayload = prioritizedStaleOffenders.slice(
        0,
        STALE_OFFENDER_ALERT_LIMIT,
      );
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
            staleSourceOffenders: staleOffenderPayload,
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
        staleOffenders: staleOffenderPayload,
        staleOffenderCount: stats.staleSourceOffenders.length,
        sourceManifestHash,
        totalSources: stats.totalSources,
        staleCount: stats.staleCount,
        discovery: {
          count: stats.discoveryCount,
          urls: stats.discoveryUrls,
        },
      });
    }

    for (const summary of orgSummaries) {
      const candidate: SourceIngestionAlertCandidate = {
        orgId: summary.orgId,
        runId: summary.runId,
        staleRatio: summary.staleRatio,
        staleCount: summary.staleCount,
        staleOffenderCount: summary.staleOffenderCount,
        staleOffenders: summary.staleOffenders,
        sourceManifestHash: summary.sourceManifestHash,
      };
      const decision = await getSourceIngestionAlertDecision({
        candidate,
        now: new Date(),
        config: alertDecisionConfig,
      });
      if (!decision.shouldSend) {
        console.log(
          `[source-ingestion] alert suppressed for ${summary.orgId}: reason=${decision.reason}, prior=${decision.priorMatchCount}, manifest=${summary.sourceManifestHash}`,
        );
        continue;
      }

      const recipients = await getNotificationRecipients(summary.orgId);
      if (recipients.length === 0) continue;

      const highlighted = summary.staleSources.slice(0, 4);
      const prioritizedHighlights: StaleSourceOffender[] =
        summary.staleOffenders.length > 0
          ? summary.staleOffenders.slice(0, 4)
          : highlighted.map((entry) => ({
              url: entry.url,
              jurisdictionId: "",
              jurisdictionName: entry.jurisdictionName,
              purpose: entry.purpose,
              stalenessDays: entry.stalenessDays,
              qualityScore: entry.qualityScore,
              qualityBucket: entry.qualityBucket,
              rankScore: entry.rankScore,
              captureAttempts: entry.captureAttempts,
              captureError: entry.captureError,
              isOfficial: false,
              discovered: false,
              evidenceSourceId: null,
              evidenceSnapshotId: null,
              contentHash: null,
            captureSuccess: false,
            alertReasons: ["Source flagged stale by scoring criteria."],
            priority: "warning",
            priorityWeight: 0,
          }));
      const metadataRecord = buildSourceIngestionAlertMetadataRecord(candidate, decision);

      await sendSourceIngestionAlertBatch({
        orgId: summary.orgId,
        recipients,
        summary: candidate,
        notificationMetadata: metadataRecord,
        staleRatioThreshold: STALE_RATIO_ALERT_THRESHOLD,
        prioritizedOffenders: prioritizedHighlights,
        examples: highlighted,
        decision,
        config: alertDecisionConfig,
      });
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
          staleOffenderCount: item.staleOffenderCount,
          sourceManifestHash: item.sourceManifestHash,
          staleOffenders: item.staleOffenders,
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
