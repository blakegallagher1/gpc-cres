import { assistant as assistantMessage, run, user as userMessage } from "@openai/agents";
import {
  AgentReport,
  AgentReportSchema,
  SKU_TYPES,
  AGENT_RUN_STATE_KEYS,
  AGENT_RUN_STATE_SCHEMA_VERSION,
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
import {
  buildAgentStreamRunOptions,
  createIntentAwareCoordinator,
  evaluateProofCompliance,
  inferQueryIntentFromText,
  getProofGroupsForIntent,
} from "@entitlement-os/openai";
import { AgentTrustEnvelope } from "@/types";

export type AgentInputMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      status: "completed";
      content: Array<{ type: "output_text"; text: string }>;
    };

export type AgentStreamEvent =
  | { type: "agent_switch"; agentName: string }
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
  conversationId: string;
  input: AgentInputMessage[];
  runId?: string;
  runType?: string;
  maxTurns?: number;
  dealId?: string;
  jurisdictionId?: string;
  sku?: string;
  intentHint?: string;
  onEvent?: (event: AgentStreamEvent) => void;
  correlationId?: string;
  retryMode?: string;
  retryAttempts?: number;
  retryMaxAttempts?: number;
  fallbackLineage?: string[];
  fallbackReason?: string;
  executionLeaseToken?: string;
};

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

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value > 1 && value <= 100) return value / 100;
  if (value >= 0 && value <= 1) return value;
  return null;
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

type RunRecordSnapshot = {
  id: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  inputHash: string;
  outputJson: Prisma.JsonValue;
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
      openaiResponseId: true,
      startedAt: true,
      finishedAt: true,
    },
  });
}

export async function executeAgentWorkflow(
  params: AgentExecutionParams,
): Promise<AgentExecutionResult> {
  const startedAt = new Date();
  const startedAtMs = startedAt.getTime();
  const inputHash = hashJsonSha256({
    orgId: params.orgId,
    userId: params.userId,
    conversationId: params.conversationId,
    runType: params.runType ?? "ENRICHMENT",
    dealId: params.dealId ?? null,
    jurisdictionId: params.jurisdictionId ?? null,
    input: params.input,
  });
  const firstUserInput = params.input.find((entry) => entry.role === "user")?.content;
  const userTextForIntent = params.intentHint ?? firstUserInput;
  const queryIntent = inferQueryIntentFromText(userTextForIntent);
  const runId = params.runId ?? `agent-run-${hashJsonSha256({ inputHash, runType: params.runType ?? "ENRICHMENT" })}`;

  if (params.runId) {
    const existingRun = (await prisma.run.findUnique({
      where: { id: params.runId },
      select: {
        id: true,
        status: true,
        inputHash: true,
        outputJson: true,
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

  const emit = (event: AgentStreamEvent) => {
    params.onEvent?.(event);
  };

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured on the server.");
    }

    const coordinator = createIntentAwareCoordinator(queryIntent);
    emit({ type: "agent_switch", agentName: "Coordinator" });

    const result = await run(
      coordinator,
      buildAgentInputItems(params.input),
      buildAgentStreamRunOptions({
        conversationId: params.conversationId,
        maxTurns: params.maxTurns,
      }),
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
            isRecord(current.agent) && typeof current.agent?.["name"] === "string"
              ? (current.agent?.["name"] as string)
              : "Coordinator";
          lastAgentName = agentName;
          emit({ type: "agent_switch", agentName });
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

        const toolName = getToolName(current);
        if (toolName) {
          state.toolsInvoked.add(toolName);
          const output = extractToolOutput(current);
          if (output !== null) {
            collectToolOutputSignals(toolName, output, state);
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
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message : "Agent execution failed";
    state.toolErrorMessages.push(errorMessage);
    state.missingEvidence.add(`Execution failure: ${errorMessage}`);
    emit({ type: "error", message: errorMessage });
  } finally {
    if (status === "succeeded") {
      const sanitizedOutput = sanitizeOutputText(finalText);
      const parsed = safeParseJson(sanitizedOutput);
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
        .map((violation) =>
          `Proof path missing required group: ${violation.group.label}`
        )
        .join("; ");
      errorMessage ??= proofMessage;
      state.toolErrorMessages.push(`proof_enforcement: ${proofMessage}`);
    }
    const missingEvidence = finalizeMissingEvidence(state);
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
      fallbackLineage: trust.fallbackLineage,
      fallbackReason: trust.fallbackReason,
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
      fallbackLineage: trust.fallbackLineage,
      fallbackReason: trust.fallbackReason,
      durationMs: Date.now() - startedAtMs,
      finalReport: finalReport ?? null,
      finalOutput: finalText,
    };

    const persisted = await persistFinalRunResult({
      runId: dbRun.id,
      status,
      openaiResponseId,
      outputJson: outputJson as unknown as Prisma.InputJsonValue,
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
