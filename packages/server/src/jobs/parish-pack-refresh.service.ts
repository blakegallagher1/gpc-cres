import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { createStrictJsonResponse } from "@entitlement-os/openai";
import {
  zodToOpenAiJsonSchema,
  ParishPackSchema,
  validateParishPackSchemaAndCitations,
} from "@entitlement-os/shared";
import type { SkuType } from "@entitlement-os/shared";
import {
  computeEvidenceHash,
  dedupeEvidenceCitations,
  type EvidenceCitation,
} from "@entitlement-os/shared/evidence";
import { captureEvidence } from "@entitlement-os/evidence";
import type { CaptureEvidenceResult } from "@entitlement-os/evidence";
import { withRetry, withTimeout } from "@entitlement-os/evidence";
import { hashJsonSha256 } from "@entitlement-os/shared/crypto";
import * as Sentry from "@sentry/nextjs";
import { logger } from "../../../../apps/web/lib/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKUS: SkuType[] = ["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"];
const STALE_DAYS = 7;
const EVIDENCE_TIMEOUT_MS = 30_000;
const EVIDENCE_RETRIES = 2;
const PARISH_PACK_MODEL = process.env.OPENAI_PARISH_PACK_MODEL || "gpt-4.1";
const OFFICIAL_ONLY = true;

const parishPackJsonSchema = zodToOpenAiJsonSchema("parish_pack", ParishPackSchema);

const SKU_DESCRIPTIONS: Record<SkuType, string> = {
  SMALL_BAY_FLEX:
    "Small bay flex industrial buildings (5,000-20,000 SF bays). Typical uses: warehousing, light manufacturing, contractor yards, flex office/warehouse. Key concerns: M1/M2 zoning, loading requirements, parking ratios for mixed office/warehouse, conditional use permit requirements for outdoor storage areas.",
  OUTDOOR_STORAGE:
    "Outdoor storage yards for equipment, vehicles, materials. Typical uses: contractor storage yards, pipe yards, equipment staging. Key concerns: screening/fencing requirements, conditional use permit requirements, setbacks for open storage, stormwater management, noise/dust mitigation.",
  TRUCK_PARKING:
    "Truck parking and logistics facilities. Typical uses: overnight truck parking, trailer staging, intermodal transfer. Key concerns: heavy commercial vehicle access, road weight limits, hours of operation restrictions, proximity to highways/interstates, noise/lighting requirements, buffer requirements near residential.",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GatewayAuth = { orgId: string; userId: string };

export type StorageAdapter = {
  fetchObjectBytes: (objectKey: string, auth: GatewayAuth) => Promise<ArrayBuffer>;
  systemAuth: (orgId: string) => GatewayAuth;
};

export interface ParishPackRefreshParams {
  jurisdictionId?: string;
  sku?: string;
  storage: StorageAdapter;
}

export interface ParishPackRefreshSummary {
  ok: boolean;
  message: string;
  timestamp: string;
  elapsedMs: number;
  stats: {
    total: number;
    refreshed: number;
    skipped: number;
    errors: number;
  };
  refreshed?: string[];
  skipped?: string[];
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function dedupeStringValues(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }
  return output;
}

function toStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      out.push(value.trim());
    }
  }
  return out;
}

function computePackCoverageScore(sourceUrls: string[], sourcesSummary: unknown): number {
  if (sourceUrls.length === 0) return 0;
  const summary = new Set(toStringArray(sourcesSummary));
  return summary.size / sourceUrls.length;
}

