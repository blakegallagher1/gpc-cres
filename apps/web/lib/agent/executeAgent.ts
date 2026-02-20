import { assistant as assistantMessage, run, RunState, user as userMessage } from "@openai/agents";
import type { Agent } from "@openai/agents";
import {
  AgentReport,
  AgentReportSchema,
  SKU_TYPES,
  AGENT_RUN_STATE_KEYS,
  AGENT_RUN_STATE_SCHEMA_VERSION,
  type DataAgentRetrievalContext,
  type AgentEvidenceRetryPolicy,
  type AgentRunOutputJson,
  type AgentRunState,
} from "@entitlement-os/shared";
import {
  computeEvidenceHash,
  dedupeEvidenceCitations,
  type EvidenceCitation,
} from "@entitlement-os/shared/evidence";
import { hashJsonSha256 } from "@entitlement-os/shared/crypto";
import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { createHash } from "node:crypto";
import {
  buildAgentStreamRunOptions,
  captureAgentError,
  captureAgentWarning,
  createIntentAwareCoordinator,
  deserializeRunStateEnvelope,
  evaluateProofCompliance,
  inferQueryIntentFromText,
  type QueryIntent,
  getProofGroupsForIntent,
  serializeRunStateEnvelope,
  setupAgentTracing,
} from "@entitlement-os/openai";
import { AgentTrustEnvelope } from "@/types";
import { autoFeedRun } from "@/lib/agent/dataAgentAutoFeed.service";
import { logger } from "./loggerAdapter";
import { unifiedRetrieval } from "./retrievalAdapter";

const DATA_AGENT_RETRIEVAL_LIMIT = 6;
const DB_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOpenAiConversationId(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("conv") ? value : undefined;
}

export type AgentInputMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      status: "completed";
      content: Array<{ type: "output_text"; text: string }>;
    };

export type AgentStreamEvent =
  | { type: "agent_switch"; agentName: string }
  | {
      type: "tool_approval_requested";
      name: string;
      args?: Record<string, unknown>;
      toolCallId?: string | null;
      runId?: string;
    }
  | {
      type: "tool_start";
      name: string;
      args?: Record<string, unknown>;
      toolCallId?: string | null;
    }
  | {
      type: "tool_end";
      name: string;
      result?: unknown;
      status?: "completed" | "failed";
      toolCallId?: string | null;
    }
  | {
      type: "handoff";
      from?: string;
      to: string;
      fromAgent?: string;
      toAgent?: string;
    }
  | { type: "text_delta"; content: string }
  | {
      type: "agent_progress";
      runId: string;
      status: "running";
      partialOutput: string;
      toolsInvoked?: string[];
      lastAgentName?: string;
      runState?: Record<string, unknown>;
      correlationId?: string;
    }
  | {
      type: "done";
      runId: string;
      status: "succeeded" | "failed" | "canceled";
      conversationId?: string;
    }
  | { type: "error"; message: string }
  | {
      type: "agent_summary";
      runId: string;
      trust: AgentTrustEnvelope;
    };

type AgentExecutionResult = {
  runId: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  finalOutput: string;
  finalReport: AgentReport | null;
  toolsInvoked: string[];
  trust: AgentTrustEnvelope;
  openaiResponseId: string | null;
  inputHash: string;
  startedAt: Date;
  finishedAt: Date;
};

function normalizeSku(sku: string | null | undefined): (typeof SKU_TYPES)[number] | null {
  if (!sku) return null;
  if ((SKU_TYPES as readonly string[]).includes(sku)) {
    return sku as (typeof SKU_TYPES)[number];
  }
  return null;
}

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
  onEvent?: (event: AgentStreamEvent) => void;
  correlationId?: string;
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
};

export function toDatabaseRunId(runId: string): string {
  const trimmedRunId = runId.trim();
  if (DB_UUID_REGEX.test(trimmedRunId)) {
    return trimmedRunId;
  }

  const source = trimmedRunId.length > 0 ? trimmedRunId : "agent-run";
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 32);
  const variant = parseInt(hash[16], 16);
  const variantCharacter = ((variant & 0x3) | 0x8).toString(16);

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variantCharacter}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const MISSING_EVIDENCE_RETRY_THRESHOLD = 3;
const MISSING_EVIDENCE_RETRY_MAX_ATTEMPTS = 3;
const MISSING_EVIDENCE_RETRY_MODE = "missing-evidence-policy";

