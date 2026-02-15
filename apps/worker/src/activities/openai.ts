import { prisma, type Prisma } from "@entitlement-os/db";
import { createStrictJsonResponse, run } from "@entitlement-os/openai";
import {
  AgentReport,
  AgentReportSchema,
  ParcelTriageSchema,
  buildOpportunityScorecard,
  buildDeterministicRerunDecision,
  computeThroughputRouting,
  ParishPack,
  ParishPackSchema,
  ParishPackSchemaVersion,
  zodToOpenAiJsonSchema,
  SkuType,
  AGENT_RUN_STATE_SCHEMA_VERSION,
  AGENT_RUN_STATE_STATUS,
  type AgentRunState,
  type AgentRunWorkflowInput,
  type AgentRunWorkflowOutput,
  type AgentEvidenceRetryPolicy,
  type DataAgentRetrievalContext,
  type AgentTrustSnapshot,
  type OpportunityScorecard,
  type ParcelTriage,
  type TriageToolSource,
  SKU_TYPES,
  RunType,
} from "@entitlement-os/shared";
import {
  computeEvidenceHash,
  dedupeEvidenceCitations,
  type EvidenceCitation,
} from "@entitlement-os/shared/evidence";
import { hashJsonSha256 } from "@entitlement-os/shared/crypto";
import {
  buildAgentStreamRunOptions,
  createIntentAwareCoordinator,
  evaluateProofCompliance,
  inferQueryIntentFromText,
  getProofGroupsForIntent,
} from "@entitlement-os/openai";
import { autoFeedRun } from "../dataAgentAutoFeed.service.js";
import { unifiedRetrieval } from "../../../services/retrieval.service";

const DATA_AGENT_RETRIEVAL_LIMIT = 6;

type AgentInputMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      status: "completed";
      content: Array<{ type: "output_text"; text: string }>;
    };

type AgentExecutionResult = {
  runId: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  finalOutput: string;
  finalReport: Record<string, unknown> | null;
  toolsInvoked: string[];
  trust: AgentTrustSnapshot;
  openaiResponseId: string | null;
  inputHash: string;
};

type ToolEventState = {
  toolsInvoked: Set<string>;
  packVersionsUsed: Set<string>;
  evidenceCitations: Array<{
    tool?: string;
    sourceId?: string;
    snapshotId?: string;
    contentHash?: string;
    url?: string;
    isOfficial?: boolean;
  }>;
  missingEvidence: Set<string>;
  toolErrorMessages: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    isRecord(value) &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] ===
      "function"
  );
}

function buildAgentInputItems(input: AgentInputMessage[]) {
  return input.map((entry) => {
    if (entry.role === "user") {
      return { role: "user", content: entry.content };
    }

    return {
      role: "assistant",
      status: "completed",
      content: entry.content.map((segment) => ({
        type: segment.type,
        text: segment.text,
      })),
    };
  });
}

function safeParseJson(value: unknown): unknown | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeSku(sku: string | null | undefined): SkuType | null {
  if (!sku) return null;
  return (SKU_TYPES as readonly string[]).includes(sku) ? (sku as SkuType) : null;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value > 1 && value <= 100) return value / 100;
  if (value >= 0 && value <= 1) return value;
  return null;
}

function parseConfidenceFromOutput(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const primary = normalizeConfidence(value.confidence);
  if (primary !== null) return primary;
  const overall = normalizeConfidence(value.overallConfidence);
  if (overall !== null) return overall;
  const score = normalizeConfidence(value.score);
  if (score !== null) return score;
  const rate = normalizeConfidence(value.scorecardConfidence);
  if (rate !== null) return rate;
  return null;
}

function sanitizeOutputText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (isRecord(value)) return JSON.stringify(value);
  try {
    return String(value);
  } catch {
    return "";
  }
}

const MISSING_EVIDENCE_RETRY_THRESHOLD = 3;
const MISSING_EVIDENCE_RETRY_MAX_ATTEMPTS = 3;
const MISSING_EVIDENCE_RETRY_MODE = "missing-evidence-policy";

function buildMissingEvidenceRetryPolicy(
  params: {
    retryAttempts?: number | null;
    retryMaxAttempts?: number | null;
    retryMode?: string | null;
  },
  missingEvidenceCount: number,
  status: AgentExecutionResult["status"],
): AgentEvidenceRetryPolicy {
  const attempts = Math.max(1, params.retryAttempts ?? 1);
  const maxAttempts = Math.max(
    attempts,
    params.retryMaxAttempts ?? MISSING_EVIDENCE_RETRY_MAX_ATTEMPTS,
  );
  const shouldRetry =
    status !== "succeeded" &&
    missingEvidenceCount >= MISSING_EVIDENCE_RETRY_THRESHOLD &&
    attempts < maxAttempts;

  return {
    enabled: missingEvidenceCount > 0,
    threshold: MISSING_EVIDENCE_RETRY_THRESHOLD,
    missingEvidenceCount,
    attempts,
    maxAttempts,
    shouldRetry,
    nextAttempt: shouldRetry ? attempts + 1 : attempts,
    nextRetryMode: shouldRetry
      ? MISSING_EVIDENCE_RETRY_MODE
      : params.retryMode ?? "temporal",
    reason: shouldRetry
      ? `Missing evidence count (${missingEvidenceCount}) exceeded threshold ${MISSING_EVIDENCE_RETRY_THRESHOLD}.`
      : attempts >= maxAttempts
        ? `Missing evidence policy reached max attempts (${maxAttempts}).`
        : "Policy not triggered.",
  };
}

