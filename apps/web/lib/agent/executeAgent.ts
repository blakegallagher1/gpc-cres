import { assistant as assistantMessage, run, RunState, user as userMessage } from "@openai/agents";
import {
  AgentReport,
  AgentReportSchema,
  AGENT_RUN_STATE_KEYS,
  AGENT_RUN_STATE_SCHEMA_VERSION,
  DATA_AGENT_RETRIEVAL_LIMIT,
  extractRequestedParish,
  extractAddressSignature,
  isMaterialAddressMismatch,
  isParishScopedParcelRequest,
  MISSING_PARISH_DIMENSION_CODE,
  normalizeAddressComparable,
  normalizeOpenAiConversationId,
  PARISH_VERIFIED_ROWS_EMPTY_CODE,
  shouldRequireAddressMemoryLookup,
  shouldRequireStoreMemory,
  shouldTreatAsKnowledgeIngestionOnly,
  shouldTreatAsMemoryIngestionOnly,
  type AgentInputMessage,
  type AgentStreamEvent,
  type DataAgentRetrievalContext,
  type AgentEvidenceRetryPolicy,
  type AgentRunOutputJson,
  type AgentRunState,
  toDatabaseRunId,
} from "@entitlement-os/shared";
import type { AgentTrustEnvelope } from "@entitlement-os/shared/agent-trust";
import {
  computeEvidenceHash,
  dedupeEvidenceCitations,
  type EvidenceCitation,
} from "@entitlement-os/shared/evidence";
import { hashJsonSha256 } from "@entitlement-os/shared/crypto";
import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import {
  buildAgentStreamRunOptions,
  collapseRepeatedTextArtifacts,
  createTrajectoryRecorder,
  captureAgentError,
  captureAgentWarning,
  createConfiguredCoordinator,
  extractUsageSummary,
  evaluateProofCompliance,
  inferQueryIntentFromDealContext,
  inferQueryIntentFromText,
  isAgentOsFeatureEnabled,
  maybeTrimToolOutput,
  type QueryIntent,
  getProofGroupsForIntent,
  serializeRunStateEnvelope,
  setupAgentTracing,
} from "@entitlement-os/openai";
import type { MapActionPayload } from "@entitlement-os/shared/map-action-types";
import { parseToolResultMapFeatures } from "@/lib/chat/toolResultWrapper";
import { isSchemaDriftError } from "@/lib/api/prismaSchemaFallback";
import { isLocalAppRuntime } from "@/lib/server/appDbEnv";
import { getDealReaderById } from "@/lib/services/deal-reader";
import { logger } from "./loggerAdapter";
import { runAgentPostRunEffects } from "./agentPostRunEffects";
import { applyAgentToolPolicy } from "./agentToolPolicy";
import {
  type AgentExecutionResult,
  persistFinalRunResult,
  readSerializedRunStateFromStoredValue,
  upsertRunRecord,
} from "./agentRunPersistence";
import {
  emitAgentSummary,
  emitAgentSwitch,
  emitDone,
  emitError,
  emitHandoff,
  emitMapActionsFromToolResult,
  emitTextDelta,
  emitToolApprovalRequested,
  emitToolEnd,
  emitToolStart,
} from "./agentStreamEmitter";
import { buildFinalTrust, buildPendingApprovalTrust } from "./agentTrust";
import {
  buildResearchRoutingMessage,
  type ResearchLaneSelection,
} from "./researchRouting";
import { unifiedRetrieval } from "./retrievalAdapter";

type CuaModelPreference = "gpt-5.4" | "gpt-5.4-mini";

export type { AgentInputMessage, AgentStreamEvent } from "@entitlement-os/shared";

export type AgentExecutionParams = {
  orgId: string;
  userId: string;
  conversationId?: string;
  input: AgentInputMessage[];
  runId?: string;
  runType?: string;
  maxTurns?: number;
  dealId?: string;
  jurisdictionId?: string;
  sku?: string;
  intentHint?: string;
  /** When set, use this instead of inferring from intentHint. */
  queryIntentOverride?: QueryIntent;
  researchLaneOverride?: ResearchLaneSelection;
  onEvent?: (event: AgentStreamEvent) => void;
  correlationId?: string;
  preferredCuaModel?: CuaModelPreference;
  retryMode?: string;
  retryAttempts?: number;
  retryMaxAttempts?: number;
  fallbackLineage?: string[];
  fallbackReason?: string;
  executionLeaseToken?: string;
  resumedRunState?: string;
  previousResponseId?: string | null;
  toolApprovalDecision?: {
    toolCallId: string;
    action: "approve" | "reject";
  };
  skipRunPersistence?: boolean;
};

export { toDatabaseRunId } from "@entitlement-os/shared";

const MISSING_EVIDENCE_RETRY_THRESHOLD = 3;
const MISSING_EVIDENCE_RETRY_MAX_ATTEMPTS = 3;
const MISSING_EVIDENCE_RETRY_MODE = "missing-evidence-policy";
const MEMORY_ENFORCEMENT_MAX_RETRIES = 1;

type ToolEventState = {
  toolsInvoked: Set<string>;
  packVersionsUsed: Set<string>;
  evidenceCitations: EvidenceCitation[];
  missingEvidence: Set<string>;
  toolErrorMessages: string[];
  hadOutputText: boolean;
  didEmitTextDelta: boolean;
  memoryConflictSummaries: string[];
  parcelAddressMismatchSummaries: string[];
  browserTaskSuccessCount: number;
  browserTaskVerifiedDataLaneCount: number;
  browserTaskServiceUnavailableCount: number;
  browserTaskSuggestedLane: ResearchLaneSelection | null;
  parishTieredQueryObserved: boolean;
  parishVerifiedParcelRowsMax: number;
};

type AgentRunAttemptState = {
  agentRunResult: unknown | null;
  finalOutputRaw: unknown;
  finalText: string;
  pendingApprovalState: {
    serializedRunState: string;
    queryIntent: string;
    toolCallId: string | null;
    toolName: string | null;
  } | null;
};

function summarizeToolEventState(state: ToolEventState) {
  return {
    toolCount: state.toolsInvoked.size,
    toolFailureCount: state.toolErrorMessages.length,
    missingEvidenceCount: state.missingEvidence.size,
    memoryConflictCount: state.memoryConflictSummaries.length,
    addressMismatchCount: state.parcelAddressMismatchSummaries.length,
    browserTaskServiceUnavailableCount: state.browserTaskServiceUnavailableCount,
    parishTieredQueryObserved: state.parishTieredQueryObserved,
    parishVerifiedParcelRowsMax: state.parishVerifiedParcelRowsMax,
  };
}

function buildAgentRuntimeLogContext(
  params: AgentExecutionParams,
  runId: string,
  queryIntent: QueryIntent,
) {
  return {
    runId,
    orgId: params.orgId,
    userId: params.userId,
    dealId: params.dealId ?? null,
    conversationId: params.conversationId ?? null,
    correlationId: params.correlationId ?? null,
    queryIntent,
    researchLane: params.researchLaneOverride ?? "auto",
    retryMode: params.retryMode ?? "local",
    retryAttempts: params.retryAttempts ?? 1,
    retryMaxAttempts: params.retryMaxAttempts ?? (params.retryAttempts ?? 1),
    resumed: Boolean(params.resumedRunState),
    hasToolApprovalDecision: Boolean(params.toolApprovalDecision),
    preferredCuaModel: params.preferredCuaModel ?? null,
  };
}

type AgentRunInput =
  | ReturnType<typeof buildAgentInputItems>
  | RunState<unknown, ReturnType<typeof createConfiguredCoordinator>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildAgentInputItems(input: AgentInputMessage[]) {
  return input.map((entry) => {
    if (entry.role === "user") {
      return userMessage(entry.content);
    }

    return assistantMessage(
      entry.content.map((segment) => ({
        type: segment.type,
        text: segment.text,
      })),
    );
  });
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    isRecord(value) &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === "function"
  );
}

function safeParseJson(value: unknown): unknown | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseFinalOutputJsonObject(value: string): Record<string, unknown> | null {
  const parseCandidate = (candidate: string): Record<string, unknown> | null => {
    const parsed = safeParseJson(candidate.trim());
    return isRecord(parsed) ? parsed : null;
  };

  const direct = parseCandidate(value);
  if (direct) return direct;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const fencedJsonPattern = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  for (const match of trimmed.matchAll(fencedJsonPattern)) {
    const candidate = parseCandidate(match[1] ?? "");
    if (candidate) {
      return candidate;
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = parseCandidate(trimmed.slice(firstBrace, lastBrace + 1));
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value > 1 && value <= 100) return value / 100;
  if (value >= 0 && value <= 1) return value;
  return null;
}

function parseEvidenceRetryPolicy(
  value: unknown,
): AgentEvidenceRetryPolicy | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.enabled !== "boolean") return undefined;
  if (typeof value.threshold !== "number" || !Number.isFinite(value.threshold)) return undefined;
  if (typeof value.missingEvidenceCount !== "number" || !Number.isFinite(value.missingEvidenceCount)) return undefined;
  if (typeof value.attempts !== "number" || !Number.isFinite(value.attempts)) return undefined;
  if (typeof value.maxAttempts !== "number" || !Number.isFinite(value.maxAttempts)) return undefined;
  if (typeof value.shouldRetry !== "boolean") return undefined;
  if (typeof value.nextAttempt !== "number" || !Number.isFinite(value.nextAttempt)) return undefined;
  if (typeof value.nextRetryMode !== "string" || value.nextRetryMode.length === 0) return undefined;
  if (typeof value.reason !== "string" || value.reason.length === 0) return undefined;

  return {
    enabled: value.enabled,
    threshold: value.threshold,
    missingEvidenceCount: value.missingEvidenceCount,
    attempts: value.attempts,
    maxAttempts: value.maxAttempts,
    shouldRetry: value.shouldRetry,
    nextAttempt: value.nextAttempt,
    nextRetryMode: value.nextRetryMode,
    reason: value.reason,
  };
}

function parseConfidenceFromOutput(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const primary = normalizeConfidence((value as Record<string, unknown>).confidence);
  if (primary !== null) return primary;
  const overall = normalizeConfidence((value as Record<string, unknown>).overallConfidence);
  if (overall !== null) return overall;
  const score = normalizeConfidence((value as Record<string, unknown>).score);
  if (score !== null) return score;
  const rate = normalizeConfidence((value as Record<string, unknown>).scorecardConfidence);
  if (rate !== null) return rate;
  return null;
}

function isJsonLikeString(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function normalizeJsonLikeValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (!isJsonLikeString(value)) {
      return value;
    }
    return safeParseJson(value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeJsonLikeValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeJsonLikeValue(entry)]),
  );
}