type ToolEventState = {
  toolsInvoked: Set<string>;
  packVersionsUsed: Set<string>;
  evidenceCitations: EvidenceCitation[];
  missingEvidence: Set<string>;
  toolErrorMessages: string[];
  hadOutputText: boolean;
};

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

type ToolPolicy = {
  exact: Set<string>;
  prefixes: string[];
};

const BASE_ALLOWED_TOOLS = [
  "query_org_sql",
  "search_knowledge_base",
  "search_parcels",
  "get_parcel_details",
  "evidence_snapshot",
];

const TOOL_POLICY_BY_INTENT: Record<string, ToolPolicy> = {
  finance: {
    exact: new Set([...BASE_ALLOWED_TOOLS, "calculate_proforma", "calculate_debt_sizing"]),
    prefixes: ["consult_", "finance_", "calculate_", "debt_", "underwrite_", "market_"],
  },
  legal: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "legal_", "zoning_", "entitlement_", "due_diligence_"],
  },
  entitlements: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "entitlement_", "zoning_", "permit_", "parish_"],
  },
  due_diligence: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "due_diligence_", "risk_", "flood_", "evidence_"],
  },
  risk: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "risk_", "flood_", "screen_", "hazard_", "evidence_"],
  },
  marketing: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "marketing_", "buyer_", "outreach_", "market_"],
  },
  operations: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "operations_", "task_", "project_", "schedule_"],
  },
  tax: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "tax_", "finance_", "calculate_"],
  },
  design: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "design_", "site_", "entitlement_"],
  },
  market_intel: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "market_", "comps_", "research_"],
  },
  screener: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "screen_", "triage_", "parcel_", "risk_", "finance_"],
  },
  research: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "research_", "market_", "evidence_"],
  },
  land_search: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_", "search_", "parcel_", "screen_", "evidence_"],
  },
  general: {
    exact: new Set(BASE_ALLOWED_TOOLS),
    prefixes: ["consult_"],
  },
};

function getToolDefinitionName(tool: unknown): string | null {
  if (!isRecord(tool)) return null;
  if (typeof tool.name === "string" && tool.name.trim().length > 0) {
    return tool.name;
  }
  if (isRecord(tool.function) && typeof tool.function.name === "string") {
    return tool.function.name;
  }
  return null;
}