function buildFallbackOutput(status: AgentExecutionResult["status"], missingEvidence: string[]): string {
  if (status === "succeeded") return "";

  const prefix =
    status === "failed"
      ? "I completed a partial analysis, but some required checks could not finish."
      : "Execution was interrupted.";
  const bullets = missingEvidence.length
    ? `Missing evidence:\n${missingEvidence.map((item) => `- ${item}`).join("\n")}`
    : "No confidence-grade evidence was fully captured.";
  return `${prefix}\n\n${bullets}\n\nPlease run again with the missing evidence inputs and official source identifiers.`;
}

type RunProgressSnapshot = {
  partialOutput: string;
  status: AgentExecutionResult["status"];
  lastAgentName: string;
  toolsInvoked: string[];
  confidence: number | null;
  missingEvidence: string[];
  runId: string;
};

function normalizeOutputForProgress(value: string): string {
  return value.length <= 120000 ? value : `${value.slice(0, 119800)}…`;
}

function buildProgressSnapshot(
  runId: string,
  state: ToolEventState,
  status: AgentExecutionResult["status"],
  partialOutput: string,
  lastAgentName: string,
  confidence: number | null,
): RunProgressSnapshot {
  return {
    runId,
    partialOutput: normalizeOutputForProgress(partialOutput),
    status,
    lastAgentName,
    toolsInvoked: [...state.toolsInvoked].sort(),
    confidence,
    missingEvidence: [...state.missingEvidence],
  };
}

async function upsertRunRecord(params: {
  runId: string;
  orgId: string;
  runType: string;
  dealId?: string | null;
  jurisdictionId?: string | null;
  sku?: string | null;
  status?: "running" | "succeeded" | "failed" | "canceled";
  inputHash: string;
  outputJson?: Prisma.InputJsonValue;
}) {
  const runType = (params.runType ?? "ENRICHMENT") as RunType;
  return prisma.run.upsert({
    where: { id: params.runId },
    create: {
      id: params.runId,
      orgId: params.orgId,
      runType,
      dealId: params.dealId ?? null,
      jurisdictionId: params.jurisdictionId ?? null,
      sku: normalizeSku(params.sku),
      status: params.status ?? "running",
      inputHash: params.inputHash,
      outputJson: params.outputJson,
    },
    update: {
      status: params.status ?? "running",
      inputHash: params.inputHash,
      outputJson: params.outputJson,
    },
  });
}

async function persistRunProgress(
  dbRunId: string,
  params: {
    status: AgentExecutionResult["status"];
    state: ToolEventState;
    finalText: string;
    lastAgentName: string;
    confidence: number | null;
    correlationId?: string;
  },
  runStartMs: number,
  runInputHash: string,
) {
  const snapshot = buildProgressSnapshot(
    dbRunId,
    params.state,
    params.status,
    params.finalText,
    params.lastAgentName,
    params.confidence,
  );
  const runState: AgentRunState = {
    schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
    runId: dbRunId,
    status: snapshot.status,
    partialOutput: snapshot.partialOutput,
    lastAgentName: snapshot.lastAgentName,
    toolsInvoked: snapshot.toolsInvoked,
    confidence: snapshot.confidence,
    missingEvidence: snapshot.missingEvidence,
    durationMs: Date.now() - runStartMs,
    lastUpdatedAt: new Date().toISOString(),
    runStartedAt: new Date(runStartMs).toISOString(),
    runInputHash,
    leaseOwner: "agent-runner",
    leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    correlationId: params.correlationId,
  };
  const outputJson: Prisma.InputJsonValue = {
    runState,
    partialOutput: snapshot.partialOutput,
    confidence: snapshot.confidence,
    status: snapshot.status,
    lastAgentName: snapshot.lastAgentName,
    lastUpdatedAt: new Date().toISOString(),
    durationMs: Date.now() - runStartMs,
    correlationId: params.correlationId,
  };

  await prisma.run.update({
    where: { id: dbRunId },
    data: {
      status: params.status,
      outputJson,
    },
  });
}