function normalizeBrowserTaskOutput(value: unknown): unknown {
  const normalized = normalizeJsonLikeValue(value);
  if (!isRecord(normalized)) {
    return normalized;
  }

  const data =
    isRecord(normalized.data)
      ? normalized.data
      : isRecord(normalized.finalMessage)
        ? normalized.finalMessage
        : null;

  if (!data) {
    return normalized;
  }

  return {
    ...normalized,
    data,
    finalMessage:
      typeof normalized.finalMessage === "string"
        ? normalized.finalMessage
        : typeof normalized.data === "string"
          ? normalized.data
          : normalized.finalMessage,
  };
}

function toolErrorIsNonCritical(message: string): boolean {
  return message.startsWith("final_report:");
}

function outputSignalsVerifiedDataLane(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const strings: string[] = [];
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const current = queue.pop();
    if (typeof current === "string") {
      strings.push(current);
      continue;
    }
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (isRecord(current)) {
      queue.push(...Object.values(current));
    }
  }

  return /public_api|backing_search_results|api\/[a-z0-9/_-]+|public dataset|verified data lane|embedded_app_url/i.test(
    strings.join("\n"),
  );
}

function normalizeMissingEvidenceForBrowserRun(
  state: ToolEventState,
  missingEvidence: string[],
): string[] {
  if (state.browserTaskVerifiedDataLaneCount === 0) {
    return missingEvidence;
  }

  const criticalToolErrors = state.toolErrorMessages.filter(
    (message) => !toolErrorIsNonCritical(message),
  );

  if (criticalToolErrors.length > 0) {
    return missingEvidence;
  }

  return missingEvidence.filter(
    (item) =>
      item !== "Final agent report did not parse as JSON." &&
      item !== "Final agent report failed schema validation." &&
      item !== "Tool outputs did not include evidence snapshots/citations.",
  );
}

function deriveFallbackConfidence(options: {
  status: AgentExecutionResult["status"];
  confidenceCandidate: number | null;
  state: ToolEventState;
  missingEvidenceCount: number;
}): number {
  const { status, confidenceCandidate, state, missingEvidenceCount } = options;
  if (status === "failed") return 0.25;
  if (confidenceCandidate !== null) return confidenceCandidate;

  const criticalToolErrors = state.toolErrorMessages.filter(
    (message) => !toolErrorIsNonCritical(message),
  );

  if (state.browserTaskSuccessCount > 0) {
    if (
      state.browserTaskVerifiedDataLaneCount > 0 &&
      criticalToolErrors.length === 0 &&
      missingEvidenceCount === 0
    ) {
      return 0.9;
    }
    if (criticalToolErrors.length === 0) {
      return missingEvidenceCount === 0 ? 0.82 : 0.74;
    }
    return 0.6;
  }

  return criticalToolErrors.length > 0 ? 0.45 : 0.72;
}

function buildMissingEvidenceRetryPolicy(
  params: AgentExecutionParams,
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
      : params.retryMode ?? "local",
    reason: shouldRetry
      ? `Missing evidence count (${missingEvidenceCount}) exceeded threshold ${MISSING_EVIDENCE_RETRY_THRESHOLD}.`
      : attempts >= maxAttempts
        ? `Missing evidence policy reached max attempts (${maxAttempts}).`
        : "Policy not triggered.",
  };
}

const GENERIC_TOOL_EVENT_NAMES = new Set([
  "tool_called",
  "tool_call",
  "tool_output",
  "tool_result",
]);

