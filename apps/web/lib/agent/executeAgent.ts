import { assistant as assistantMessage, run, user as userMessage } from "@openai/agents";
import { SKU_TYPES } from "@entitlement-os/shared";
import { hashJsonSha256 } from "@entitlement-os/shared/crypto";
import { prisma } from "@entitlement-os/db";
import {
  buildAgentStreamRunOptions,
  createConfiguredCoordinator,
} from "@entitlement-os/openai";

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

export type AgentTrustEnvelope = {
  toolsInvoked: string[];
  packVersionsUsed: string[];
  evidenceCitations: Array<{
    tool: string;
    sourceId?: string;
    snapshotId?: string;
    contentHash?: string;
    url?: string;
    isOfficial?: boolean;
  }>;
  confidence: number;
  missingEvidence: string[];
  verificationSteps: string[];
};

type AgentExecutionResult = {
  runId: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  finalOutput: string;
  toolsInvoked: string[];
  trust: AgentTrustEnvelope;
  openaiResponseId: string | null;
  inputHash: string;
  startedAt: Date;
  finishedAt: Date;
};

function normalizeSku(sku: string | undefined): (typeof SKU_TYPES)[number] | null {
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
  runType?: string;
  maxTurns?: number;
  dealId?: string;
  jurisdictionId?: string;
  sku?: string;
  onEvent?: (event: AgentStreamEvent) => void;
};

type ToolEventState = {
  toolsInvoked: Set<string>;
  packVersionsUsed: Set<string>;
  evidenceCitations: Array<{
    tool: string;
    sourceId?: string;
    snapshotId?: string;
    contentHash?: string;
    url?: string;
    isOfficial?: boolean;
  }>;
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

  const dbRun = await prisma.run.create({
    data: {
      orgId: params.orgId,
      runType: (params.runType ?? "ENRICHMENT") as
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
        | "DEADLINE_MONITOR",
      dealId: params.dealId ?? null,
      jurisdictionId: params.jurisdictionId ?? null,
      sku: normalizeSku(params.sku),
      status: "running",
      inputHash,
    },
    select: { id: true },
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

    const coordinator = createConfiguredCoordinator();
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
    const missingEvidence = finalizeMissingEvidence(state);
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
      evidenceCitations: state.evidenceCitations,
      confidence: Math.max(0, Math.min(1, confidence)),
      missingEvidence,
      verificationSteps: buildVerificationSteps(missingEvidence),
    };

    if (status !== "succeeded") {
      const fallback = buildFallbackOutput(status, missingEvidence);
      if (!finalText || finalText.length === 0) {
        finalText = fallback;
      }
    }

    await prisma.run.update({
      where: { id: dbRun.id },
      data: {
        status,
        finishedAt: new Date(),
        openaiResponseId,
        outputJson: {
          toolsInvoked: trust.toolsInvoked,
          packVersionsUsed: trust.packVersionsUsed,
          evidenceCitations: trust.evidenceCitations,
          confidence: trust.confidence,
          missingEvidence: trust.missingEvidence,
          verificationSteps: trust.verificationSteps,
          lastAgentName,
          durationMs: Date.now() - startedAtMs,
          errorSummary: errorMessage ?? null,
        },
      },
    });

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
      toolsInvoked: trust.toolsInvoked,
      trust,
      openaiResponseId,
      inputHash,
      startedAt,
      finishedAt: new Date(),
    };
  }
}