function getToolName(payload: Record<string, unknown>): string | null {
  const toolValueName =
    payload.tool && isRecord(payload.tool) && typeof payload.tool.name === "string"
      ? payload.tool.name
      : null;
  const toolCallValueName =
    payload.toolCall &&
    isRecord(payload.toolCall) &&
    typeof payload.toolCall.name === "string"
      ? payload.toolCall.name
      : null;
  const toolCallSnakeName =
    payload.tool_call &&
    isRecord(payload.tool_call) &&
    typeof payload.tool_call.name === "string"
      ? payload.tool_call.name
      : null;
  const callValueName =
    payload.call && isRecord(payload.call) && typeof payload.call.name === "string"
      ? payload.call.name
      : null;
  const fnValueName =
    payload.fn && isRecord(payload.fn) && typeof payload.fn.name === "string"
      ? payload.fn.name
      : null;

  const candidates = [
    payload.name,
    payload.tool_name,
    payload.toolName,
    toolValueName,
    toolCallValueName,
    toolCallSnakeName,
    callValueName,
    fnValueName,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

function extractToolOutput(payload: Record<string, unknown>): unknown {
  const candidates = [
    payload.output,
    payload.result,
    payload.response,
    payload.data,
    payload.details,
    payload.callOutput,
    payload.tool_output,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === "string" || typeof candidate === "object") {
      return candidate;
    }
  }
  return null;
}

function collectToolOutputSignals(
  toolName: string,
  output: unknown,
  state: ToolEventState,
) {
  let parsed: unknown = output;
  if (typeof output === "string") {
    parsed = safeParseJson(output) ?? output;
  }
  if (!isRecord(parsed)) return;

  const asRecord = parsed as Record<string, unknown>;
  if ("version" in asRecord || "_meta" in asRecord) {
    const version =
      typeof asRecord.version === "number" || typeof asRecord.version === "string"
        ? asRecord.version
        : undefined;
    const metaVersion =
      isRecord(asRecord._meta) &&
      (typeof asRecord._meta.version === "number" ||
        typeof asRecord._meta.version === "string")
        ? asRecord._meta.version
        : undefined;
    const resolved = (version ?? metaVersion) ?? "unknown";
    state.packVersionsUsed.add(`jurisdiction_pack:${resolved}`);
  }

  if (
    typeof asRecord.url === "string" ||
    typeof asRecord.sourceId === "string" ||
    typeof asRecord.snapshotId === "string" ||
    typeof asRecord.contentHash === "string"
  ) {
    state.evidenceCitations.push({
      tool: toolName,
      sourceId:
        typeof asRecord.sourceId === "string" ? asRecord.sourceId : undefined,
      snapshotId:
        typeof asRecord.snapshotId === "string" ? asRecord.snapshotId : undefined,
      contentHash:
        typeof asRecord.contentHash === "string" ? asRecord.contentHash : undefined,
      url: typeof asRecord.url === "string" ? asRecord.url : undefined,
      isOfficial:
        typeof asRecord.isOfficial === "boolean" ? asRecord.isOfficial : undefined,
    });
  }

  if (typeof asRecord.error === "string") {
    state.toolErrorMessages.push(`${toolName}: ${asRecord.error}`);
    if (/(missing|not found|failed|timeout|unauthorized|forbidden)/i.test(asRecord.error)) {
      state.missingEvidence.add(`${toolName}: ${asRecord.error}`);
    }
  }
}

function finalizeMissingEvidence(state: ToolEventState): string[] {
  const needsEvidence = [
    "search_parcels",
    "get_parcel_details",
    "screen_flood",
    "screen_soils",
    "screen_wetlands",
    "screen_epa",
    "screen_traffic",
    "screen_ldeq",
    "screen_full",
    "evidence_snapshot",
    "search_comparable_sales",
    "flood_zone_lookup",
    "parish_pack_lookup",
    "get_jurisdiction_pack",
  ];

  const hasEvidence = state.evidenceCitations.length > 0;
  const usedEvidenceTools = [...state.toolsInvoked].some((tool) =>
    needsEvidence.includes(tool),
  );
  if (usedEvidenceTools && !hasEvidence) {
    state.missingEvidence.add("Tool outputs did not include evidence snapshots/citations.");
  }
  return [...state.missingEvidence];
}

function buildVerificationSteps(missingEvidence: string[]): string[] {
  const steps = [
    "Re-run with stricter input (full parcel identifiers and target jurisdiction).",
    "Verify official seed-source snapshots for each cited claim.",
  ];
  if (missingEvidence.some((entry) => entry.includes("evidence_snapshot"))) {
    steps.push("Re-run evidence_snapshot for sources that returned errors.");
  }
  return steps;
}

const PARISH_PACK_MODEL = process.env.OPENAI_FLAGSHIP_MODEL || "o3";
const TRIAGE_MODEL = process.env.OPENAI_STANDARD_MODEL || "gpt-4.1";

/**
 * Generate a parish pack JSON from extracted evidence texts using OpenAI.
 */
export async function generateParishPack(params: {
  jurisdictionId: string;
  sku: SkuType;
  evidenceTexts: string[];
  sourceUrls: string[];
  officialOnly?: boolean;
}): Promise<Record<string, unknown>> {
  const combinedEvidence = params.evidenceTexts
    .map((text, i) => `--- Source ${i + 1} ---\n${text}`)
    .join("\n\n");
  const officialSourceText = params.officialOnly === false ? "official plus non-official fallback" : "official sources";
  const sourceList = params.sourceUrls
    .map((url, index) => `${index + 1}. ${url}`)
    .join("\n");

  const response = await createStrictJsonResponse<Record<string, unknown>>({
    model: PARISH_PACK_MODEL,
    input: [
      {
        role: "system",
        content: `You are a CRE entitlement analyst. Analyze source documents and produce a strict parish pack for:
Jurisdiction: ${params.jurisdictionId}
SKU: ${params.sku}

Rules:
1) Prefer ${officialSourceText}.
2) Fill every required section in the canonical schema.
3) generated_at must be an ISO datetime.
4) sources_summary must include every URL used in process sections.
5) Set schema_version to ${ParishPackSchemaVersion.value}.`,
      },
      {
        role: "user",
        content: [
          `Jurisdiction: ${params.jurisdictionId}`,
          `SKU: ${params.sku}`,
          `Seed source URLs (${params.sourceUrls.length}):`,
          sourceList,
          "",
          "Evidence text by source:",
          combinedEvidence,
        ].join("\n"),
      },
    ],
    jsonSchema: zodToOpenAiJsonSchema("parish_pack", ParishPackSchema),
  });

  const pack = response.outputJson as ParishPack;

  return {
    ...pack,
    canonicalSchemaVersion: ParishPackSchemaVersion.value,
  };
}

/**
 * Run AI-powered parcel triage for a deal.
 * Analyzes the deal's parcel data and produces a triage assessment.
 */
export async function runParcelTriage(params: {
  dealId: string;
  orgId: string;
  runId: string;
}): Promise<{
  triage: ParcelTriage;
  triageScore: number;
  summary: string;
  scorecard: OpportunityScorecard;
  routing: ReturnType<typeof computeThroughputRouting>;
  rerun: { reusedPreviousRun: boolean; reason: string };
  sources: TriageToolSource[];
}> {
  const deal = await prisma.deal.findFirstOrThrow({
    where: { id: params.dealId, orgId: params.orgId },
    include: { parcels: true },
  });

  const rerunPayload = {
    dealId: deal.id,
    dealName: deal.name,
    sku: deal.sku,
    jurisdictionId: deal.jurisdictionId,
    parcels: deal.parcels.map((parcel: {
      id: string;
      apn: string | null;
      address: string | null;
      acreage: { toString(): string } | null;
      currentZoning: string | null;
      floodZone: string | null;
      soilsNotes: string | null;
      wetlandsNotes: string | null;
      envNotes: string | null;
      utilitiesNotes: string | null;
      trafficNotes: string | null;
    }) => ({
      id: parcel.id,
      apn: parcel.apn,
      address: parcel.address,
      acreage: parcel.acreage?.toString() ?? null,
      currentZoning: parcel.currentZoning,
      floodZone: parcel.floodZone,
      soilsNotes: parcel.soilsNotes,
      wetlandsNotes: parcel.wetlandsNotes,
      envNotes: parcel.envNotes,
      utilitiesNotes: parcel.utilitiesNotes,
      trafficNotes: parcel.trafficNotes,
    })),
  };

  const previousSucceededRun = await prisma.run.findFirst({
    where: {
      orgId: params.orgId,
      dealId: params.dealId,
      runType: "TRIAGE",
      status: "succeeded",
      id: { not: params.runId },
    },
    orderBy: { finishedAt: "desc" },
    select: {
      id: true,
      inputHash: true,
      outputJson: true,
    },
  });

  const rerunDecision = buildDeterministicRerunDecision({
    runType: "TRIAGE",
    dealId: params.dealId,
    orgId: params.orgId,
    payload: rerunPayload,
    previousInputHash: previousSucceededRun?.inputHash,
  });

  if (rerunDecision.shouldReuse && previousSucceededRun?.outputJson) {
      const cachedOutput = previousSucceededRun.outputJson as Record<string, unknown>;
      const cachedSources =
        Array.isArray(cachedOutput.sources) &&
        cachedOutput.sources.every(
          (item): item is TriageToolSource =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as Record<string, unknown>).url === "string",
        )
          ? (cachedOutput.sources as TriageToolSource[])
          : [];
      const cachedTriage = ParcelTriageSchema.safeParse(cachedOutput.triage);
    const cachedTriageScore = Number(cachedOutput.triageScore);
    const cachedSummary = String(cachedOutput.summary ?? "Reused previous deterministic triage run.");
    const cachedScorecard = cachedOutput.scorecard as OpportunityScorecard | undefined;
    const cachedRouting = cachedOutput.routing as ReturnType<typeof computeThroughputRouting> | undefined;

      if (
        Number.isFinite(cachedTriageScore) &&
        cachedTriage.success &&
        cachedScorecard &&
        cachedRouting
      ) {
      await prisma.run.update({
        where: { id: params.runId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          inputHash: rerunDecision.inputHash,
          outputJson: {
            ...cachedOutput,
            rerun: {
              reusedPreviousRun: true,
              sourceRunId: previousSucceededRun.id,
              reason: rerunDecision.reason,
            },
          } as Prisma.InputJsonValue,
        },
      });

          return {
            triage: cachedTriage.data,
            triageScore: cachedTriageScore,
            summary: cachedSummary,
            scorecard: cachedScorecard,
            routing: cachedRouting,
            rerun: { reusedPreviousRun: true, reason: rerunDecision.reason },
            sources: cachedSources,
          };
    }
  }

  const parcelDescriptions = deal.parcels
    .map(
      (p: {
        apn: string | null;
        id: string;
        address: string | null;
        currentZoning: string | null;
      }) =>
        `Parcel ${p.apn ?? p.id}: ${p.address ?? "no address"}, zoning: ${p.currentZoning ?? "unknown"}`,
    )
    .join("\n");

  const response = await createStrictJsonResponse({
    model: TRIAGE_MODEL,
    input: [
      {
        role: "system",
        content: "You are a CRE deal triage analyst. Produce a strict parcel triage object.",
      },
      {
        role: "user",
        content: [
          `Deal: ${deal.name}`,
          `SKU: ${deal.sku}`,
          `Jurisdiction: ${deal.jurisdictionId}`,
          "Provide KILL/HOLD/ADVANCE recommendation with clear rationale and stage actions.",
          `Deal ID: ${deal.id}`,
          `Generated at: ${new Date().toISOString()}`,
          "",
          "Parcels:",
          parcelDescriptions,
        ].join("\n"),
      },
    ],
    jsonSchema: zodToOpenAiJsonSchema("ParcelTriage", ParcelTriageSchema),
  });

  const webSearchSources = response.toolSources.webSearchSources ?? [];
  const triageEvidenceCitations = dedupeEvidenceCitations(
    webSearchSources
      .filter((item): item is TriageToolSource => typeof item.url === "string")
      .map((item) => ({
        tool: "web_search",
        url: item.url,
      })),
  );
  const triageEvidenceHash = computeEvidenceHash(triageEvidenceCitations);

  const triage = ParcelTriageSchema.parse({
    ...(response.outputJson as Record<string, unknown>),
    generated_at: (response.outputJson as Record<string, unknown>).generated_at ?? new Date().toISOString(),
    deal_id: (response.outputJson as Record<string, unknown>).deal_id ?? deal.id,
  });

  const avgRisk =
    Object.values(triage.risk_scores).reduce((sum, value) => sum + value, 0) /
    Math.max(Object.keys(triage.risk_scores).length, 1);
  const triageScore = Math.round(((10 - avgRisk) / 10) * 10000) / 100;
  const summary = `${triage.decision}: ${triage.rationale}`;

  const scorecard = buildOpportunityScorecard({
    dealId: params.dealId,
    triage,
    rerunPolicy: {
      input_hash: rerunDecision.inputHash,
      deterministic: true,
      rerun_reason: rerunDecision.reason,
    },
  });

  const routing = computeThroughputRouting({
    parcelCount: deal.parcels.length,
    avgRiskScore: avgRisk,
    disqualifierCount: triage.disqualifiers.length,
    confidence: scorecard.overall_confidence,
    missingDataCount: triage.assumptions.filter((item) => item.sources == null).length,
  });

  const sources = response.toolSources.webSearchSources.map((
    source: {
      url: string;
      title?: string | null;
    },
  ) => ({
    url: source.url,
    title: source.title ?? undefined,
  }));

  const outputPayload = {
    triageScore,
    summary,
    triage,
    scorecard,
    routing,
    evidenceCitations: triageEvidenceCitations,
    evidenceHash: triageEvidenceHash,
    rerun: { reusedPreviousRun: false, reason: rerunDecision.reason },
    sources,
  };

  await prisma.run.update({
    where: { id: params.runId },
    data: {
      status: "succeeded",
      finishedAt: new Date(),
      inputHash: rerunDecision.inputHash,
      outputJson: outputPayload,
      openaiResponseId: response.responseId,
    },
  });

  return {
    triage,
    triageScore,
    summary,
    scorecard,
    routing,
    rerun: { reusedPreviousRun: false, reason: rerunDecision.reason },
    sources,
  };
}