function getDirectToolName(payload: Record<string, unknown>): string | null {
  const toolValueName =
    payload.tool && isRecord(payload.tool) && typeof payload.tool.name === "string"
      ? payload.tool.name
      : null;
  const toolCallValueName =
    payload.toolCall && isRecord(payload.toolCall) && typeof payload.toolCall.name === "string"
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
    payload.fn && isRecord(payload.fn) && typeof payload.fn.name === "string" ? payload.fn.name : null;

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

function getToolName(payload: Record<string, unknown>): string | null {
  const directName = getDirectToolName(payload);
  if (directName && !GENERIC_TOOL_EVENT_NAMES.has(directName.toLowerCase())) {
    return directName;
  }

  const rawItem = extractApprovalRawItem(payload);
  if (rawItem) {
    const rawName = getDirectToolName(rawItem);
    if (rawName) {
      return rawName;
    }
  }

  return directName;
}

function extractToolArgs(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const rawItem = extractApprovalRawItem(payload);
  if (rawItem && typeof rawItem.arguments === "string") {
    const parsedRawArgs = safeParseJson(rawItem.arguments);
    if (isRecord(parsedRawArgs)) {
      return parsedRawArgs;
    }
  }

  const toolArgs =
    payload.toolCall &&
    isRecord(payload.toolCall) &&
    isRecord(payload.toolCall.args)
      ? payload.toolCall.args
      : payload.tool_call &&
        isRecord(payload.tool_call) &&
        isRecord(payload.tool_call.args)
        ? payload.tool_call.args
        : undefined;

  const candidates: unknown[] = [
    payload.args,
    payload.arguments,
    payload.input,
    toolArgs,
  ];

  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const parsed = safeParseJson(candidate);
      if (isRecord(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function extractToolCallId(payload: Record<string, unknown>): string | null {
  const rawItem = extractApprovalRawItem(payload);
  if (rawItem) {
    const rawCallId =
      typeof rawItem.callId === "string"
        ? rawItem.callId
        : typeof rawItem.call_id === "string"
          ? rawItem.call_id
          : typeof rawItem.id === "string"
            ? rawItem.id
            : null;
    if (rawCallId) {
      return rawCallId;
    }
  }

  const toolCallIdNested =
    payload.toolCall &&
    isRecord(payload.toolCall) &&
    typeof payload.toolCall.id === "string"
      ? payload.toolCall.id
      : payload.tool_call &&
        isRecord(payload.tool_call) &&
        typeof payload.tool_call.id === "string"
        ? payload.tool_call.id
        : null;

  const candidates = [
    payload.toolCallId,
    payload.tool_call_id,
    payload.callId,
    payload.call_id,
    toolCallIdNested,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

function extractApprovalRawItem(payload: Record<string, unknown>): Record<string, unknown> | null {
  if (isRecord(payload.rawItem)) return payload.rawItem;
  if (isRecord(payload.raw_item)) return payload.raw_item;
  return null;
}

function extractApprovalItemArgs(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const rawItem = extractApprovalRawItem(payload);
  if (rawItem) {
    const parsedRawArgs = safeParseJson(rawItem.arguments);
    if (isRecord(parsedRawArgs)) return parsedRawArgs;
  }
  const parsedArgs = safeParseJson(payload.arguments);
  if (isRecord(parsedArgs)) return parsedArgs;
  return extractToolArgs(payload);
}

function extractApprovalItemToolCallId(payload: Record<string, unknown>): string | null {
  const rawItem = extractApprovalRawItem(payload);
  if (rawItem) {
    const idCandidate =
      typeof rawItem.callId === "string"
        ? rawItem.callId
        : typeof rawItem.call_id === "string"
          ? rawItem.call_id
          : typeof rawItem.id === "string"
            ? rawItem.id
            : null;
    if (idCandidate) return idCandidate;
  }
  return extractToolCallId(payload);
}

function getAgentNameFromValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (isRecord(value) && typeof value.name === "string" && value.name.trim().length > 0) {
    return value.name;
  }
  return undefined;
}

function extractHandoff(payload: Record<string, unknown>): { from?: string; to?: string } | null {
  const from = getAgentNameFromValue(payload.fromAgent) ??
    getAgentNameFromValue(payload.from_agent) ??
    getAgentNameFromValue(payload.from) ??
    getAgentNameFromValue(payload.previousAgent) ??
    getAgentNameFromValue(payload.previous_agent);
  const to = getAgentNameFromValue(payload.toAgent) ??
    getAgentNameFromValue(payload.to_agent) ??
    getAgentNameFromValue(payload.to) ??
    getAgentNameFromValue(payload.nextAgent) ??
    getAgentNameFromValue(payload.next_agent) ??
    getAgentNameFromValue(payload.agent);

  if (!from && !to) {
    return null;
  }
  return { from, to };
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

function extractSerializedRunStateCandidate(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.state,
    payload.runState,
    payload.run_state,
    payload.serializedRunState,
    payload.serialized_run_state,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
    if (
      isRecord(candidate) &&
      typeof (candidate as { toString?: unknown }).toString === "function"
    ) {
      try {
        const serialized = (candidate as { toString: () => string }).toString();
        if (typeof serialized === "string" && serialized.length > 0) {
          return serialized;
        }
      } catch {
        // no-op
      }
    }
  }

  return null;
}

function collectToolOutputSignals(
  toolName: string,
  output: unknown,
  state: ToolEventState,
  args?: Record<string, unknown>,
) {
  let parsed: unknown =
    toolName === "browser_task"
      ? normalizeBrowserTaskOutput(output)
      : normalizeJsonLikeValue(output);
  if (!isRecord(parsed)) return;

  const asRecord = parsed as Record<string, unknown>;
  if ("version" in asRecord && (asRecord.version || asRecord._meta)) {
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

  const citationFields = {
    snapshotId: asRecord.snapshotId,
    sourceId: asRecord.sourceId,
    contentHash: asRecord.contentHash,
    url: asRecord.url,
    isOfficial: asRecord.isOfficial,
  };
  if (
    Object.values(citationFields).some(
      (value) => value !== undefined && value !== null,
    )
  ) {
    state.evidenceCitations.push({
      tool: toolName,
      sourceId:
        typeof citationFields.sourceId === "string"
          ? citationFields.sourceId
          : undefined,
      snapshotId:
        typeof citationFields.snapshotId === "string"
          ? citationFields.snapshotId
          : undefined,
      contentHash:
        typeof citationFields.contentHash === "string"
          ? citationFields.contentHash
          : undefined,
      url: typeof citationFields.url === "string" ? citationFields.url : undefined,
      isOfficial:
        typeof citationFields.isOfficial === "boolean"
          ? citationFields.isOfficial
          : undefined,
    });
  }

  if (
    typeof asRecord.error === "string" &&
    asRecord.error.toLowerCase().includes("error")
  ) {
    state.toolErrorMessages.push(`${toolName}: ${asRecord.error}`);
    if (
      /missing|not found|failed|timeout|unauthorized|forbidden/i.test(
        asRecord.error,
      )
    ) {
      state.missingEvidence.add(`${toolName}: ${asRecord.error}`);
    }
  }

  if (toolName === "browser_task" && asRecord.success === true) {
    state.browserTaskSuccessCount += 1;
    if (outputSignalsVerifiedDataLane(asRecord)) {
      state.browserTaskVerifiedDataLaneCount += 1;
    }
  }

  if (toolName === "browser_task") {
    if (asRecord.suggestedLane === "public_web" || asRecord.suggestedLane === "interactive_browser") {
      state.browserTaskSuggestedLane = asRecord.suggestedLane;
    }
    if (asRecord.serviceUnavailable === true) {
      state.browserTaskServiceUnavailableCount += 1;
    }
  }

  if (toolName === "store_memory") {
    const decision = typeof asRecord.decision === "string" ? asRecord.decision.toLowerCase() : "";
    const reasons = Array.isArray(asRecord.reasons)
      ? asRecord.reasons.filter((entry): entry is string => typeof entry === "string")
      : [];
    const hasConflictReason = reasons.some((reason) => /conflict/i.test(reason));
    if (decision === "draft" && hasConflictReason) {
      const structured = isRecord(asRecord.structuredMemoryWrite)
        ? (asRecord.structuredMemoryWrite as Record<string, unknown>)
        : null;
      const payload = structured && isRecord(structured.payload)
        ? (structured.payload as Record<string, unknown>)
        : null;
      const saleDate = typeof payload?.sale_date === "string" ? payload.sale_date : null;
      const salePrice = typeof payload?.sale_price === "number" ? payload.sale_price : null;
      const entityId = typeof structured?.entity_id === "string" ? structured.entity_id : null;
      const summaryParts: string[] = [];
      if (entityId) summaryParts.push(`entity ${entityId}`);
      summaryParts.push(reasons.join("; "));
      if (saleDate) summaryParts.push(`sale_date=${saleDate}`);
      if (salePrice !== null) summaryParts.push(`sale_price=${salePrice}`);
      state.memoryConflictSummaries.push(summaryParts.join(" | "));
    }
  }

  if (toolName === "search_parcels") {
    const requestedAddress =
      args && typeof args.search_text === "string"
        ? args.search_text.trim()
        : "";
    const parcels = Array.isArray(asRecord.parcels) ? asRecord.parcels : [];
    const firstParcel = parcels[0];
    const returnedAddress =
      isRecord(firstParcel) && typeof firstParcel.address === "string"
        ? firstParcel.address.trim()
        : "";
    if (
      requestedAddress.length > 0 &&
      returnedAddress.length > 0 &&
      isMaterialAddressMismatch(requestedAddress, returnedAddress)
    ) {
      state.parcelAddressMismatchSummaries.push(
        `requested=${requestedAddress} | returned=${returnedAddress}`,
      );
    }
  }

  if (toolName === "query_property_db_sql") {
    const verification = isRecord(asRecord.verification)
      ? (asRecord.verification as Record<string, unknown>)
      : null;
    const tiers =
      verification && isRecord(verification.tiers)
        ? (verification.tiers as Record<string, unknown>)
        : null;
    const verifiedFromTiers =
      tiers && typeof tiers.verified === "number" && Number.isFinite(tiers.verified)
        ? Math.max(0, Math.trunc(tiers.verified))
        : null;
    const verifiedFromRows = Array.isArray(asRecord.rows) ? asRecord.rows.length : null;
    const verifiedCount = verifiedFromTiers ?? verifiedFromRows;
    const rankingRule =
      verification && typeof verification.rankingRule === "string"
        ? verification.rankingRule
        : null;
    const tieringApplied =
      verification && typeof verification.tieringApplied === "boolean"
        ? verification.tieringApplied
        : false;

    if (rankingRule === "rank_verified_only" || tieringApplied) {
      state.parishTieredQueryObserved = true;
      if (typeof verifiedCount === "number") {
        state.parishVerifiedParcelRowsMax = Math.max(
          state.parishVerifiedParcelRowsMax,
          verifiedCount,
        );
      }
      if (verifiedCount === 0) {
        const signal = `${PARISH_VERIFIED_ROWS_EMPTY_CODE}: no parish-verified parcels available for ranking`;
        state.toolErrorMessages.push(`query_property_db_sql: ${signal}`);
        state.missingEvidence.add(
          "Parish-scoped ranking requires at least one geometry-verified parcel; current result has none.",
        );
      }
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

function hasVerifiedBrowserTaskSuccess(state: ToolEventState): boolean {
  return (
    state.browserTaskSuccessCount > 0 &&
    state.browserTaskVerifiedDataLaneCount > 0
  );
}

function buildRuntimeClockContextMessage(now = new Date()): string {
  const utcIso = now.toISOString();
  const batonRougeDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const batonRougeTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(now);
  return `Runtime Clock Context (authoritative): current UTC timestamp is ${utcIso}. ` +
    `Current Baton Rouge local date/time (America/Chicago) is ${batonRougeDate} ${batonRougeTime}. ` +
    "When reasoning about \"today\", \"future\", or relative dates, use this runtime clock context.";
}

function shouldRequireConflictConfirmation(text: string, state: ToolEventState): boolean {
  if (state.memoryConflictSummaries.length === 0) return false;
  const normalized = text.toLowerCase();
  const hasConfirmationLanguage =
    /confirm|which (?:value|price).*(?:correct)|reconcile|please verify|verify which/i.test(normalized);
  const hasConflictLanguage = /conflict|draft|stored as draft/i.test(normalized);
  return !(hasConfirmationLanguage && hasConflictLanguage);
}

function shouldRequireParcelMismatchGuardrail(text: string, state: ToolEventState): boolean {
  if (state.parcelAddressMismatchSummaries.length === 0) return false;
  const normalized = normalizeAddressComparable(text);
  const hasNearBySubstitutionLanguage = /\b(?:closest|nearby|adjacent|same vicinity)\b/i.test(
    text,
  );
  const citesMismatchedAddress = state.parcelAddressMismatchSummaries.some((summary) => {
    const returnedRaw = summary.split("|").find((part) => part.includes("returned="));
    const returnedAddress = returnedRaw?.replace(/^.*returned=/, "").trim();
    if (!returnedAddress || returnedAddress.length === 0) return false;
    const returnedComparable = normalizeAddressComparable(returnedAddress);
    const returnedSignature = extractAddressSignature(returnedAddress);
    if (returnedSignature && normalized.includes(normalizeAddressComparable(returnedSignature))) {
      return true;
    }
    return normalized.includes(returnedComparable);
  });
  return hasNearBySubstitutionLanguage || citesMismatchedAddress;
}

function hasAddressMemoryLookup(state: ToolEventState): boolean {
  return (
    state.toolsInvoked.has("lookup_entity_by_address") ||
    state.toolsInvoked.has("store_memory") ||
    state.toolsInvoked.has("get_entity_truth") ||
    state.toolsInvoked.has("get_entity_memory")
  );
}

function buildFallbackOutput(
  status: AgentExecutionResult["status"],
  missingEvidence: string[],
): string {
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

function buildParishVerificationRequiredOutput(parish: string | null): string {
  const target = parish ? `${parish} Parish` : "the requested parish";
  return [
    "Verification required before parcel recommendations.",
    "",
    `I cannot rank or shortlist parcels for ${target} from ZIP/address proxy evidence.`,
    "",
    "Required next steps:",
    "- Confirm parcel-to-parish membership from an authoritative parish boundary or assessor source.",
    "- Confirm jurisdiction-specific zoning allowance for mobile home park use.",
    "- Re-run screening only after parish membership is verified parcel-by-parcel.",
  ].join("\n");
}

function hasMissingParishDimensionSignal(values: string[]): boolean {
  return values.some((value) => value.includes(MISSING_PARISH_DIMENSION_CODE));
}

function hasParishVerifiedRowsEmptySignal(values: string[]): boolean {
  return values.some((value) => value.includes(PARISH_VERIFIED_ROWS_EMPTY_CODE));
}

function sanitizeOutputText(value: unknown): string {
  if (typeof value === "string") return collapseRepeatedTextArtifacts(value);
  if (value === null || value === undefined) return "";
  if (isRecord(value)) return JSON.stringify(value);
  try {
    return String(value);
  } catch {
    return "";
  }
}

function buildFallbackAgentReportFromText(params: {
  rawText: string;
  taskSummary: string;
  generatedAt?: string;
}): AgentReport {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const summary = params.rawText.trim().length > 0
    ? params.rawText.trim()
    : "The agent returned an unstructured response.";

  return {
    schema_version: "1.0",
    generated_at: generatedAt,
    task_understanding: {
      summary: params.taskSummary,
      context: "Fallback normalization applied because the coordinator returned non-schema text.",
    },
    execution_plan: {
      summary: "Return a normalized coordinator report and request evidence-backed follow-up if needed.",
      steps: [
        {
          agent: "coordinator",
          responsibility: "Normalize unstructured output into AgentReport schema",
          rationale: "Pipeline requires strict JSON schema output",
        },
      ],
    },
    agent_outputs: [
      {
        agent: "coordinator",
        summary,
        confidence: 0.35,
      },
    ],
    synthesis: {
      recommendation: summary,
      rationale: "Generated from fallback normalization of non-JSON model output.",
      confidence: 0.35,
    },
    key_assumptions: [
      "Original model output did not match strict AgentReport JSON schema.",
    ],
    uncertainty_map: [
      {
        area: "Output structure",
        impact: "Confidence is reduced due to schema fallback.",
        mitigation: "Re-run with stronger tool-use and structured-output guidance.",
        reducible: true,
      },
    ],
    next_steps: [
      {
        action: "Re-run with explicit evidence tooling and schema-constrained output",
        owner: "Coordinator",
        priority: "high",
      },
    ],
    sources: [],
  };
}

type RunRecordSnapshot = {
  id: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  inputHash: string;
  outputJson: Prisma.JsonValue;
  serializedState: Prisma.JsonValue | null;
  openaiResponseId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

function toArrayOfString(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function parseTrustFromRunOutput(output: unknown): AgentTrustEnvelope {
  if (!isRecord(output)) {
    return {
      toolsInvoked: [],
      packVersionsUsed: [],
      evidenceCitations: [],
      evidenceHash: null,
      confidence: 0,
      missingEvidence: [],
      verificationSteps: [],
      lastAgentName: undefined,
      errorSummary: null,
      evidenceRetryPolicy: undefined,
      toolFailures: [],
      proofChecks: [],
      retryAttempts: undefined,
      retryMaxAttempts: undefined,
      retryMode: undefined,
      fallbackLineage: undefined,
      fallbackReason: undefined,
    };
  }

  const evidenceCitations = Array.isArray(output.evidenceCitations)
    ? (output.evidenceCitations as unknown[]).map((citation) => {
        if (!isRecord(citation)) return null;
        return {
          tool: typeof citation.tool === "string" ? citation.tool : undefined,
          sourceId: typeof citation.sourceId === "string" ? citation.sourceId : undefined,
          snapshotId: typeof citation.snapshotId === "string" ? citation.snapshotId : undefined,
          contentHash:
            typeof citation.contentHash === "string" ? citation.contentHash : undefined,
          url: typeof citation.url === "string" ? citation.url : undefined,
          isOfficial: typeof citation.isOfficial === "boolean" ? citation.isOfficial : undefined,
        };
      }).filter(Boolean)
    : [];

  const trust: AgentTrustEnvelope = {
    toolsInvoked: toArrayOfString(output.toolsInvoked),
    packVersionsUsed: toArrayOfString(output.packVersionsUsed),
    evidenceCitations: evidenceCitations as AgentTrustEnvelope["evidenceCitations"],
    confidence:
      typeof output.confidence === "number" && Number.isFinite(output.confidence)
        ? Math.max(0, Math.min(1, output.confidence))
        : 0,
    researchLane:
      output.researchLane === "auto" ||
      output.researchLane === "local_first" ||
      output.researchLane === "public_web" ||
      output.researchLane === "interactive_browser"
        ? output.researchLane
        : undefined,
    missingEvidence: toArrayOfString(output.missingEvidence),
    verificationSteps: toArrayOfString(output.verificationSteps),
    lastAgentName:
      typeof output.lastAgentName === "string" ? output.lastAgentName : undefined,
    errorSummary: typeof output.errorSummary === "string" ? output.errorSummary : null,
    evidenceRetryPolicy: parseEvidenceRetryPolicy(output.evidenceRetryPolicy),
    evidenceHash:
      typeof output.evidenceHash === "string" ? output.evidenceHash : null,
    durationMs: typeof output.durationMs === "number" && Number.isFinite(output.durationMs)
      ? output.durationMs
      : undefined,
    toolFailures: toArrayOfString(output.toolFailures),
    proofChecks: toArrayOfString(output.proofChecks),
    retryAttempts:
      typeof output.retryAttempts === "number" && Number.isFinite(output.retryAttempts)
        ? output.retryAttempts
        : undefined,
    retryMaxAttempts:
      typeof output.retryMaxAttempts === "number" &&
      Number.isFinite(output.retryMaxAttempts)
        ? output.retryMaxAttempts
        : undefined,
    retryMode: typeof output.retryMode === "string" ? output.retryMode : undefined,
    fallbackLineage: toArrayOfString(output.fallbackLineage),
    fallbackReason:
      typeof output.fallbackReason === "string" ? output.fallbackReason : undefined,
  };

  return trust;
}

function runRecordToExecutionResult(dbRun: RunRecordSnapshot): AgentExecutionResult {
  const output = isRecord(dbRun.outputJson) ? dbRun.outputJson : {};
  const runState = isRecord(output.runState) ? output.runState : {};
  const finalOutput =
    typeof output.finalOutput === "string"
      ? output.finalOutput
      : typeof runState[AGENT_RUN_STATE_KEYS.partialOutput] === "string"
      ? String(runState[AGENT_RUN_STATE_KEYS.partialOutput])
      : "";
  const finalReport =
    isRecord(output.finalReport) ? (output.finalReport as AgentReport) : null;

  return {
    runId: dbRun.id,
    status: dbRun.status,
    finalOutput,
    finalReport,
    toolsInvoked: toArrayOfString(output.toolsInvoked),
    trust: parseTrustFromRunOutput(output),
    openaiResponseId: dbRun.openaiResponseId,
    inputHash: dbRun.inputHash,
    startedAt: dbRun.startedAt,
    finishedAt: dbRun.finishedAt ?? new Date(),
  };
}

async function loadRunExecutionResult(runId: string): Promise<AgentExecutionResult | null> {
  const runRecord = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      inputHash: true,
      outputJson: true,
      serializedState: true,
      openaiResponseId: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  if (!runRecord) return null;
  return runRecordToExecutionResult(runRecord as RunRecordSnapshot);
}

export async function executeAgentWorkflow(
  params: AgentExecutionParams,
): Promise<AgentExecutionResult> {
  setupAgentTracing();

  const startedAt = new Date();
  const startedAtMs = startedAt.getTime();
  const inputHash = hashJsonSha256({
    orgId: params.orgId,
    userId: params.userId,
    conversationId: params.conversationId,
    runType: params.runType ?? "ENRICHMENT",
    dealId: params.dealId ?? null,
    jurisdictionId: params.jurisdictionId ?? null,
    previousResponseId: params.previousResponseId ?? null,
    preferredCuaModel: params.preferredCuaModel ?? null,
    input: params.input,
  });
  const firstUserInput = params.input.find((entry) => entry.role === "user")?.content;
  const userTextForIntent = params.intentHint ?? firstUserInput;
  const requireStoreMemory = shouldRequireStoreMemory(userTextForIntent);
  const requireAddressMemoryLookup = shouldRequireAddressMemoryLookup(userTextForIntent);
  const memoryIngestionOnly = shouldTreatAsMemoryIngestionOnly(userTextForIntent);
  const knowledgeIngestionOnly = shouldTreatAsKnowledgeIngestionOnly(userTextForIntent);
  const ingestionOnly = memoryIngestionOnly || knowledgeIngestionOnly;
  const dealRoutingContext =
    params.queryIntentOverride || !params.dealId
      ? null
      : await getDealReaderById(params.orgId, params.dealId);
  const queryIntent =
    params.queryIntentOverride ??
    inferQueryIntentFromDealContext(dealRoutingContext) ??
    inferQueryIntentFromText(userTextForIntent);
  const skipRunPersistence = params.skipRunPersistence === true;
  const runId = toDatabaseRunId(
    params.runId ??
      `agent-run-${hashJsonSha256({ inputHash, runType: params.runType ?? "ENRICHMENT" })}`,
  );

  if (!skipRunPersistence && params.runId) {
    const existingRun = (await prisma.run.findUnique({
      where: { id: runId },
      select: {
        id: true,
        status: true,
        inputHash: true,
        outputJson: true,
        serializedState: true,
        openaiResponseId: true,
        startedAt: true,
        finishedAt: true,
      },
    })) as RunRecordSnapshot | null;

    if (existingRun && existingRun.status !== "running") {
      return runRecordToExecutionResult(existingRun);
    }
  }

  const dbRun: RunRecordSnapshot = skipRunPersistence
    ? {
        id: runId,
        status: "running",
        inputHash,
        outputJson: {},
        serializedState: null,
        openaiResponseId: params.executionLeaseToken ?? null,
        startedAt,
        finishedAt: null,
      }
    : ((await upsertRunRecord({
        runId,
        orgId: params.orgId,
        runType: params.runType ?? "ENRICHMENT",
        dealId: params.dealId ?? null,
        jurisdictionId: params.jurisdictionId ?? null,
        sku: params.sku ?? null,
        inputHash,
        status: "running",
      })) as RunRecordSnapshot);

  const state: ToolEventState = {
    toolsInvoked: new Set(),
    packVersionsUsed: new Set(),
    evidenceCitations: [],
    missingEvidence: new Set(),
    toolErrorMessages: [],
    hadOutputText: false,
    didEmitTextDelta: false,
    memoryConflictSummaries: [],
    parcelAddressMismatchSummaries: [],
    browserTaskSuccessCount: 0,
    browserTaskVerifiedDataLaneCount: 0,
    browserTaskServiceUnavailableCount: 0,
    browserTaskSuggestedLane: null,
    parishTieredQueryObserved: false,
    parishVerifiedParcelRowsMax: 0,
  };
  const trajectoryRecorder = createTrajectoryRecorder();

  let finalText = "";
  let finalReport: AgentReport | null = null;
  let status: AgentExecutionResult["status"] = "running";
  let lastAgentName = "Coordinator";
  let openaiResponseId: string | null = null;
  let errorMessage: string | null = null;
  let agentRunResult: unknown | null = null;
  let retrievalContext: DataAgentRetrievalContext | null = null;
  let pendingApprovalState: {
    serializedRunState: string;
    queryIntent: string;
    toolCallId: string | null;
    toolName: string | null;
  } | null = null;
  let latestSerializedRunState: string | null =
    readSerializedRunStateFromStoredValue(dbRun.serializedState) ?? null;

  const emit = (event: AgentStreamEvent) => {
    if (trajectoryRecorder) {
      switch (event.type) {
        case "agent_switch":
          trajectoryRecorder.record({
            kind: "agent_switch",
            agentName: event.agentName,
          });
          break;
        case "handoff":
          trajectoryRecorder.record({
            kind: "handoff",
            agentName: event.to,
            details: {
              from: event.from ?? null,
              to: event.to,
            },
          });
          break;
        case "tool_start":
          trajectoryRecorder.record({
            kind: "tool_start",
            toolName: event.name,
            details: {
              toolCallId: event.toolCallId ?? null,
            },
          });
          break;
        case "tool_end":
          trajectoryRecorder.record({
            kind: "tool_end",
            toolName: event.name,
            details: {
              toolCallId: event.toolCallId ?? null,
              status: event.status ?? null,
            },
          });
          break;
        case "text_delta":
          trajectoryRecorder.record({
            kind: "text_delta",
            details: {
              length: event.content.length,
            },
          });
          break;
        case "error":
          trajectoryRecorder.record({
            kind: "error",
            details: {
              message: event.message,
            },
          });
          break;
        default:
          break;
      }
    }
    params.onEvent?.(event);
  };

  const persistCheckpoint = async (checkpoint: {
    kind: "tool_completion" | "approval_pending" | "resume_request" | "final_result";
    toolName?: string | null;
    toolCallId?: string | null;
    partialOutput?: string;
    note?: string;
  }) => {
    if (skipRunPersistence) return;
    if (!latestSerializedRunState) return;
    const serializedState = serializeRunStateEnvelope({
      serializedRunState: latestSerializedRunState,
      checkpoint: {
        kind: checkpoint.kind,
        at: new Date().toISOString(),
        runId: dbRun.id,
        toolName: checkpoint.toolName ?? null,
        toolCallId: checkpoint.toolCallId ?? null,
        lastAgentName,
        correlationId: params.correlationId,
        partialOutput: checkpoint.partialOutput,
        note: checkpoint.note,
      },
    }) as unknown as Prisma.InputJsonValue;

    const updateResult = params.executionLeaseToken
      ? await prisma.run.updateMany({
          where: { id: dbRun.id, openaiResponseId: params.executionLeaseToken },
          data: {
            serializedState,
          },
        })
      : { count: 1 };

    if (!params.executionLeaseToken || updateResult.count === 1) {
      if (!params.executionLeaseToken) {
        await prisma.run.update({
          where: { id: dbRun.id },
          data: {
            serializedState,
          },
        });
      }
    }
  };

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured on the server.");
    }

    if (!ingestionOnly) {
      retrievalContext = await buildRetrievalContext({
        runId: dbRun.id,
        orgId: params.orgId,
        queryIntent,
        firstUserInput,
      });
    }

    const coordinator = createConfiguredCoordinator({ intent: queryIntent });
    const {
      preFilterTools,
      configuredToolNames,
      memoryToolsPresent,
      missingMemoryTools,
    } = applyAgentToolPolicy(coordinator, queryIntent);
    const hasBrowserTask = preFilterTools.includes("browser_task");
    logger.debug("Agent pre-filter tool inventory", {
      queryIntent,
      toolCount: preFilterTools.length,
      hasQueryPropertyDb: preFilterTools.includes("query_property_db"),
      hasBrowserTask,
      tools: preFilterTools,
    });
    if (!hasBrowserTask) {
      logger.warn("browser_task is not present in pre-filtered tool list", {
        runId: dbRun.id,
        queryIntent,
        toolCount: preFilterTools.length,
      });
    }
    const runtimeLogContext = buildAgentRuntimeLogContext(
      params,
      dbRun.id,
      queryIntent,
    );

    logger.debug("Agent run starting", {
      ...runtimeLogContext,
      tools: configuredToolNames,
      memoryTools: memoryToolsPresent,
      previousResponseId: params.previousResponseId ?? null,
      maxTurns: params.maxTurns ?? null,
    });
    emitAgentSwitch(emit, "Coordinator");

    let runInput: ReturnType<typeof buildAgentInputItems> | RunState<
      unknown,
      ReturnType<typeof createConfiguredCoordinator>
    > = [
      userMessage(buildRuntimeClockContextMessage()),
      userMessage(
        buildResearchRoutingMessage(
          firstUserInput ?? "",
          params.researchLaneOverride ?? "auto",
        ),
      ),
      ...buildAgentInputItems(params.input),
    ];
    if (params.resumedRunState) {
      latestSerializedRunState = params.resumedRunState;
      const resumedState = await RunState.fromString(
        coordinator,
        params.resumedRunState,
      );
      if (params.toolApprovalDecision) {
        const interruptions = resumedState.getInterruptions() as Array<{
          name?: string;
          toolName?: string;
          rawItem?: Record<string, unknown>;
          raw_item?: Record<string, unknown>;
        }>;
        const selectedInterruption = interruptions.find((item) => {
          const rawItem = isRecord(item.rawItem)
            ? item.rawItem
            : isRecord(item.raw_item)
              ? item.raw_item
              : null;
          const callId =
            rawItem && typeof rawItem.callId === "string"
              ? rawItem.callId
              : rawItem && typeof rawItem.call_id === "string"
                ? rawItem.call_id
                : rawItem && typeof rawItem.id === "string"
                  ? rawItem.id
                  : null;
          return callId === params.toolApprovalDecision?.toolCallId;
        });
        if (!selectedInterruption) {
          throw new Error(
            `Pending approval item not found for call ${params.toolApprovalDecision.toolCallId}`,
          );
        }
        if (params.toolApprovalDecision.action === "approve") {
          resumedState.approve(selectedInterruption as never);
        } else {
          resumedState.reject(selectedInterruption as never);
        }
      }
      runInput = resumedState;
      await persistCheckpoint({
        kind: "resume_request",
        partialOutput: finalText,
        note: "Run resumed from serialized checkpoint",
      });
    }

    const runOptions = {
      ...buildAgentStreamRunOptions({
        conversationId: normalizeOpenAiConversationId(params.conversationId),
        previousResponseId: params.previousResponseId ?? null,
        maxTurns: params.maxTurns,
      }),
      context: {
        orgId: params.orgId,
        userId: params.userId,
        dealId: params.dealId ?? null,
        jurisdictionId: params.jurisdictionId ?? null,
        sku: params.sku ?? null,
        preferredCuaModel: params.preferredCuaModel ?? null,
      },
    } as Parameters<typeof run>[2];
    logger.debug("Agent run tool registry", {
      runId: dbRun.id,
      queryIntent,
      toolCount: configuredToolNames.length,
      tools: configuredToolNames,
      memoryToolsPresent,
      memoryToolsMissing: missingMemoryTools,
    });

    const runAttempt = async (
      attemptInput: AgentRunInput,
      label: string,
      streamText: boolean,
    ): Promise<AgentRunAttemptState> => {
      let attemptResult: unknown = null;
      let finalOutputRaw: unknown = undefined;
      let attemptText = "";
      let attemptPendingApprovalState: AgentRunAttemptState["pendingApprovalState"] = null;

      const result = await run(
        coordinator,
        attemptInput,
        runOptions,
      );
      attemptResult = result;
      if (
        isRecord(result) &&
        isRecord(result.state) &&
        typeof (result.state as { toString?: unknown }).toString === "function"
      ) {
        try {
          const serialized = (result.state as { toString: () => string }).toString();
          if (serialized.length > 0) {
            latestSerializedRunState = serialized;
          }
        } catch {
          // ignore serialization extraction failures
        }
      }

      if (isAsyncIterable(result)) {
        for await (const event of result) {
          const current = isRecord(event) ? (event as Record<string, unknown>) : null;
          if (!current) continue;
          const eventType = current.type;
          if (typeof eventType !== "string") continue;

          const item = isRecord(current.item) ? (current.item as Record<string, unknown>) : null;
          const itemType =
            item && typeof item.type === "string"
              ? item.type.toLowerCase()
              : "";
          const eventTypeLower = eventType.toLowerCase();

          if (eventType === "agent_updated_stream_event") {
            const agentName =
              isRecord(current.agent) && typeof current.agent?.["name"] === "string"
                ? (current.agent?.["name"] as string)
                : "Coordinator";
            lastAgentName = agentName;
            emitAgentSwitch(emit, agentName);
            continue;
          }

          const handoff =
            extractHandoff(current) ??
            (item ? extractHandoff(item) : null);
          const isHandoffEvent =
            eventTypeLower.includes("handoff") || itemType.includes("handoff");
          if (isHandoffEvent && handoff?.to) {
            const fromAgent = handoff.from ?? lastAgentName;
            const toAgent = handoff.to;
            lastAgentName = toAgent;
            emitHandoff(emit, { from: fromAgent, to: toAgent });
            continue;
          }

          if (eventType === "raw_model_stream_event") {
            const data = current.data;
            if (isRecord(data)) {
              const delta =
                typeof data.delta === "string" ? data.delta : undefined;
              if (delta) {
                attemptText += delta;
                state.hadOutputText = true;
                if (streamText) {
                  state.didEmitTextDelta = true;
                  emitTextDelta(emit, delta);
                }
              }
            }
            continue;
          }

          if (
            eventTypeLower === "run_item_stream_event" &&
            typeof current.name === "string" &&
            current.name === "tool_approval_requested"
          ) {
            const approvalItem = item ?? current;
            const toolName =
              getToolName(approvalItem) ??
              (typeof approvalItem.toolName === "string"
                ? approvalItem.toolName
                : typeof approvalItem.name === "string"
                  ? approvalItem.name
                  : "tool");
            const toolCallId = extractApprovalItemToolCallId(approvalItem);
            const args = extractApprovalItemArgs(approvalItem);
            emitToolApprovalRequested(emit, {
              name: toolName,
              args,
              toolCallId,
              runId: dbRun.id,
            });
            continue;
          }

          const toolPayload = item ?? current;
          const serializedCandidate =
            extractSerializedRunStateCandidate(current) ??
            (item ? extractSerializedRunStateCandidate(item) : null);
          if (serializedCandidate) {
            latestSerializedRunState = serializedCandidate;
          }
          const toolName = getToolName(toolPayload) ?? getToolName(current);
          if (toolName) {
            state.toolsInvoked.add(toolName);
            logger.debug("Agent tool invoked", {
              runId: dbRun.id,
              attemptLabel: label,
              toolName,
            });
            if (
              toolName === "store_memory" ||
              toolName.startsWith("get_entity") ||
              toolName === "record_memory_event"
            ) {
              logger.debug("Agent memory tool invoked", {
                runId: dbRun.id,
                attemptLabel: label,
                toolName,
              });
            }
            const output = extractToolOutput(toolPayload) ?? extractToolOutput(current);
            const args = extractToolArgs(toolPayload) ?? extractToolArgs(current);
            const toolCallId = extractToolCallId(toolPayload) ?? extractToolCallId(current);
            const indicatesToolStart =
              eventTypeLower.includes("tool_called") ||
              (itemType.includes("tool_call") && !itemType.includes("output"));
            const indicatesToolEnd =
              eventTypeLower.includes("tool_result") ||
              eventTypeLower.includes("tool_output") ||
              itemType.includes("tool_result") ||
              itemType.includes("tool_output");

            if (indicatesToolStart && output === null) {
              emitToolStart(emit, {
                name: toolName,
                args,
                toolCallId,
              });
            }

            if (output !== null) {
              const normalizedOutput =
                toolName === "browser_task"
                  ? normalizeBrowserTaskOutput(output)
                  : output;
              const trimmedOutput = maybeTrimToolOutput(normalizedOutput);
              if (toolName === "browser_task" && isRecord(trimmedOutput.value)) {
                logger.debug("Agent browser_task tool output shape", {
                  runId: dbRun.id,
                  attemptLabel: label,
                  hasScreenshots: Array.isArray(trimmedOutput.value.screenshots),
                  hasTurns: typeof trimmedOutput.value.turns === "number",
                  hasSource: isRecord(trimmedOutput.value.source),
                  sourceUrl: isRecord(trimmedOutput.value.source)
                    ? trimmedOutput.value.source.url
                    : undefined,
                  success: trimmedOutput.value.success,
                  statusCode: trimmedOutput.value.error ? "failed" : "completed",
                });
              }
              emitToolEnd(emit, {
                name: toolName,
                result: trimmedOutput.value,
                status: "completed",
                toolCallId,
              });
              collectToolOutputSignals(toolName, normalizedOutput, state, args);
              emitMapActionsFromToolResult(emit, {
                toolName,
                result: normalizedOutput,
                toolCallId,
              });
              await persistCheckpoint({
                kind: "tool_completion",
                toolName,
                toolCallId,
                partialOutput: attemptText,
              });
            } else if (indicatesToolEnd) {
              emitToolEnd(emit, {
                name: toolName,
                status: "completed",
                toolCallId,
              });
              await persistCheckpoint({
                kind: "tool_completion",
                toolName,
                toolCallId,
                partialOutput: attemptText,
              });
            }
            continue;
          }

          if (eventType === "error" && typeof current.error === "string") {
            errorMessage = current.error;
            state.missingEvidence.add(`Agent error: ${current.error}`);
          }
        }
      } else if (isRecord(attemptResult) && "finalOutput" in attemptResult) {
        const finalOutputText = sanitizeOutputText(
          (attemptResult as { finalOutput: unknown }).finalOutput as unknown,
        );
        if (finalOutputText.length > 0) {
          attemptText = finalOutputText;
          state.hadOutputText = true;
          if (streamText) {
            state.didEmitTextDelta = true;
            emitTextDelta(emit, finalOutputText);
          }
        }
      }

      if (isRecord(attemptResult) && "finalOutput" in attemptResult) {
        finalOutputRaw = (attemptResult as { finalOutput: unknown }).finalOutput;
      }

      if (!state.hadOutputText && finalOutputRaw !== undefined) {
        attemptText = sanitizeOutputText(finalOutputRaw);
        if (attemptText.length > 0) {
          state.hadOutputText = true;
        }
      }

      if (!state.hadOutputText && attemptText.length > 0) {
        if (streamText) {
          state.didEmitTextDelta = true;
          emitTextDelta(emit, attemptText);
        }
      }

      if (
        attemptResult !== null &&
        isRecord(attemptResult) &&
        typeof attemptResult.lastResponseId === "string"
      ) {
        openaiResponseId = attemptResult.lastResponseId;
      }

      if (
        isRecord(attemptResult) &&
        Array.isArray(attemptResult.interruptions) &&
        attemptResult.interruptions.length > 0 &&
        isRecord(attemptResult.state) &&
        typeof (attemptResult.state as { toString?: unknown }).toString === "function"
      ) {
        const interruptions = attemptResult.interruptions as Array<Record<string, unknown>>;
        const first = interruptions[0] ?? {};
        const interruptedToolName =
          typeof first.name === "string"
            ? first.name
            : typeof first.toolName === "string"
              ? first.toolName
              : getToolName(first) ?? null;
        const toolCallId = extractApprovalItemToolCallId(first);
        const serializedRunState = (attemptResult.state as { toString: () => string }).toString();
        attemptPendingApprovalState = {
          serializedRunState,
          queryIntent,
          toolCallId,
          toolName: interruptedToolName,
        };
        latestSerializedRunState = serializedRunState;
      }

      return {
        agentRunResult: attemptResult,
        finalOutputRaw,
        finalText: attemptText,
        pendingApprovalState: attemptPendingApprovalState,
      };
    };

    const deferTextUntilFinal =
      requireStoreMemory || knowledgeIngestionOnly || requireAddressMemoryLookup;
    const primaryAttempt = await runAttempt(runInput, "primary", !deferTextUntilFinal);
    agentRunResult = primaryAttempt.agentRunResult;
    let finalOutputRaw = primaryAttempt.finalOutputRaw;
    finalText = primaryAttempt.finalText;
    pendingApprovalState = primaryAttempt.pendingApprovalState;
    status = "succeeded";

    if (!params.resumedRunState && !pendingApprovalState) {
      let enforcementAttempt = 0;
      let enforcementAttempted = false;
      while (
        requireStoreMemory &&
        !hasVerifiedBrowserTaskSuccess(state) &&
        !state.toolsInvoked.has("store_memory") &&
        enforcementAttempt < MEMORY_ENFORCEMENT_MAX_RETRIES
      ) {
        enforcementAttempt += 1;
        enforcementAttempted = true;
        const reminder = "You were provided property data, but you did not call `store_memory`. " +
          "Before you answer, you must call `store_memory` for each factual input item first (one call per property fact), " +
          "then return your analysis.";
        const enforcementResult = await runAttempt(
          [
            userMessage(buildRuntimeClockContextMessage()),
            ...buildAgentInputItems(params.input),
            userMessage(reminder),
          ],
          "memory-enforcement",
          false,
        );
        if (state.toolsInvoked.has("store_memory")) {
          agentRunResult = enforcementResult.agentRunResult;
          finalOutputRaw = enforcementResult.finalOutputRaw;
          finalText = enforcementResult.finalText;
          pendingApprovalState = enforcementResult.pendingApprovalState;
          break;
        }
        logger.warn("Agent memory enforcement retrying", {
          runId: dbRun.id,
          attempt: enforcementAttempt,
          retrying: enforcementAttempt < MEMORY_ENFORCEMENT_MAX_RETRIES,
        });
      }

      if (enforcementAttempted && !state.toolsInvoked.has("store_memory")) {
        state.toolErrorMessages.push(
          "runtime_memory_enforcement: coordinator failed to call store_memory for property-fact input",
        );
        state.missingEvidence.add(
          "Coordinator did not invoke store_memory after property-fact input even after enforcement attempt.",
        );
      }

      let lookupEnforcementAttempt = 0;
      let lookupEnforcementAttempted = false;
      while (
        requireAddressMemoryLookup &&
        !hasVerifiedBrowserTaskSuccess(state) &&
        !hasAddressMemoryLookup(state) &&
        lookupEnforcementAttempt < MEMORY_ENFORCEMENT_MAX_RETRIES
      ) {
        lookupEnforcementAttempt += 1;
        lookupEnforcementAttempted = true;
        const reminder =
          "The user asked about a specific property address. " +
          "Before answering, call `lookup_entity_by_address` with the address to check if the system knows about it. " +
          "If found, use `get_entity_truth` with the returned entity_id. If not found, tell the user the property is not on file. " +
          "Do NOT call `store_memory` for lookups — that is a write operation. Do not substitute a nearby parcel as if it were the same property.";
        const enforcementResult = await runAttempt(
          [
            userMessage(buildRuntimeClockContextMessage()),
            ...buildAgentInputItems(params.input),
            userMessage(reminder),
          ],
          "memory-lookup-enforcement",
          false,
        );
        agentRunResult = enforcementResult.agentRunResult;
        finalOutputRaw = enforcementResult.finalOutputRaw;
        finalText = enforcementResult.finalText;
        pendingApprovalState = enforcementResult.pendingApprovalState;
        if (hasAddressMemoryLookup(state)) {
          break;
        }
        logger.warn("Agent memory lookup enforcement retrying", {
          runId: dbRun.id,
          attempt: lookupEnforcementAttempt,
          retrying: lookupEnforcementAttempt < MEMORY_ENFORCEMENT_MAX_RETRIES,
        });
      }

      if (lookupEnforcementAttempted && !hasAddressMemoryLookup(state)) {
        state.toolErrorMessages.push(
          "runtime_memory_lookup_enforcement: coordinator failed to query memory for address recall request",
        );
        state.missingEvidence.add(
          "Coordinator did not invoke memory lookup tools for an address recall request after enforcement attempt.",
        );
      }

      let conflictEnforcementAttempt = 0;
      while (
        !pendingApprovalState &&
        shouldRequireConflictConfirmation(finalText, state) &&
        conflictEnforcementAttempt < MEMORY_ENFORCEMENT_MAX_RETRIES
      ) {
        conflictEnforcementAttempt += 1;
        const conflictSummary = state.memoryConflictSummaries[0] ?? "stored draft conflict";
        const reminder =
          "You just stored memory as draft because of a conflict. " +
          `Conflict summary: ${conflictSummary}. ` +
          "Before ending your response, explicitly ask the user to confirm which value is correct and state that the new claim is stored as draft pending confirmation.";
        const enforcementResult = await runAttempt(
          [
            userMessage(buildRuntimeClockContextMessage()),
            ...buildAgentInputItems(params.input),
            userMessage(reminder),
          ],
          "conflict-enforcement",
          false,
        );
        agentRunResult = enforcementResult.agentRunResult;
        finalOutputRaw = enforcementResult.finalOutputRaw;
        finalText = enforcementResult.finalText;
        pendingApprovalState = enforcementResult.pendingApprovalState;
      }

      let parcelMismatchEnforcementAttempt = 0;
      while (
        !pendingApprovalState &&
        shouldRequireParcelMismatchGuardrail(finalText, state) &&
        parcelMismatchEnforcementAttempt < MEMORY_ENFORCEMENT_MAX_RETRIES
      ) {
        parcelMismatchEnforcementAttempt += 1;
        const mismatchSummary =
          state.parcelAddressMismatchSummaries[0] ?? "address mismatch detected";
        const reminder =
          "A parcel search returned a non-exact address match. " +
          `Mismatch summary: ${mismatchSummary}. ` +
          "Do NOT present nearby parcel details as the requested property. " +
          "Explicitly state the address mismatch and ask the user to confirm the exact address or parcel_id.";
        const enforcementResult = await runAttempt(
          [
            userMessage(buildRuntimeClockContextMessage()),
            ...buildAgentInputItems(params.input),
            userMessage(reminder),
          ],
          "parcel-mismatch-enforcement",
          false,
        );
        agentRunResult = enforcementResult.agentRunResult;
        finalOutputRaw = enforcementResult.finalOutputRaw;
        finalText = enforcementResult.finalText;
        pendingApprovalState = enforcementResult.pendingApprovalState;
      }
    }

    if (finalOutputRaw === undefined && finalText.length > 0) {
      finalOutputRaw = finalText;
    }

    if ((!state.didEmitTextDelta || deferTextUntilFinal) && finalText.length > 0) {
      state.didEmitTextDelta = true;
      emitTextDelta(emit, finalText);
    }
  } catch (error) {
    status = "failed";
    captureAgentError(lastAgentName || "Coordinator", error, {
      orgId: params.orgId,
      dealId: params.dealId,
      conversationId: params.conversationId,
      runId: dbRun.id,
      correlationId: params.correlationId,
      path: "apps/web/lib/agent/executeAgent.ts",
    });
    errorMessage = error instanceof Error ? error.message : "Agent execution failed";
    logger.error("Agent run failed", {
      ...buildAgentRuntimeLogContext(params, dbRun.id, queryIntent),
      ...summarizeToolEventState(state),
      lastAgentName: lastAgentName || "Coordinator",
      openaiResponseId: openaiResponseId ?? null,
      hadPendingApproval: Boolean(pendingApprovalState),
      error: errorMessage,
    });
    state.toolErrorMessages.push(errorMessage);
    state.missingEvidence.add(`Execution failure: ${errorMessage}`);
    emitError(emit, errorMessage);
  } finally {
    if (status === "succeeded") {
      const sanitizedOutput = sanitizeOutputText(finalText);
      const allowPlainTextFinalOutput =
        (memoryIngestionOnly && state.toolsInvoked.has("store_memory")) ||
        (knowledgeIngestionOnly && state.toolsInvoked.has("store_knowledge_entry")) ||
        (requireAddressMemoryLookup && hasAddressMemoryLookup(state));
      const parsedReport = parseFinalOutputJsonObject(sanitizedOutput);
      if (!parsedReport) {
        if (allowPlainTextFinalOutput) {
          finalReport = null;
          finalText = sanitizedOutput;
        } else {
          const reason = "Final agent output is not a valid JSON object.";
          state.toolErrorMessages.push(`final_report: ${reason}`);
          state.missingEvidence.add("Final agent report did not parse as JSON.");
          finalReport = buildFallbackAgentReportFromText({
            rawText: sanitizedOutput,
            taskSummary: userTextForIntent ?? firstUserInput ?? "Coordinator request",
            generatedAt: new Date().toISOString(),
          });
          logger.warn("Agent final output was non-JSON; applied fallback report normalization", {
            orgId: params.orgId,
            dealId: params.dealId,
            conversationId: params.conversationId,
            runId: dbRun.id,
            correlationId: params.correlationId,
            agentName: lastAgentName || "Coordinator",
          });
          finalText = JSON.stringify(finalReport, null, 2);
        }
      } else {
        const validation = AgentReportSchema.safeParse(parsedReport);
        if (!validation.success) {
          const reason = validation.error.issues
            .map((issue) => {
              const path = issue.path.length ? issue.path.join(".") : "root";
              return `${path} ${issue.message}`;
            })
            .join("; ");
          const message = `Final agent report failed schema validation: ${reason}`;
          state.toolErrorMessages.push(`final_report: ${reason}`);
          state.missingEvidence.add("Final agent report failed schema validation.");
          finalReport = buildFallbackAgentReportFromText({
            rawText: JSON.stringify(parsedReport),
            taskSummary: firstUserInput ?? "Coordinator request",
            generatedAt: new Date().toISOString(),
          });
          captureAgentWarning(lastAgentName || "Coordinator", message, {
            orgId: params.orgId,
            dealId: params.dealId ?? undefined,
            conversationId: params.conversationId,
            runId: dbRun.id,
            correlationId: params.correlationId,
            path: "apps/web/lib/agent/executeAgent.ts",
            fallback: "schema_validation_failure",
          });
          finalText = JSON.stringify(finalReport, null, 2);
        } else {
          finalReport = validation.data;
          finalText = JSON.stringify(finalReport, null, 2);
        }
      }
    }

    if (pendingApprovalState) {
      const approvalEvidenceCitations = dedupeEvidenceCitations(state.evidenceCitations);
      const approvalTrust = buildPendingApprovalTrust({
        toolsInvoked: [...state.toolsInvoked].sort(),
        packVersionsUsed: [...state.packVersionsUsed].sort(),
        evidenceHash: computeEvidenceHash(approvalEvidenceCitations),
        lastAgentName,
        durationMs: Date.now() - startedAtMs,
        retryAttempts: params.retryAttempts ?? 1,
        retryMaxAttempts: params.retryMaxAttempts ?? (params.retryAttempts ?? 1),
        retryMode: params.retryMode ?? "local",
        fallbackLineage: params.fallbackLineage,
        fallbackReason: params.fallbackReason,
        toolName: pendingApprovalState.toolName,
      });

      const runState: AgentRunState = {
        schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
        runId: dbRun.id,
        status: "running",
        partialOutput: "",
        correlationId: params.correlationId,
        lastAgentName,
        toolsInvoked: approvalTrust.toolsInvoked,
        confidence: approvalTrust.confidence,
        missingEvidence: [],
        durationMs: Date.now() - startedAtMs,
        lastUpdatedAt: new Date().toISOString(),
        runStartedAt: dbRun.startedAt?.toISOString(),
        runInputHash: inputHash,
        leaseOwner: "agent-runner",
        leaseExpiresAt: new Date().toISOString(),
      };

      const pendingOutputJson = {
        runState,
        finalOutput: "",
        finalReport: null,
        toolsInvoked: approvalTrust.toolsInvoked,
        packVersionsUsed: approvalTrust.packVersionsUsed,
        evidenceCitations: [],
        evidenceHash: approvalTrust.evidenceHash,
        confidence: approvalTrust.confidence,
        missingEvidence: [],
        verificationSteps: approvalTrust.verificationSteps,
        lastAgentName,
        errorSummary: null,
        toolFailures: [],
        proofChecks: [],
        retryAttempts: approvalTrust.retryAttempts,
        retryMaxAttempts: approvalTrust.retryMaxAttempts,
        retryMode: approvalTrust.retryMode,
        durationMs: approvalTrust.durationMs,
        correlationId: params.correlationId,
        pendingApproval: {
          serializedRunState: pendingApprovalState.serializedRunState,
          queryIntent: pendingApprovalState.queryIntent,
          toolCallId: pendingApprovalState.toolCallId,
          toolName: pendingApprovalState.toolName,
          conversationId: normalizeOpenAiConversationId(params.conversationId),
          previousResponseId: openaiResponseId ?? params.previousResponseId ?? null,
        },
      } as Record<string, unknown>;
      if (trajectoryRecorder) {
        pendingOutputJson.trajectory = trajectoryRecorder.snapshot();
      }
      const outputJson = pendingOutputJson as Prisma.InputJsonValue;
      const pendingTrajectory = trajectoryRecorder
        ? (trajectoryRecorder.snapshot() as unknown as Prisma.InputJsonValue)
        : undefined;

      const persisted = skipRunPersistence
        ? true
        : await persistFinalRunResult({
            runId: dbRun.id,
            status: "running",
            openaiResponseId,
            outputJson,
            trajectory: pendingTrajectory,
            serializedState: latestSerializedRunState
              ? (serializeRunStateEnvelope({
                  serializedRunState: latestSerializedRunState,
                  checkpoint: {
                    kind: "approval_pending",
                    at: new Date().toISOString(),
                    runId: dbRun.id,
                    toolName: pendingApprovalState.toolName,
                    toolCallId: pendingApprovalState.toolCallId,
                    lastAgentName,
                    correlationId: params.correlationId,
                    partialOutput: finalText,
                  },
                }) as unknown as Prisma.InputJsonValue)
              : undefined,
            executionLeaseToken: params.executionLeaseToken,
          });

      if (!persisted) {
        const replay = await loadRunExecutionResult(dbRun.id);
        if (replay) return replay;
        throw new Error(
          `Could not persist run result for ${dbRun.id}: duplicate execution is still in progress`,
        );
      }

      emitDone(emit, {
        runId: dbRun.id,
        status: "canceled",
        conversationId: normalizeOpenAiConversationId(params.conversationId),
      });

      return {
        runId: dbRun.id,
        status: "running",
        finalOutput: "",
        finalReport: null,
        toolsInvoked: approvalTrust.toolsInvoked,
        trust: approvalTrust,
        openaiResponseId,
        inputHash,
        startedAt,
        finishedAt: new Date(),
      };
    }

    const skipProofEnforcement =
      hasVerifiedBrowserTaskSuccess(state) ||
      (memoryIngestionOnly && state.toolsInvoked.has("store_memory")) ||
      (knowledgeIngestionOnly && state.toolsInvoked.has("store_knowledge_entry"));
    const proofGroups = getProofGroupsForIntent(queryIntent);
    const proofViolations = skipProofEnforcement
      ? []
      : evaluateProofCompliance(queryIntent, state.toolsInvoked);
    const failedProofViolations = proofViolations.filter(
      (violation) => violation.missingTools.length > 0,
    );
    const proofChecks = proofGroups.map((group) => {
      if (skipProofEnforcement) {
        return `${group.label}:skipped-ingestion`;
      }
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
        .map((violation) =>
          `Proof path missing required group: ${violation.group.label}`
        )
        .join("; ");
      errorMessage ??= proofMessage;
      state.toolErrorMessages.push(`proof_enforcement: ${proofMessage}`);
    }
    let missingEvidence = normalizeMissingEvidenceForBrowserRun(
      state,
      finalizeMissingEvidence(state),
    );
    const parishScopedParcelRequest = isParishScopedParcelRequest(firstUserInput, queryIntent);
    const missingParcelProof = failedProofViolations.some(
      (violation) => violation.group.label === "Parcel context",
    );
    const hasParishDimensionFailure =
      hasMissingParishDimensionSignal(missingEvidence) ||
      hasMissingParishDimensionSignal(state.toolErrorMessages);
    const hasParishVerifiedRowsEmpty =
      hasParishVerifiedRowsEmptySignal(missingEvidence) ||
      hasParishVerifiedRowsEmptySignal(state.toolErrorMessages) ||
      (state.parishTieredQueryObserved && state.parishVerifiedParcelRowsMax === 0);
    const failClosedParishParcelRanking =
      parishScopedParcelRequest &&
      (hasParishDimensionFailure || hasParishVerifiedRowsEmpty || missingParcelProof);
    if (failClosedParishParcelRanking) {
      const requestedParish = extractRequestedParish(firstUserInput);
      status = "failed";
      const parishGateMessage =
        `Fail-closed parish gate triggered for ${requestedParish ?? "requested"} parish parcel search.`;
      errorMessage ??= parishGateMessage;
      state.toolErrorMessages.push(`parish_verification_gate: ${parishGateMessage}`);
      state.missingEvidence.add(
        "Parish-scoped parcel recommendation blocked until parcel-to-parish membership is verified from authoritative boundaries.",
      );
      missingEvidence = [
        ...missingEvidence,
        "Parish-scoped parcel recommendation blocked until parcel-to-parish membership is verified from authoritative boundaries.",
      ];
      finalText = buildParishVerificationRequiredOutput(requestedParish);
    }

    const shouldFallbackToPublicWeb =
      state.browserTaskServiceUnavailableCount > 0 &&
      state.browserTaskSuggestedLane === "public_web" &&
      params.researchLaneOverride !== "public_web" &&
      params.retryMode !== "browser-service-unavailable-fallback";

    if (shouldFallbackToPublicWeb) {
      logger.warn("Retrying agent run on public_web after browser_task service outage", {
        runId: dbRun.id,
        queryIntent,
        priorLane: params.researchLaneOverride ?? "auto",
        suggestedLane: state.browserTaskSuggestedLane,
        browserTaskServiceUnavailableCount: state.browserTaskServiceUnavailableCount,
      });

      return executeAgentWorkflow({
        ...params,
        runId: dbRun.id,
        researchLaneOverride: "public_web",
        retryAttempts: (params.retryAttempts ?? 1) + 1,
        retryMaxAttempts: Math.max(params.retryMaxAttempts ?? 2, (params.retryAttempts ?? 1) + 1),
        retryMode: "browser-service-unavailable-fallback",
        fallbackLineage: [...(params.fallbackLineage ?? []), params.researchLaneOverride ?? "auto"],
        fallbackReason:
          "browser_task reported service unavailability and suggested public_web fallback",
      });
    }

    const evidenceRetryPolicy = buildMissingEvidenceRetryPolicy(
      params,
      missingEvidence.length,
      status,
    );
    const normalizedEvidenceCitations = dedupeEvidenceCitations(
      state.evidenceCitations,
    );
    const evidenceHash = computeEvidenceHash(normalizedEvidenceCitations);
    const confidenceCandidate =
      status === "failed"
        ? null
        : parseConfidenceFromOutput(
          (isRecord(agentRunResult) &&
          "finalOutput" in agentRunResult
            ? (agentRunResult.finalOutput as unknown)
            : undefined) ??
              safeParseJson(finalText) ??
              (finalText.length > 0 ? finalText : null),
          );
    const confidence = deriveFallbackConfidence({
      status,
      confidenceCandidate,
      state,
      missingEvidenceCount: missingEvidence.length,
    });

    const sortedToolsInvoked = [...state.toolsInvoked].sort();
    const memoryToolsUsed = sortedToolsInvoked.filter(
      (t) => t === "store_memory" || t === "get_entity_truth" || t === "get_entity_memory" || t === "record_memory_event",
    );
    logger.info("Agent run completed", {
      ...buildAgentRuntimeLogContext(params, dbRun.id, queryIntent),
      ...summarizeToolEventState(state),
      status,
      tools: sortedToolsInvoked,
      memoryTools: memoryToolsUsed,
      proofChecks,
      openaiResponseId: openaiResponseId ?? null,
      confidence,
    });

    const trust = buildFinalTrust({
      toolsInvoked: sortedToolsInvoked,
      packVersionsUsed: [...state.packVersionsUsed].sort(),
      evidenceCitations: normalizedEvidenceCitations,
      evidenceHash,
      confidence,
      researchLane: params.researchLaneOverride ?? "auto",
      missingEvidence,
      lastAgentName,
      errorSummary: errorMessage ?? null,
      durationMs: Date.now() - startedAtMs,
      toolFailures: state.toolErrorMessages,
      proofChecks,
      retryAttempts: params.retryAttempts ?? 1,
      retryMaxAttempts: params.retryMaxAttempts ?? (params.retryAttempts ?? 1),
      retryMode: params.retryMode ?? "local",
      evidenceRetryPolicy,
      fallbackLineage: params.fallbackLineage,
      fallbackReason: params.fallbackReason,
    });

    if (status !== "succeeded" && !failClosedParishParcelRanking) {
      const fallback = buildFallbackOutput(status, missingEvidence);
      finalText = fallback;
    }

    finalText = collapseRepeatedTextArtifacts(finalText);

    const evidenceCitationsJson: Prisma.JsonArray = normalizedEvidenceCitations.map((citation) => ({
      tool: citation.tool ?? null,
      sourceId: citation.sourceId ?? null,
      snapshotId: citation.snapshotId ?? null,
      contentHash: citation.contentHash ?? null,
      url: citation.url ?? null,
      isOfficial: citation.isOfficial ?? null,
    }));

    const runState: AgentRunState = {
      schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
      runId: dbRun.id,
      status: status,
      partialOutput: finalText,
      correlationId: params.correlationId,
      lastAgentName,
      toolsInvoked: trust.toolsInvoked,
      confidence: trust.confidence,
      missingEvidence: trust.missingEvidence,
      durationMs: Date.now() - startedAtMs,
      lastUpdatedAt: new Date().toISOString(),
      runStartedAt: dbRun.startedAt?.toISOString(),
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
    };
    const usageSummary = isAgentOsFeatureEnabled("costTracking")
      ? extractUsageSummary(agentRunResult)
      : null;

    const outputJson: AgentRunOutputJson = {
      runState,
      correlationId: params.correlationId,
      toolsInvoked: trust.toolsInvoked,
      packVersionsUsed: trust.packVersionsUsed,
      evidenceCitations: evidenceCitationsJson as unknown as AgentRunOutputJson["evidenceCitations"],
      evidenceHash: trust.evidenceHash ?? null,
      confidence: trust.confidence,
      missingEvidence: trust.missingEvidence,
      verificationSteps: trust.verificationSteps,
      lastAgentName,
      errorSummary: trust.errorSummary,
      toolFailures: trust.toolFailures,
      proofChecks: trust.proofChecks,
      retryAttempts: trust.retryAttempts,
      retryMaxAttempts: trust.retryMaxAttempts,
      retryMode: trust.retryMode,
      evidenceRetryPolicy: trust.evidenceRetryPolicy,
      fallbackLineage: trust.fallbackLineage,
      fallbackReason: trust.fallbackReason,
      retrievalContext: retrievalContext ?? undefined,
      durationMs: Date.now() - startedAtMs,
      finalReport: finalReport ?? null,
      finalOutput: finalText,
    };
    if (usageSummary) {
      (outputJson as unknown as Record<string, unknown>).usage = usageSummary;
    }
    if (trajectoryRecorder) {
      (outputJson as unknown as Record<string, unknown>).trajectory =
        trajectoryRecorder.snapshot();
    }
    const finalTrajectory = trajectoryRecorder
      ? (trajectoryRecorder.snapshot() as unknown as Prisma.InputJsonValue)
      : undefined;

    const persisted = skipRunPersistence
      ? true
      : await persistFinalRunResult({
          runId: dbRun.id,
          status,
          openaiResponseId,
          outputJson: outputJson as unknown as Prisma.InputJsonValue,
          trajectory: finalTrajectory,
          serializedState: latestSerializedRunState
            ? (serializeRunStateEnvelope({
                serializedRunState: latestSerializedRunState,
                checkpoint: {
                  kind: "final_result",
                  at: new Date().toISOString(),
                  runId: dbRun.id,
                  lastAgentName,
                  correlationId: params.correlationId,
                  partialOutput: finalText,
                },
              }) as unknown as Prisma.InputJsonValue)
            : undefined,
          executionLeaseToken: params.executionLeaseToken,
        });

    if (!persisted) {
      const replay = await loadRunExecutionResult(dbRun.id);
      if (replay) {
        return replay;
      }
      throw new Error(
        `Could not persist run result for ${dbRun.id}: duplicate execution is still in progress`,
      );
    }

    emitAgentSummary(emit, {
      runId: dbRun.id,
      trust,
    });
    const doneStatus: "succeeded" | "failed" | "canceled" = status === "failed"
      ? "failed"
      : "succeeded";
    emitDone(emit, {
      runId: dbRun.id,
      status: doneStatus,
      conversationId: params.conversationId,
    });
    await runAgentPostRunEffects({
      runId: dbRun.id,
      orgId: params.orgId,
      userId: params.userId,
      conversationId: params.conversationId ?? null,
      dealId: params.dealId ?? null,
      jurisdictionId: params.jurisdictionId ?? null,
      runType: params.runType ?? null,
      status,
      firstUserInput,
      queryIntent: queryIntent ?? null,
      skipRunPersistence,
      ingestionOnly,
      finalText,
      finalReport: finalReport ?? null,
      trust,
      retrievalContext: retrievalContext ?? null,
      retrievalSummary: summarizeRetrievalContext(retrievalContext),
    });

    return {
      runId: dbRun.id,
      status,
      finalOutput: finalText,
      finalReport: finalReport ?? null,
      toolsInvoked: trust.toolsInvoked,
      trust,
      openaiResponseId,
      inputHash,
      startedAt,
      finishedAt: new Date(),
    };
  }
}

export async function resumeAgentToolApproval(params: {
  orgId: string;
  userId: string;
  runId: string;
  toolCallId: string;
  action: "approve" | "reject";
  onEvent?: (event: AgentStreamEvent) => void;
}): Promise<AgentExecutionResult> {
  const runRecord = await prisma.run.findFirst({
    where: { id: params.runId, orgId: params.orgId },
    select: {
      id: true,
      orgId: true,
      runType: true,
      dealId: true,
      jurisdictionId: true,
      sku: true,
      outputJson: true,
    },
  });

  if (!runRecord) {
    throw new Error("Run not found or access denied.");
  }

  const output = isRecord(runRecord.outputJson)
    ? (runRecord.outputJson as Record<string, unknown>)
    : {};
  const pendingApproval = isRecord(output.pendingApproval)
    ? (output.pendingApproval as Record<string, unknown>)
    : null;
  const serializedRunState =
    pendingApproval && typeof pendingApproval.serializedRunState === "string"
      ? pendingApproval.serializedRunState
      : null;
  const queryIntent =
    pendingApproval && typeof pendingApproval.queryIntent === "string"
      ? pendingApproval.queryIntent
      : undefined;
  const conversationId =
    pendingApproval && typeof pendingApproval.conversationId === "string"
      ? pendingApproval.conversationId
      : undefined;
  const previousResponseId =
    pendingApproval && typeof pendingApproval.previousResponseId === "string"
      ? pendingApproval.previousResponseId
      : null;

  if (!serializedRunState) {
    throw new Error("No pending tool approval state found for this run.");
  }

  const existingApprovalAudit = Array.isArray(output.approvalAudit)
    ? output.approvalAudit
    : [];
  const nextApprovalAudit = [
    ...existingApprovalAudit,
    {
      toolCallId: params.toolCallId,
      action: params.action,
      userId: params.userId,
      decidedAt: new Date().toISOString(),
      runId: params.runId,
    },
  ];

  await prisma.run.update({
    where: { id: runRecord.id },
    data: {
      outputJson: {
        ...output,
        approvalAudit: nextApprovalAudit,
      } as Prisma.InputJsonValue,
    },
  });

  return executeAgentWorkflow({
    orgId: params.orgId,
    userId: params.userId,
    conversationId,
    input: [],
    runId: runRecord.id,
    runType: runRecord.runType,
    dealId: runRecord.dealId ?? undefined,
    jurisdictionId: runRecord.jurisdictionId ?? undefined,
    sku: runRecord.sku ?? undefined,
    intentHint: queryIntent,
    resumedRunState: serializedRunState,
    previousResponseId,
    toolApprovalDecision: {
      toolCallId: params.toolCallId,
      action: params.action,
    },
    onEvent: params.onEvent,
  });
}

export async function resumeSerializedAgentRun(params: {
  orgId: string;
  userId: string;
  runId: string;
  onEvent?: (event: AgentStreamEvent) => void;
}): Promise<AgentExecutionResult> {
  const runRecord = await prisma.run.findFirst({
    where: { id: params.runId, orgId: params.orgId },
    select: {
      id: true,
      orgId: true,
      runType: true,
      dealId: true,
      jurisdictionId: true,
      sku: true,
      outputJson: true,
      serializedState: true,
      openaiResponseId: true,
    },
  });

  if (!runRecord) {
    throw new Error("Run not found or access denied.");
  }

  const output = isRecord(runRecord.outputJson)
    ? (runRecord.outputJson as Record<string, unknown>)
    : {};
  const pendingApproval = isRecord(output.pendingApproval)
    ? (output.pendingApproval as Record<string, unknown>)
    : null;

  const serializedFromField = readSerializedRunStateFromStoredValue(
    runRecord.serializedState,
  );
  const serializedFromPending =
    pendingApproval && typeof pendingApproval.serializedRunState === "string"
      ? pendingApproval.serializedRunState
      : null;
  const serializedRunState = serializedFromField ?? serializedFromPending;

  if (!serializedRunState) {
    throw new Error("No serialized checkpoint found for this run.");
  }

  const conversationId =
    pendingApproval && typeof pendingApproval.conversationId === "string"
      ? pendingApproval.conversationId
      : undefined;
  const queryIntent =
    pendingApproval && typeof pendingApproval.queryIntent === "string"
      ? pendingApproval.queryIntent
      : undefined;
  const previousResponseId =
    pendingApproval && typeof pendingApproval.previousResponseId === "string"
      ? pendingApproval.previousResponseId
      : runRecord.openaiResponseId;

  return executeAgentWorkflow({
    orgId: params.orgId,
    userId: params.userId,
    conversationId,
    input: [],
    runId: runRecord.id,
    runType: runRecord.runType,
    dealId: runRecord.dealId ?? undefined,
    jurisdictionId: runRecord.jurisdictionId ?? undefined,
    sku: runRecord.sku ?? undefined,
    intentHint: queryIntent,
    resumedRunState: serializedRunState,
    previousResponseId,
    onEvent: params.onEvent,
  });
}

async function buildRetrievalContext(params: {
  runId: string;
  orgId: string;
  queryIntent?: string | null;
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
    const retrievalResults = await unifiedRetrieval(query, params.runId, params.orgId);
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
    if (shouldSuppressLocalSchemaDrift(error)) {
      logger.info("Skipped retrieval context computation due to local schema drift", {
        runId: params.runId,
        error: String(error),
      });
    } else {
    logger.warn("Failed to compute retrieval context for run", {
      runId: params.runId,
      error: String(error),
    });
    }
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

function shouldSuppressLocalSchemaDrift(error: unknown): boolean {
  return isLocalAppRuntime() && isSchemaDriftError(error);
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