function isOfficialSource(url: string, officialDomains: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return officialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function buildSystemPrompt(
  jurisdictionName: string,
  jurisdictionKind: string,
  jurisdictionState: string,
  sku: SkuType,
): string {
  return `You are a senior commercial real estate entitlement analyst specializing in Louisiana zoning and land use law. Your task is to produce a structured "parish pack" — a comprehensive regulatory intelligence briefing for a specific jurisdiction and product type.

JURISDICTION: ${jurisdictionName} (${jurisdictionKind}), ${jurisdictionState}
PRODUCT TYPE: ${sku} — ${SKU_DESCRIPTIONS[sku]}

REQUIREMENTS:
1. Every factual claim MUST include a source URL. Use the official government websites provided as primary sources. Use web search to find current information.
2. The "sources" array in each section must contain at least one URL from an official government domain.
3. All URLs in section "sources" arrays must also appear in the top-level "sources_summary" array.
4. Be SPECIFIC about fees (dollar amounts), timelines (weeks/months), meeting schedules (specific days/times), and document requirements.
5. If information is uncertain or could not be verified, add it to the "warnings" array.
6. The "paths" section should recommend the most likely entitlement path for this product type in this jurisdiction.
7. Include ALL relevant workflow paths (CUP, REZONING, VARIANCE, PUD) with honest assessments of pros/cons.

SCHEMA VERSION: Always set schema_version to "1.0".
GENERATED_AT: Use the current ISO 8601 datetime.

Do NOT hallucinate URLs. Only cite URLs you have actually accessed or found via web search. If you cannot find authoritative source for a claim, omit it or flag it in warnings.`;
}

function buildUserPrompt(
  jurisdiction: {
    id: string;
    name: string;
    kind: string;
    state: string;
    timezone: string;
  },
  sku: SkuType,
  evidenceTexts: string[],
  seedSourceUrls: string[],
): string {
  const parts: string[] = [];

  parts.push(`Generate a parish pack for ${jurisdiction.name}, SKU: ${sku}.`);
  parts.push("");
  parts.push(`Jurisdiction details:`);
  parts.push(`- ID: ${jurisdiction.id}`);
  parts.push(`- Name: ${jurisdiction.name}`);
  parts.push(`- Kind: ${jurisdiction.kind}`);
  parts.push(`- State: ${jurisdiction.state}`);
  parts.push(`- Timezone: ${jurisdiction.timezone}`);
  parts.push("");

  if (seedSourceUrls.length > 0) {
    parts.push(`Official seed source URLs to reference:`);
    for (const url of seedSourceUrls) {
      parts.push(`- ${url}`);
    }
    parts.push("");
  }

  if (evidenceTexts.length > 0) {
    parts.push(`=== EVIDENCE FROM OFFICIAL SOURCES ===`);
    parts.push(`The following is extracted text from official jurisdiction sources. Use this as grounding data — cite the original URLs, not "evidence source X".`);
    parts.push("");
    for (let i = 0; i < evidenceTexts.length; i++) {
      const text = evidenceTexts[i].slice(0, 8000);
      parts.push(`--- Source ${i + 1} (${seedSourceUrls[i] || "unknown"}) ---`);
      parts.push(text);
      parts.push("");
    }
  }

  parts.push(`Use web search to supplement the evidence above with current information from the jurisdiction's official website. Focus on: meeting schedules, fee schedules, application forms, and any recent ordinance changes.`);

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runParishPackRefresh(
  params: ParishPackRefreshParams,
): Promise<ParishPackRefreshSummary> {
  const { jurisdictionId: requestedJurisdictionId, sku: requestedSku, storage } = params;

  let skus = SKUS;
  if (requestedSku) {
    if (!SKUS.includes(requestedSku as SkuType)) {
      return {
        ok: false,
        message: "Invalid sku",
        timestamp: new Date().toISOString(),
        elapsedMs: 0,
        stats: { total: 0, refreshed: 0, skipped: 0, errors: 0 },
        errors: [`Invalid sku: ${requestedSku}`],
      };
    }
    skus = [requestedSku as SkuType];
  }

  const startTime = Date.now();

  // 1. Fetch all jurisdictions with their seed sources
  const jurisdictions = await prisma.jurisdiction.findMany({
    where: requestedJurisdictionId ? { id: requestedJurisdictionId } : undefined,
    include: {
      seedSources: { where: { active: true } },
    },
  });

  if (jurisdictions.length === 0) {
    return {
      ok: true,
      message: "No jurisdictions to refresh",
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startTime,
      stats: { total: 0, refreshed: 0, skipped: 0, errors: 0 },
    };
  }

  const orgId = jurisdictions[0].orgId;
  const refreshed: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // 2. For each jurisdiction × SKU, check freshness and refresh if stale
  for (const jurisdiction of jurisdictions) {
    for (const sku of skus) {
      const label = `${jurisdiction.name} / ${sku}`;

      try {
        // Check freshness: skip if pack is < STALE_DAYS old
        const current = await prisma.parishPackVersion.findFirst({
          where: {
            jurisdictionId: jurisdiction.id,
            sku,
            status: "current",
          },
          orderBy: { generatedAt: "desc" },
        });

        if (current && Date.now() - current.generatedAt.getTime() < STALE_DAYS * 86_400_000) {
          skipped.push(label);
          logger.info("Cron parish-pack-refresh skipped fresh pack", {
            label,
            ageDays: Math.round((Date.now() - current.generatedAt.getTime()) / 86_400_000),
          });
          continue;
        }

        logger.info("Cron parish-pack-refresh refreshing pack", { label });

        // Create Run record
        const run = await prisma.run.create({
          data: {
            orgId,
            runType: "PARISH_PACK_REFRESH",
            jurisdictionId: jurisdiction.id,
            sku,
            status: "running",
          },
        });

        // 3. Gather evidence from seed sources
        const officialDomains = jurisdiction.officialDomains.map((value) => value.toLowerCase());
        const sourceCandidates = jurisdiction.seedSources;
        const officialSeedSources = OFFICIAL_ONLY
          ? sourceCandidates.filter((source) => isOfficialSource(source.url, officialDomains))
          : sourceCandidates;
        const selectedSources =
          OFFICIAL_ONLY && officialSeedSources.length === 0
            ? sourceCandidates
            : officialSeedSources;

        const evidenceTexts: string[] = [];
        const sourceEvidenceIds: string[] = [];
        const sourceSnapshotIds: string[] = [];
        const sourceContentHashes: string[] = [];
        const sourceUrls: string[] = [];
        const evidenceCitations: EvidenceCitation[] = [];

        for (const source of selectedSources) {
          try {
            const seededSourceUrl = source.url;
            sourceUrls.push(seededSourceUrl);

            // Try to get the latest existing text extract for this source
            const existingSnapshot = await prisma.evidenceSnapshot.findFirst({
              where: {
                evidenceSource: { url: seededSourceUrl, orgId },
                textExtractObjectKey: { not: "" },
              },
              select: {
                id: true,
                evidenceSourceId: true,
                contentHash: true,
                textExtractObjectKey: true,
              },
              orderBy: { retrievedAt: "desc" },
            });

            if (existingSnapshot?.textExtractObjectKey) {
              try {
                const auth = storage.systemAuth(orgId);
                const data = await storage.fetchObjectBytes(
                  existingSnapshot.textExtractObjectKey,
                  auth,
                );
                const text = new TextDecoder().decode(data);
                if (text.trim().length > 0) {
                  evidenceTexts.push(text);
                  sourceEvidenceIds.push(existingSnapshot.evidenceSourceId);
                  sourceSnapshotIds.push(existingSnapshot.id);
                  sourceContentHashes.push(existingSnapshot.contentHash);
                  evidenceCitations.push({
                    tool: "evidence_snapshot",
                    sourceId: existingSnapshot.evidenceSourceId,
                    snapshotId: existingSnapshot.id,
                    contentHash: existingSnapshot.contentHash,
                    url: seededSourceUrl,
                    isOfficial: isOfficialSource(seededSourceUrl, officialDomains),
                  });
                  continue;
                }
              } catch {
                /* fall through to capture fresh evidence */
              }
            }

            // No existing snapshot or couldn't download — capture fresh evidence
            const captureResult: CaptureEvidenceResult = await withRetry(
              () =>
                withTimeout(
                  captureEvidence({
                    url: seededSourceUrl,
                    orgId,
                    runId: run.id,
                    prisma,
                    allowPlaywrightFallback: false,
                    officialDomains: jurisdiction.officialDomains,
                  }),
                  EVIDENCE_TIMEOUT_MS,
                  `evidence: ${seededSourceUrl}`,
                ),
              EVIDENCE_RETRIES,
              `evidence: ${seededSourceUrl}`,
            );

            if (captureResult.extractedText.trim().length > 0) {
              evidenceTexts.push(captureResult.extractedText);
            }
            sourceEvidenceIds.push(captureResult.sourceId);
            sourceSnapshotIds.push(captureResult.snapshotId);
            sourceContentHashes.push(captureResult.contentHash);
            evidenceCitations.push({
              tool: "evidence_snapshot",
              sourceId: captureResult.sourceId,
              snapshotId: captureResult.snapshotId,
              contentHash: captureResult.contentHash,
              url: seededSourceUrl,
              isOfficial: isOfficialSource(seededSourceUrl, officialDomains),
            });
          } catch (err) {
            Sentry.captureException(err, {
              tags: { route: "api.cron.parish-pack-refresh", method: "GET" },
            });
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn("Cron parish-pack-refresh evidence capture failed", {
              label,
              url: source.url,
              errorMessage: msg,
            });
          }
        }

        // 4. Generate parish pack via OpenAI Responses API with web search
        const systemPrompt = buildSystemPrompt(
          jurisdiction.name,
          jurisdiction.kind,
          jurisdiction.state,
          sku,
        );

        const userPrompt = buildUserPrompt(
          {
            id: jurisdiction.id,
            name: jurisdiction.name,
            kind: jurisdiction.kind,
            state: jurisdiction.state,
            timezone: jurisdiction.timezone,
          },
          sku,
          evidenceTexts,
          sourceUrls,
        );

        const response = await createStrictJsonResponse<Record<string, unknown>>({
          model: PARISH_PACK_MODEL,
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          jsonSchema: parishPackJsonSchema,
          tools: [{ type: "web_search_preview" as const, search_context_size: "high" as const }],
        });

        // 5. Validate the generated pack
        const validation = validateParishPackSchemaAndCitations(
          response.outputJson,
          jurisdiction.officialDomains,
        );

        const sourceSummary = toStringArray(
          (response.outputJson as Record<string, unknown>)?.sources_summary,
        );
        const packCoverageScore = computePackCoverageScore(sourceUrls, sourceSummary);
        const canonicalSchemaVersion =
          typeof (response.outputJson as Record<string, unknown>)?.schema_version === "string"
            ? ((response.outputJson as Record<string, unknown>).schema_version as string)
            : "1.0";
        const packInputHash = hashJsonSha256({
          jurisdictionId: jurisdiction.id,
          sku,
          officialOnly: OFFICIAL_ONLY,
          sourceUrls,
          sourceEvidenceIds: dedupeStringValues(sourceEvidenceIds),
          sourceSnapshotIds: dedupeStringValues(sourceSnapshotIds),
          sourceContentHashes: dedupeStringValues(sourceContentHashes),
          sourceSummary,
        });
        const normalizedEvidenceCitations = dedupeEvidenceCitations(evidenceCitations);
        const evidenceHash = computeEvidenceHash(normalizedEvidenceCitations);

        let packStatus: string;
        if (validation.ok) {
          packStatus = "current";
          logger.info("Cron parish-pack-refresh generated validated pack", { label });
        } else {
          packStatus = "draft";
          logger.warn("Cron parish-pack-refresh citation validation failed", {
            label,
            errors: (validation as { ok: false; errors: string[] }).errors,
          });
        }

        // 6. Compute next version
        const latest = await prisma.parishPackVersion.findFirst({
          where: { jurisdictionId: jurisdiction.id, sku },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const nextVersion = (latest?.version ?? 0) + 1;

        // 7. Store new version and mark old as superseded
        await prisma.$transaction(async (tx) => {
          await tx.parishPackVersion.create({
            data: {
              orgId,
              jurisdictionId: jurisdiction.id,
              sku,
              version: nextVersion,
              status: packStatus,
              generatedAt: new Date(),
              generatedByRunId: run.id,
              packJson: response.outputJson as unknown as Prisma.InputJsonValue,
              sourceEvidenceIds: dedupeStringValues(sourceEvidenceIds),
              sourceSnapshotIds: dedupeStringValues(sourceSnapshotIds),
              sourceContentHashes: dedupeStringValues(sourceContentHashes),
              sourceUrls,
              officialOnly: OFFICIAL_ONLY,
              packCoverageScore,
              canonicalSchemaVersion,
              coverageSourceCount: sourceSummary.length,
              inputHash: packInputHash,
            },
          });

          if (packStatus === "current") {
            await tx.parishPackVersion.updateMany({
              where: {
                jurisdictionId: jurisdiction.id,
                sku,
                version: { not: nextVersion },
                status: "current",
              },
              data: { status: "superseded" },
            });
          }
        });

        // 8. Update Run as succeeded
        await prisma.run.update({
          where: { id: run.id },
          data: {
            status: "succeeded",
            finishedAt: new Date(),
            openaiResponseId: response.responseId,
            outputJson: {
              version: nextVersion,
              status: packStatus,
              evidenceSourcesUsed: evidenceTexts.length,
              sourceEvidenceCount: dedupeStringValues(sourceEvidenceIds).length,
              sourceSnapshotCount: dedupeStringValues(sourceSnapshotIds).length,
              packCoverageScore,
              coverageSourceCount: sourceSummary.length,
              canonicalSchemaVersion,
              packInputHash,
              evidenceCitations: normalizedEvidenceCitations,
              evidenceHash,
              seedSourcesTotal: jurisdiction.seedSources.length,
              webSearchSources: response.toolSources.webSearchSources.length,
              validationErrors: validation.ok ? [] : (validation as { ok: false; errors: string[] }).errors,
            },
          },
        });

        refreshed.push(label);
        logger.info("Cron parish-pack-refresh stored pack", {
          label,
          version: nextVersion,
          packStatus,
          evidenceSourceCount: evidenceTexts.length,
          webSearchSourceCount: response.toolSources.webSearchSources.length,
        });
      } catch (err) {
        Sentry.captureException(err, {
          tags: { route: "api.cron.parish-pack-refresh", method: "GET" },
        });
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${label}: ${msg}`);
        logger.error("Cron parish-pack-refresh failed for label", {
          label,
          errorMessage: msg,
        });
      }
    }
  }

  const elapsed = Date.now() - startTime;
  const summary: ParishPackRefreshSummary = {
    ok: true,
    message: "Parish pack refresh complete",
    timestamp: new Date().toISOString(),
    elapsedMs: elapsed,
    stats: {
      total: jurisdictions.length * SKUS.length,
      refreshed: refreshed.length,
      skipped: skipped.length,
      errors: errors.length,
    },
    refreshed,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  };

  logger.info("Cron parish-pack-refresh complete", { summary: summary.stats });
  return summary;
}