export async function runAgentTurn(
  params: AgentRunWorkflowInput,
): Promise<AgentRunWorkflowOutput> {
  const startedAtMs = Date.now();
  const input = (params.input ?? []) as AgentInputMessage[];
  const runType = (params.runType ?? "ENRICHMENT") as RunType;
  const runId =
    params.runId ??
    `agent-run-${hashJsonSha256({
      orgId: params.orgId,
      userId: params.userId,
      conversationId: params.conversationId,
      inputHashAnchor: hashJsonSha256({
        orgId: params.orgId,
        userId: params.userId,
        correlationId: params.correlationId ?? "",
      }),
    })}`;

  const inputHash = hashJsonSha256({
    orgId: params.orgId,
    userId: params.userId,
    conversationId: params.conversationId,
    runType,
    dealId: params.dealId ?? null,
    jurisdictionId: params.jurisdictionId ?? null,
    input,
  });

  const runTypeString = (runType ?? "ENRICHMENT") as string;
  const dbRun = await upsertRunRecord({
    runId,
    orgId: params.orgId,
    runType: runTypeString,
    dealId: params.dealId ?? null,
    jurisdictionId: params.jurisdictionId ?? null,
    sku: params.sku,
    status: "running",
    inputHash,
    outputJson: {
      runState: {
        schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
        status: AGENT_RUN_STATE_STATUS.RUNNING,
        partialOutput: "",
        runId,
        lastAgentName: "Coordinator",
        toolsInvoked: [],
        confidence: null,
        missingEvidence: [],
        durationMs: 0,
        lastUpdatedAt: new Date(startedAtMs).toISOString(),
        runStartedAt: new Date(startedAtMs).toISOString(),
        runInputHash: inputHash,
        leaseOwner: "agent-runner",
        leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        correlationId: params.correlationId,
      },
    },
  });

  const firstUserInput = input.find((entry) => entry.role === "user")?.content;
  const userTextForIntent = params.intentHint ?? firstUserInput;
  const queryIntent = inferQueryIntentFromText(userTextForIntent);

  const state: ToolEventState = {
    toolsInvoked: new Set(),
    packVersionsUsed: new Set(),
    evidenceCitations: [],
    missingEvidence: new Set(),
    toolErrorMessages: [],
  };

  let finalText = "";
  let finalReport: AgentReport | null = null;
  let status: "running" | "succeeded" | "failed" | "canceled" = "running";
  let lastAgentName = "Coordinator";
  let openaiResponseId: string | null = null;
  let errorMessage: string | null = null;
  let agentRunResult: unknown | null = null;
  let retrievalContext: DataAgentRetrievalContext | null = null;
  let lastProgressAt = 0;
  let lastProgressConfidence: number | null = null;
  let finalResult: AgentRunWorkflowOutput | null = null;
  let trust: AgentTrustSnapshot | null = null;
  const emitProgress = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressAt < 750) {
      return;
    }
    lastProgressAt = now;
    await persistRunProgress(
      dbRun.id,
      {
        status,
        state,
        finalText,
        lastAgentName,
        confidence: lastProgressConfidence,
        correlationId: params.correlationId,
      },
      startedAtMs,
      inputHash,
    );
  };

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured on the worker.");
    }

    retrievalContext = await buildRetrievalContext({
      runId: dbRun.id,
      queryIntent,
      firstUserInput,
    });

    const coordinator = createIntentAwareCoordinator(queryIntent);
    const agentInput = buildAgentInputItems(input) as Parameters<typeof run>[1];
    const result = await run(
      coordinator,
      agentInput,
      buildAgentStreamRunOptions({
        conversationId: params.conversationId,
        maxTurns: params.maxTurns,
      }) as Parameters<typeof run>[2],
    );
    agentRunResult = result;

    if (isAsyncIterable(result)) {
      for await (const event of result) {
        const current = isRecord(event) ? (event as Record<string, unknown>) : null;
        if (!current) continue;
        const eventType = current.type;
        if (typeof eventType !== "string") continue;

        if (eventType === "agent_updated_stream_event") {
          const agentName =
            isRecord(current.agent) && typeof current.agent?.name === "string"
              ? (current.agent?.name as string)
              : "Coordinator";
          lastAgentName = agentName;
          continue;
        }

        if (eventType === "raw_model_stream_event") {
          const data = current.data;
          if (isRecord(data)) {
            const delta = typeof data.delta === "string" ? data.delta : undefined;
            if (delta) {
              finalText += delta;
              await emitProgress();
            }
          }
          continue;
        }

        const toolName = getToolName(current);
        if (toolName) {
          state.toolsInvoked.add(toolName);
          const output = extractToolOutput(current);
          if (output !== null) {
            collectToolOutputSignals(toolName, output, state);
          }
          await emitProgress();
          continue;
        }

        if (eventType === "error" && typeof current.error === "string") {
          errorMessage = current.error;
          state.missingEvidence.add(`Agent error: ${current.error}`);
        }
      }
    } else if (isRecord(agentRunResult) && "finalOutput" in agentRunResult) {
      const finalOutputText = sanitizeOutputText(
        (agentRunResult as Record<string, unknown>).finalOutput,
      );
      if (finalOutputText.length > 0) {
        finalText = finalOutputText;
      }
    }

    const finalOutputRaw =
      isRecord(agentRunResult) && "finalOutput" in agentRunResult
        ? (agentRunResult as Record<string, unknown>).finalOutput
        : undefined;
    if (!finalText && finalOutputRaw !== undefined) {
      finalText = sanitizeOutputText(finalOutputRaw);
    }

    if (
      agentRunResult !== null &&
      isRecord(agentRunResult) &&
      typeof (agentRunResult as Record<string, unknown>).lastResponseId === "string"
    ) {
      openaiResponseId =
        (agentRunResult as Record<string, unknown>).lastResponseId as string;
    }

    status = "succeeded";
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message : "Agent execution failed";
    state.toolErrorMessages.push(errorMessage);
    state.missingEvidence.add(`Execution failure: ${errorMessage}`);
  } finally {
    if (status === "succeeded") {
      const parsed = safeParseJson(finalText);
      if (!isRecord(parsed)) {
      const reason = "Final agent output is not a valid JSON object.";
        errorMessage ??= reason;
        state.toolErrorMessages.push(`final_report: ${reason}`);
        state.missingEvidence.add("Final agent report did not parse as JSON.");
        status = "failed";
      } else {
        const validation = AgentReportSchema.safeParse(parsed);
        if (!validation.success) {
          const reason = validation.error.issues
            .map((issue) => {
              const path = issue.path.length ? issue.path.join(".") : "root";
              return `${path} ${issue.message}`;
            })
            .join("; ");
          const message = `Final agent report failed schema validation: ${reason}`;
          errorMessage ??= message;
          state.toolErrorMessages.push(`final_report: ${reason}`);
          state.missingEvidence.add("Final agent report failed schema validation.");
          status = "failed";
        } else {
          finalReport = validation.data;
          finalText = JSON.stringify(finalReport, null, 2);
        }
      }
    }

    const proofViolations = evaluateProofCompliance(queryIntent, state.toolsInvoked);
    const failedProofViolations = proofViolations.filter(
      (violation) => violation.missingTools.length > 0,
    );
    const proofChecks = getProofGroupsForIntent(queryIntent).map((group) => {
      const failed = failedProofViolations.some(
        (violation) => violation.group.label === group.label,
      );
      return `${group.label}:${failed ? "missing" : "satisfied"}`;
    });
    for (const violation of failedProofViolations) {
      state.missingEvidence.add(
        `Proof group "${violation.group.label}" requires one of: ${violation.group.tools.join(", ")}`,
      );
    }
    if (failedProofViolations.length > 0 && status === "succeeded") {
      status = "failed";
      const proofMessage = failedProofViolations
        .map((violation) => `Proof path missing required group: ${violation.group.label}`)
        .join("; ");
      errorMessage ??= proofMessage;
      state.toolErrorMessages.push(`proof_enforcement: ${proofMessage}`);
    }

    const missingEvidence = finalizeMissingEvidence(state);
    const evidenceRetryPolicy = buildMissingEvidenceRetryPolicy(
      params,
      missingEvidence.length,
      status,
    );
    const normalizedEvidenceCitations = dedupeEvidenceCitations(state.evidenceCitations);
    const autoFeedEvidenceCitations = normalizedEvidenceCitations.map(normalizeCitationForAutoFeed);
    const evidenceHash = computeEvidenceHash(autoFeedEvidenceCitations);
    const confidenceCandidate =
      status === "failed"
        ? null
        : parseConfidenceFromOutput(
            (agentRunResult && isRecord(agentRunResult) && "finalOutput" in agentRunResult
              ? (agentRunResult as Record<string, unknown>).finalOutput
              : undefined) ??
              safeParseJson(finalText) ??
              (finalText.length > 0 ? finalText : null),
          );
      const confidence =
        status === "failed"
          ? 0.25
          : confidenceCandidate ?? (state.toolErrorMessages.length > 0 ? 0.45 : 0.72);

    trust = {
      toolsInvoked: [...state.toolsInvoked].sort(),
      packVersionsUsed: [...state.packVersionsUsed].sort(),
      evidenceCitations: normalizedEvidenceCitations,
      evidenceHash,
      confidence: Math.max(0, Math.min(1, confidence)),
      missingEvidence,
      verificationSteps: buildVerificationSteps(missingEvidence),
      lastAgentName,
      errorSummary: errorMessage,
      durationMs: Date.now() - startedAtMs,
      toolFailures: state.toolErrorMessages,
      proofChecks,
      retryAttempts: params.retryAttempts ?? 1,
      retryMaxAttempts: params.retryMaxAttempts ?? (params.retryAttempts ?? 1),
      retryMode: params.retryMode ?? "temporal",
      evidenceRetryPolicy,
      fallbackLineage: params.fallbackLineage ?? [],
      fallbackReason: params.fallbackReason ?? undefined,
    };
    lastProgressConfidence = trust.confidence;

    if (status !== "succeeded") {
      const fallback = buildFallbackOutput(status, missingEvidence);
      if (!finalText || finalText.length === 0) {
        finalText = fallback;
      }
    }

    const evidenceCitationsJson = normalizedEvidenceCitations.map((citation) => ({
      tool: citation.tool ?? null,
      sourceId: citation.sourceId ?? null,
      snapshotId: citation.snapshotId ?? null,
      contentHash: citation.contentHash ?? null,
      url: citation.url ?? null,
      isOfficial: citation.isOfficial ?? null,
    }));

    const outputJson: Prisma.InputJsonValue = {
      toolsInvoked: trust.toolsInvoked,
      packVersionsUsed: trust.packVersionsUsed,
      evidenceCitations: evidenceCitationsJson,
      evidenceHash: trust.evidenceHash ?? null,
      confidence: trust.confidence,
      missingEvidence: trust.missingEvidence,
      verificationSteps: trust.verificationSteps,
      lastAgentName: trust.lastAgentName,
      errorSummary: trust.errorSummary,
      durationMs: trust.durationMs,
      toolFailures: trust.toolFailures,
      proofChecks: trust.proofChecks,
      retryAttempts: trust.retryAttempts,
      retryMaxAttempts: trust.retryMaxAttempts,
      retryMode: trust.retryMode,
      evidenceRetryPolicy: trust.evidenceRetryPolicy,
      fallbackLineage: trust.fallbackLineage,
      fallbackReason: trust.fallbackReason,
      retrievalContext: retrievalContext ?? undefined,
      finalReport: finalReport,
      correlationId: params.correlationId,
    };

    await emitProgress(true);

    const finalRunState: AgentRunState = {
      schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
      runId: dbRun.id,
      status,
      partialOutput: finalText,
      lastAgentName,
      toolsInvoked: trust.toolsInvoked,
      confidence: trust.confidence,
      missingEvidence: trust.missingEvidence,
      durationMs: trust.durationMs,
      lastUpdatedAt: new Date().toISOString(),
      runStartedAt: new Date(startedAtMs).toISOString(),
      runInputHash: inputHash,
      leaseOwner: "agent-runner",
      leaseExpiresAt: new Date().toISOString(),
      toolFailures: trust.toolFailures,
      proofChecks: trust.proofChecks,
      retryAttempts: trust.retryAttempts,
      retryMaxAttempts: trust.retryMaxAttempts,
      retryMode: trust.retryMode,
      evidenceRetryPolicy: trust.evidenceRetryPolicy,
      fallbackLineage: trust.fallbackLineage,
      fallbackReason: trust.fallbackReason,
      retrievalContext: retrievalContext ?? undefined,
      correlationId: params.correlationId,
    };

  await prisma.run.update({
      where: { id: dbRun.id },
      data: {
        status,
        finishedAt: new Date(),
        openaiResponseId,
        outputJson: {
          ...outputJson,
          runState: finalRunState,
        },
      },
    });

    void autoFeedRun({
      runId: dbRun.id,
      runType: params.runType ?? "ENRICHMENT",
      agentIntent:
        (params.input
          .find((entry): entry is Extract<(typeof params.input)[number], { role: "user" }> =>
            entry.role === "user")
          ?.content?.slice?.(0, 280) as string | undefined) ?? "agent run",
      finalOutputText: finalText,
      finalReport: finalReport ? (finalReport as unknown as Record<string, unknown>) : null,
      confidence: trust?.confidence ?? (status === "succeeded" ? 0.5 : 0.25),
      evidenceHash:
        trust?.evidenceHash ?? computeEvidenceHash(autoFeedEvidenceCitations) ?? "no-evidence-hash",
      toolsInvoked: trust?.toolsInvoked ?? Array.from(state.toolsInvoked),
      evidenceCitations: (trust?.evidenceCitations ?? autoFeedEvidenceCitations).map(
        normalizeCitationForAutoFeed,
      ),
      retrievalMeta: {
        runId: dbRun.id,
        queryIntent,
        status,
        schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
        retrievalContext: retrievalContext ?? null,
        retrievalSummary: summarizeRetrievalContext(retrievalContext),
      },
      subjectId: dbRun.id,
      autoScore: trust?.confidence,
    }).catch((error: unknown) => {
      console.warn("Data Agent auto-feed failed after temporal run", {
        runId: dbRun.id,
        error: String(error),
      });
    });

    finalResult = {
      runId: dbRun.id,
      correlationId: params.correlationId ?? undefined,
      status,
      finalOutput: finalText,
      finalReport: finalReport ?? null,
      toolsInvoked: trust.toolsInvoked,
      trust,
      openaiResponseId,
      inputHash,
    };
  }

  return finalResult ?? {
    runId: dbRun.id,
    correlationId: params.correlationId ?? undefined,
    status: "failed",
    finalOutput: finalText,
    finalReport: null,
    toolsInvoked: trust?.toolsInvoked ?? [],
    trust: trust ?? {
      toolsInvoked: [],
      packVersionsUsed: [],
      evidenceCitations: [],
      confidence: 0.35,
      missingEvidence: ["Execution did not produce a final trust snapshot."],
      verificationSteps: ["Retry execution with a fresh temporal run."],
      durationMs: Date.now() - startedAtMs,
      errorSummary: errorMessage ?? "Execution failed before trust generation.",
      evidenceHash: null,
    },
    openaiResponseId,
    inputHash,
  };
}