function filterToolsForIntent(intent: string, tools: readonly unknown[]): unknown[] {
  const policy = TOOL_POLICY_BY_INTENT[intent] ?? TOOL_POLICY_BY_INTENT.general;
  const filtered = tools.filter((tool) => {
    if (isRecord(tool) && tool.type === "hosted_tool") {
      return false;
    }
    const name = getToolDefinitionName(tool);
    if (!name) return false;
    if (policy.exact.has(name)) return true;
    return policy.prefixes.some((prefix) => name.startsWith(prefix));
  });
  return filtered;
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

function parseFinalOutputJsonObject(value: string): Record<string, unknown> | null {
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

function getToolName(payload: Record<string, unknown>): string | null {
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

function extractToolArgs(payload: Record<string, unknown>): Record<string, unknown> | undefined {
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
) {
  let parsed: unknown = output;
  if (typeof output === "string") {
    parsed = safeParseJson(output) ?? output;
  }
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

function readSerializedRunStateFromStoredValue(value: unknown): string | null {
  const envelope = deserializeRunStateEnvelope(value);
  if (envelope) {
    return envelope.serializedRunState;
  }

  if (isRecord(value) && typeof value.serializedRunState === "string") {
    return value.serializedRunState;
  }

  return null;
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

async function persistFinalRunResult(params: {
  runId: string;
  status: AgentExecutionResult["status"];
  openaiResponseId: string | null;
  outputJson: Prisma.InputJsonValue;
  serializedState?: Prisma.InputJsonValue | null;
  executionLeaseToken?: string;
}): Promise<boolean> {
  if (!params.executionLeaseToken) {
    await prisma.run.update({
      where: { id: params.runId },
      data: {
        status: params.status,
        finishedAt: new Date(),
        openaiResponseId: params.openaiResponseId,
        outputJson: params.outputJson,
        serializedState: params.serializedState ?? undefined,
      },
    });
    return true;
  }

  const updated = await prisma.run.updateMany({
    where: { id: params.runId, openaiResponseId: params.executionLeaseToken },
    data: {
      status: params.status,
      finishedAt: new Date(),
      openaiResponseId: params.openaiResponseId,
      outputJson: params.outputJson,
      serializedState: params.serializedState ?? undefined,
    },
  });

  return updated.count === 1;
}

async function upsertRunRecord(params: {
  runId: string;
  orgId: string;
  runType: string;
  inputHash: string;
  dealId?: string | null;
  jurisdictionId?: string | null;
  sku?: string | null;
  status?: "running" | "succeeded" | "failed" | "canceled";
}) {
  const runType = (params.runType ?? "ENRICHMENT") as
    | "TRIAGE"
    | "PARISH_PACK_REFRESH"
    | "ARTIFACT_GEN"
    | "BUYER_LIST_BUILD"
    | "CHANGE_DETECT"
    | "ENRICHMENT"
    | "INTAKE_PARSE"
    | "DOCUMENT_CLASSIFY"
    | "BUYER_OUTREACH_DRAFT"
    | "ADVANCEMENT_CHECK"
    | "OPPORTUNITY_SCAN"
    | "DEADLINE_MONITOR";

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
    },
    update: {
      status: params.status ?? "running",
      inputHash: params.inputHash,
      finishedAt: null,
    },
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
    input: params.input,
  });
  const firstUserInput = params.input.find((entry) => entry.role === "user")?.content;
  const userTextForIntent = params.intentHint ?? firstUserInput;
  const queryIntent =
    params.queryIntentOverride ?? inferQueryIntentFromText(userTextForIntent);
  const runId = toDatabaseRunId(
    params.runId ??
      `agent-run-${hashJsonSha256({ inputHash, runType: params.runType ?? "ENRICHMENT" })}`,
  );

  if (params.runId) {
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

  const dbRun = await upsertRunRecord({
    runId,
    orgId: params.orgId,
    runType: params.runType ?? "ENRICHMENT",
    dealId: params.dealId ?? null,
    jurisdictionId: params.jurisdictionId ?? null,
    sku: params.sku ?? null,
    inputHash,
    status: "running",
  });

  const state: ToolEventState = {
    toolsInvoked: new Set(),
    packVersionsUsed: new Set(),
    evidenceCitations: [],
    missingEvidence: new Set(),
    toolErrorMessages: [],
    hadOutputText: false,
  };

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
    params.onEvent?.(event);
  };

  const persistCheckpoint = async (checkpoint: {
    kind: "tool_completion" | "approval_pending" | "resume_request" | "final_result";
    toolName?: string | null;
    toolCallId?: string | null;
    partialOutput?: string;
    note?: string;
  }) => {
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

    retrievalContext = await buildRetrievalContext({
      runId: dbRun.id,
      orgId: params.orgId,
      queryIntent,
      firstUserInput,
    });

    const baseCoordinator = createIntentAwareCoordinator(queryIntent) as Agent & {
      clone?: (config: { tools: Agent["tools"] }) => Agent;
    };
    const coordinator =
      typeof baseCoordinator.clone === "function"
        ? baseCoordinator.clone({
            tools: filterToolsForIntent(
              queryIntent,
              [...(baseCoordinator.tools ?? [])],
            ) as Agent["tools"],
          })
        : baseCoordinator;
    emit({ type: "agent_switch", agentName: "Coordinator" });

    let runInput: ReturnType<typeof buildAgentInputItems> | RunState<
      unknown,
      ReturnType<typeof createIntentAwareCoordinator>
    > = buildAgentInputItems(params.input);
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
      },
    } as Parameters<typeof run>[2];

    const result = await run(
      coordinator,
      runInput,
      runOptions,
    );
    agentRunResult = result;
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
          emit({ type: "agent_switch", agentName });
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
          emit({
            type: "handoff",
            from: fromAgent,
            to: toAgent,
            fromAgent,
            toAgent,
          });
          emit({ type: "agent_switch", agentName: toAgent });
          continue;
        }

        if (eventType === "raw_model_stream_event") {
          const data = current.data;
          if (isRecord(data)) {
            const delta =
              typeof data.delta === "string" ? data.delta : undefined;
            if (delta) {
              finalText += delta;
              state.hadOutputText = true;
              emit({ type: "text_delta", content: delta });
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
          emit({
            type: "tool_approval_requested",
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
            emit({
              type: "tool_start",
              name: toolName,
              args,
              toolCallId,
            });
          }

          if (output !== null) {
            emit({
              type: "tool_end",
              name: toolName,
              result: output,
              status: "completed",
              toolCallId,
            });
            collectToolOutputSignals(toolName, output, state);
            await persistCheckpoint({
              kind: "tool_completion",
              toolName,
              toolCallId,
              partialOutput: finalText,
            });
          } else if (indicatesToolEnd) {
            emit({
              type: "tool_end",
              name: toolName,
              status: "completed",
              toolCallId,
            });
            await persistCheckpoint({
              kind: "tool_completion",
              toolName,
              toolCallId,
              partialOutput: finalText,
            });
          }
          continue;
        }

        if (eventType === "error" && typeof current.error === "string") {
          errorMessage = current.error;
          state.missingEvidence.add(`Agent error: ${current.error}`);
        }
      }
    } else if (isRecord(agentRunResult) && "finalOutput" in agentRunResult) {
      const finalOutputText = sanitizeOutputText(agentRunResult.finalOutput as unknown);
      if (finalOutputText.length > 0) {
        finalText = finalOutputText;
        state.hadOutputText = true;
        emit({ type: "text_delta", content: finalOutputText });
      }
    }

    const finalOutputRaw = isRecord(agentRunResult) && "finalOutput" in agentRunResult
      ? (agentRunResult.finalOutput as unknown)
      : undefined;
    if (!state.hadOutputText && finalOutputRaw !== undefined) {
      finalText = sanitizeOutputText(finalOutputRaw);
      if (finalText.length > 0) {
        state.hadOutputText = true;
      }
    }

    if (!state.hadOutputText && finalText.length > 0) {
      emit({ type: "text_delta", content: finalText });
    }

    if (
      agentRunResult !== null &&
      isRecord(agentRunResult) &&
      typeof agentRunResult.lastResponseId === "string"
    ) {
      openaiResponseId = agentRunResult.lastResponseId;
    }
    status = "succeeded";

    if (
      isRecord(agentRunResult) &&
      Array.isArray(agentRunResult.interruptions) &&
      agentRunResult.interruptions.length > 0 &&
      isRecord(agentRunResult.state) &&
      typeof (agentRunResult.state as { toString?: unknown }).toString === "function"
    ) {
      const interruptions = agentRunResult.interruptions as Array<Record<string, unknown>>;
      const first = interruptions[0] ?? {};
      const toolName =
        typeof first.name === "string"
          ? first.name
          : typeof first.toolName === "string"
            ? first.toolName
            : getToolName(first) ?? null;
      const toolCallId = extractApprovalItemToolCallId(first);
      const serializedRunState = (
        agentRunResult.state as { toString: () => string }
      ).toString();
      pendingApprovalState = {
        serializedRunState,
        queryIntent,
        toolCallId,
        toolName,
      };
      latestSerializedRunState = serializedRunState;
      status = "running";
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
    state.toolErrorMessages.push(errorMessage);
    state.missingEvidence.add(`Execution failure: ${errorMessage}`);
    emit({ type: "error", message: errorMessage });
  } finally {
    if (status === "succeeded") {
      const sanitizedOutput = sanitizeOutputText(finalText);
      const parsedReport = parseFinalOutputJsonObject(sanitizedOutput);
      if (!parsedReport) {
        const reason = "Final agent output is not a valid JSON object.";
        state.toolErrorMessages.push(`final_report: ${reason}`);
        state.missingEvidence.add("Final agent report did not parse as JSON.");
        finalReport = buildFallbackAgentReportFromText({
          rawText: sanitizedOutput,
          taskSummary: firstUserInput ?? "Coordinator request",
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
      const approvalTrust: AgentTrustEnvelope = {
        toolsInvoked: [...state.toolsInvoked].sort(),
        packVersionsUsed: [...state.packVersionsUsed].sort(),
        evidenceCitations: dedupeEvidenceCitations(state.evidenceCitations),
        evidenceHash: computeEvidenceHash(dedupeEvidenceCitations(state.evidenceCitations)),
        confidence: 0.5,
        missingEvidence: [],
        verificationSteps: [
          `Awaiting human approval for tool: ${pendingApprovalState.toolName ?? "tool"}`,
        ],
        lastAgentName,
        errorSummary: null,
        durationMs: Date.now() - startedAtMs,
        toolFailures: [],
        proofChecks: [],
        retryAttempts: params.retryAttempts ?? 1,
        retryMaxAttempts: params.retryMaxAttempts ?? (params.retryAttempts ?? 1),
        retryMode: params.retryMode ?? "local",
        evidenceRetryPolicy: undefined,
        fallbackLineage: params.fallbackLineage,
        fallbackReason: params.fallbackReason,
      };

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

      const outputJson = {
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
      } as Prisma.InputJsonValue;

      const persisted = await persistFinalRunResult({
        runId: dbRun.id,
        status: "running",
        openaiResponseId,
        outputJson,
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

      emit({
        type: "done",
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
        .map((violation) =>
          `Proof path missing required group: ${violation.group.label}`
        )
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
    const confidence = status === "failed"
      ? 0.25
      : confidenceCandidate ?? (state.toolErrorMessages.length > 0 ? 0.45 : 0.72);

    const trust: AgentTrustEnvelope = {
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
      retryMode: params.retryMode ?? "local",
      evidenceRetryPolicy,
      fallbackLineage: params.fallbackLineage,
      fallbackReason: params.fallbackReason,
    };

    if (status !== "succeeded") {
      const fallback = buildFallbackOutput(status, missingEvidence);
      if (!finalText || finalText.length === 0) {
        finalText = fallback;
      }
    }

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

    const persisted = await persistFinalRunResult({
      runId: dbRun.id,
      status,
      openaiResponseId,
      outputJson: outputJson as unknown as Prisma.InputJsonValue,
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

    emit({
      type: "agent_summary",
      runId: dbRun.id,
      trust,
    });
    const doneStatus: "succeeded" | "failed" | "canceled" = status === "failed"
      ? "failed"
      : "succeeded";
    emit({
      type: "done",
      runId: dbRun.id,
      status: doneStatus,
      conversationId: params.conversationId,
    });

    void autoFeedRun({
      orgId: params.orgId,
      runId: dbRun.id,
      runType: params.runType ?? "ENRICHMENT",
      agentIntent:
        firstUserInput && typeof firstUserInput === "string"
          ? firstUserInput.slice(0, 280)
          : "agent run",
      finalOutputText: finalText,
      finalReport: finalReport ? (finalReport as unknown as Record<string, unknown>) : null,
      confidence: trust.confidence,
      evidenceHash:
        trust.evidenceHash ??
        computeEvidenceHash(
          trust.evidenceCitations.map((citation) => ({
            tool: citation.tool ?? "agent_tool",
            sourceId: citation.sourceId,
            snapshotId: citation.snapshotId,
            contentHash: citation.contentHash,
            url: citation.url,
            isOfficial: citation.isOfficial,
          })),
        ) ??
        "no-evidence-hash",
      toolsInvoked: trust.toolsInvoked,
      evidenceCitations: trust.evidenceCitations.map((citation) => ({
        tool: citation.tool,
        sourceId: citation.sourceId,
        snapshotId: citation.snapshotId,
        contentHash: citation.contentHash,
        url: citation.url,
        isOfficial: citation.isOfficial,
      })),
      retrievalMeta: {
        runId: dbRun.id,
        queryIntent: queryIntent ?? null,
        status,
        schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
        retrievalContext: retrievalContext ?? null,
        retrievalSummary: summarizeRetrievalContext(retrievalContext),
      },
      subjectId: dbRun.id,
      autoScore: trust.confidence,
    }).catch((error) => {
      logger.warn("Data Agent auto-feed failed after local run", {
        runId: dbRun.id,
        error: String(error),
      });
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
    logger.warn("Failed to compute retrieval context for run", {
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