function normalizeCitationForAutoFeed(
  citation: {
    tool?: string;
    sourceId?: string;
    snapshotId?: string;
    contentHash?: string;
    url?: string;
    isOfficial?: boolean;
  },
): EvidenceCitation {
  return {
    tool: citation.tool,
    sourceId: citation.sourceId,
    snapshotId: citation.snapshotId,
    contentHash: citation.contentHash,
    url: citation.url,
    isOfficial: citation.isOfficial,
  };
}

async function buildRetrievalContext(params: {
  runId: string;
  queryIntent?: string;
  firstUserInput?: string;
}): Promise<DataAgentRetrievalContext | null> {
  const query =
    typeof params.queryIntent === "string" && params.queryIntent.trim().length > 0
      ? params.queryIntent
      : typeof params.firstUserInput === "string"
        ? params.firstUserInput
        : null;

  if (!query) {
    return null;
  }

  try {
    const retrievalResults = await unifiedRetrieval(query, params.runId);
    const topResults = retrievalResults.slice(0, DATA_AGENT_RETRIEVAL_LIMIT);
    const sources = {
      semantic: 0,
      sparse: 0,
      graph: 0,
    };

    return {
      query,
      subjectId: params.runId,
      generatedAt: new Date().toISOString(),
      results: topResults.map((result) => {
        if (result.source in sources) {
          sources[result.source] += 1;
        }
        return {
          id: result.id,
          source: result.source,
          text: result.text,
          score: result.score,
          metadata: isRecord(result.metadata) ? result.metadata : { metadata: result.metadata },
        };
      }),
      sources,
    };
  } catch (error) {
    console.warn("Failed to compute retrieval context for temporal run", {
      runId: params.runId,
      error: String(error),
    });
    return {
      query,
      subjectId: params.runId,
      generatedAt: new Date().toISOString(),
      results: [],
      sources: {
        semantic: 0,
        sparse: 0,
        graph: 0,
      },
    };
  }
}

function summarizeRetrievalContext(context: DataAgentRetrievalContext | null): Record<string, unknown> {
  if (!context) {
    return {
      query: null,
      resultCount: 0,
      sources: {
        semantic: 0,
        sparse: 0,
        graph: 0,
      },
      topResultCount: 0,
    };
  }

  return {
    query: context.query,
    resultCount: context.results.length,
    sources: context.sources,
    topResultCount: Math.min(context.results.length, DATA_AGENT_RETRIEVAL_LIMIT),
    topResultIds: context.results.map((result) => result.id),
  };
}
