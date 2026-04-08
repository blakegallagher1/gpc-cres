import { prisma, type Prisma } from "@entitlement-os/db";
import * as Sentry from "@sentry/nextjs";
import { randomUUID } from "node:crypto";
import {
  executeAgentWorkflow,
  type AgentInputMessage,
  type AgentStreamEvent,
  toDatabaseRunId,
} from "../../../../apps/web/lib/agent/executeAgent";
import { getTemporalClient } from "../../../../apps/web/lib/workflowClient";
import { hashJsonSha256 } from "@entitlement-os/shared/crypto";
import { sleepMs } from "@entitlement-os/shared";
import { isDatabaseConnectivityError } from "@entitlement-os/db";
export { isDatabaseConnectivityError } from "@entitlement-os/db";
import {
  AGENT_RUN_STATE_KEYS,
  AGENT_RUN_STATE_STATUS,
  type AgentRunInputMessage,
  type AgentRunWorkflowInput,
  type AgentRunWorkflowOutput,
} from "@entitlement-os/shared";
import { PrismaChatSession } from "./chat-session.service";
import { buildPreferenceContext } from "../services/preference.service";
import { buildMemoryContext } from "../../../../apps/web/lib/services/memoryContextBuilder";
import type { AgentTrustEnvelope } from "../../../../apps/web/types/index";
import {
  buildBusinessMemoryContext,
  captureBusinessChatMemory,
} from "../../../../apps/web/lib/services/businessMemory.service";
import { buildLearningContext } from "../../../../apps/web/lib/services/learningContextBuilder";
import {
  mapFeaturesFromActionPayload,
  mergeMapFeatures,
} from "../../../../apps/web/lib/chat/mapFeatureUtils";
import { parseToolResultMapFeatures } from "../../../../apps/web/lib/chat/toolResultWrapper";
import type { MapFeature } from "../../../../apps/web/lib/chat/mapActionTypes";
import { logger } from "../../../../apps/web/lib/agent/loggerAdapter";
import { dispatchEvent } from "../../../../apps/web/lib/automation/events";
import type { ResearchLaneSelection } from "../../../../apps/web/lib/agent/researchRouting";

/**
 * Fire-and-forget dispatch of agent.run.completed for learning promotion (DA-007).
 * Only called for fresh runs — never for replayed/cached results.
 */
export function dispatchRunCompleted(opts: {
  runId: string;
  orgId: string;
  userId: string;
  status: "succeeded" | "failed" | "canceled";
  conversationId?: string | null;
  dealId?: string | null;
  jurisdictionId?: string | null;
  runType?: string | null;
  inputPreview?: string | null;
}): void {
  dispatchEvent({
    type: "agent.run.completed",
    runId: opts.runId,
    orgId: opts.orgId,
    userId: opts.userId,
    conversationId: opts.conversationId ?? null,
    dealId: opts.dealId ?? null,
    jurisdictionId: opts.jurisdictionId ?? null,
    runType: opts.runType ?? null,
    status: opts.status,
    inputPreview: opts.inputPreview ?? null,
    queryIntent: null,
  }).catch((error) => {
    logger.warn("Agent run completion event dispatch failed", {
      eventType: "agent.run.completed",
      runId: opts.runId,
      orgId: opts.orgId,
      userId: opts.userId,
      status: opts.status,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

const LOCAL_LEASE_GRACE_MS = 15 * 60 * 1000;
const LOCAL_LEASE_WAIT_MS = 60_000 * 10;
const RUN_LEASE_RETRY_MS = 700;
const LOCAL_LEASE_PREFIX = "local-run-";
const LOCAL_FALLBACK_RETRY_MODE = "local_fallback_after_temporal_start";
const LOCAL_FALLBACK_MAX_ATTEMPTS = 1;
type CuaModelPreference = "gpt-5.4" | "gpt-5.4-mini";

export type AgentRunInput = {
  orgId: string;
  userId: string;
  conversationId?: string | null;
  message?: string | null;
  input?: AgentInputMessage[];
  dealId?: string | null;
  jurisdictionId?: string | null;
  sku?: string | null;
  runType?: string;
  maxTurns?: number;
  correlationId?: string;
  persistConversation?: boolean;
  injectSystemContext?: boolean;
  onEvent?: (event: AgentStreamEvent) => void;
  /** Force routing to a specific query intent (e.g. "market_trajectory"). */
  intent?: string;
  preferredCuaModel?: CuaModelPreference;
  researchLane?: ResearchLaneSelection;
  /** Skip app DB usage and run without persistence. */
  ephemeralMode?: boolean;
};

type DealContext = {
  id: string;
  name: string;
  status: string;
  sku: string;
  jurisdiction: {
    id: string;
    name: string;
    state: string;
  } | null;
};

type JurisdictionContext = {
  id: string;
  name: string;
  state: string;
};

export const TEMPORAL_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || "entitlement-os";

function normalizeCorrelationId(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_.]/g, "-").slice(0, 120);
}

type PersistedAgentSummary = {
  status: "running" | "succeeded" | "failed" | "canceled";
  finalOutput: string;
  finalReport: Record<string, unknown> | null;
  toolsInvoked: string[];
  trust: {
    toolsInvoked: string[];
    packVersionsUsed: string[];
    evidenceCitations: Array<{ [key: string]: unknown }>;
    evidenceHash: string | null;
    confidence: number;
    missingEvidence: string[];
    verificationSteps: string[];
    lastAgentName?: string;
    errorSummary?: string | null;
    durationMs?: number;
    toolFailures?: string[];
    proofChecks?: string[];
    retryAttempts?: number;
    retryMaxAttempts?: number;
    retryMode?: string;
    fallbackLineage?: string[];
    fallbackReason?: string;
  };
  openaiResponseId: string | null;
  inputHash: string;
};

type PersistableAssistantTrust =
  | AgentTrustEnvelope
  | PersistedAgentSummary["trust"];

export function extractPhaseFromFinalReport(finalReport: Record<string, unknown> | null): string | null {
  if (!finalReport) return null;
  const phase = finalReport.phase;
  return typeof phase === "string" && phase.trim().length > 0 ? phase.trim() : null;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
}

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function extractRunIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const runId = (metadata as { runId?: unknown }).runId;
  return typeof runId === "string" && runId.length > 0 ? runId : null;
}

export async function resolvePreviousResponseIdFromHistory(
  orgId: string,
  history: Array<{ role: string; metadata?: unknown }>,
): Promise<string | null> {
  const lastAssistantWithRun = [...history]
    .reverse()
    .find((entry) => entry.role === "assistant" && extractRunIdFromMetadata(entry.metadata));
  const priorRunId = lastAssistantWithRun
    ? extractRunIdFromMetadata(lastAssistantWithRun.metadata)
    : null;
  if (!priorRunId) return null;

  const priorRun = await prisma.run.findFirst({
    where: { id: priorRunId, orgId },
    select: { outputJson: true, openaiResponseId: true },
  });

  const runState =
    priorRun && typeof priorRun.outputJson === "object" && priorRun.outputJson !== null
      ? (priorRun.outputJson as { runState?: unknown }).runState
      : null;
  const previousResponseIdFromState =
    runState &&
    typeof runState === "object" &&
    !Array.isArray(runState) &&
    typeof (runState as Record<string, unknown>)[AGENT_RUN_STATE_KEYS.previousResponseId] ===
      "string"
      ? ((runState as Record<string, unknown>)[AGENT_RUN_STATE_KEYS.previousResponseId] as string)
      : null;
  if (previousResponseIdFromState && previousResponseIdFromState.startsWith("resp")) {
    return previousResponseIdFromState;
  }

  return typeof priorRun?.openaiResponseId === "string" ? priorRun.openaiResponseId : null;
}

export function normalizePersistedAgentSummary(raw: {
  outputJson: unknown;
  status: unknown;
  inputHash: string | null;
  openaiResponseId: string | null;
}): PersistedAgentSummary {
  const output = typeof raw.outputJson === "object" && raw.outputJson !== null ? raw.outputJson : {};
  const runState =
    typeof (output as Record<string, unknown>).runState === "object" &&
    (output as Record<string, unknown>).runState !== null
      ? ((output as Record<string, unknown>).runState as Record<string, unknown>)
      : {};
  const finalOutput =
    typeof (output as Record<string, unknown>).finalOutput === "string"
      ? String((output as Record<string, unknown>).finalOutput)
      : typeof runState[AGENT_RUN_STATE_KEYS.partialOutput] === "string"
        ? String(runState[AGENT_RUN_STATE_KEYS.partialOutput])
        : "";
  const finalReport =
    typeof (output as Record<string, unknown>).finalReport === "object" &&
    (output as Record<string, unknown>).finalReport !== null
      ? ((output as Record<string, unknown>).finalReport as Record<string, unknown>)
      : null;

  return {
    status:
      typeof raw.status === "string" &&
      ["running", "succeeded", "failed", "canceled"].includes(raw.status)
        ? (raw.status as PersistedAgentSummary["status"])
        : "failed",
    finalOutput: finalOutput,
    finalReport,
    toolsInvoked: toStringArray((output as Record<string, unknown>).toolsInvoked),
    trust: {
      toolsInvoked: toStringArray((output as Record<string, unknown>).toolsInvoked),
      packVersionsUsed: toStringArray((output as Record<string, unknown>).packVersionsUsed),
      evidenceCitations: Array.isArray((output as Record<string, unknown>).evidenceCitations)
        ? ((output as Record<string, unknown>).evidenceCitations as Array<{ [key: string]: unknown }>)
        : [],
      evidenceHash:
        typeof (output as Record<string, unknown>).evidenceHash === "string"
          ? String((output as Record<string, unknown>).evidenceHash)
          : null,
      confidence:
        typeof (output as Record<string, unknown>).confidence === "number" &&
        Number.isFinite((output as Record<string, unknown>).confidence)
          ? ((output as Record<string, unknown>).confidence as number)
          : 0,
      missingEvidence: toStringArray((output as Record<string, unknown>).missingEvidence),
      verificationSteps: toStringArray((output as Record<string, unknown>).verificationSteps),
      lastAgentName:
        typeof (output as Record<string, unknown>).lastAgentName === "string"
          ? String((output as Record<string, unknown>).lastAgentName)
          : undefined,
      errorSummary:
        typeof (output as Record<string, unknown>).errorSummary === "string"
          ? String((output as Record<string, unknown>).errorSummary)
          : null,
      durationMs:
        typeof (output as Record<string, unknown>).durationMs === "number" &&
        Number.isFinite((output as Record<string, unknown>).durationMs)
          ? ((output as Record<string, unknown>).durationMs as number)
          : undefined,
      toolFailures:
        toStringArray((output as Record<string, unknown>).toolFailures).length > 0
          ? toStringArray((output as Record<string, unknown>).toolFailures)
          : toStringArray(runState[AGENT_RUN_STATE_KEYS.toolFailures]),
      proofChecks:
        toStringArray((output as Record<string, unknown>).proofChecks).length > 0
          ? toStringArray((output as Record<string, unknown>).proofChecks)
          : toStringArray(runState[AGENT_RUN_STATE_KEYS.proofChecks]),
      retryAttempts:
        typeof (output as Record<string, unknown>).retryAttempts === "number" &&
        Number.isFinite((output as Record<string, unknown>).retryAttempts)
          ? ((output as Record<string, unknown>).retryAttempts as number)
          : undefined,
      retryMaxAttempts:
        typeof (output as Record<string, unknown>).retryMaxAttempts === "number" &&
        Number.isFinite((output as Record<string, unknown>).retryMaxAttempts)
          ? ((output as Record<string, unknown>).retryMaxAttempts as number)
          : undefined,
      retryMode:
        typeof (output as Record<string, unknown>).retryMode === "string"
          ? String((output as Record<string, unknown>).retryMode)
          : undefined,
      fallbackLineage:
        toStringArray((output as Record<string, unknown>).fallbackLineage).length > 0
          ? toStringArray((output as Record<string, unknown>).fallbackLineage)
          : toStringArray(runState[AGENT_RUN_STATE_KEYS.fallbackLineage]),
      fallbackReason:
        typeof (output as Record<string, unknown>).fallbackReason === "string"
          ? String((output as Record<string, unknown>).fallbackReason)
          : typeof runState[AGENT_RUN_STATE_KEYS.fallbackReason] === "string"
            ? String(runState[AGENT_RUN_STATE_KEYS.fallbackReason])
            : undefined,
    },
    openaiResponseId: raw.openaiResponseId,
    inputHash: raw.inputHash ?? "",
  };
}

export async function loadCompletedRunResultById(
  runId: string,
  onEvent?: (event: AgentStreamEvent) => void,
): Promise<PersistedAgentSummary | null> {
  const pollStart = Date.now();
  let lastEmittedText = "";

  while (Date.now() - pollStart < LOCAL_LEASE_WAIT_MS) {
    const runRecord = await prisma.run.findUnique({
      where: { id: runId },
      select: { status: true, outputJson: true, inputHash: true, openaiResponseId: true },
    });

    if (!runRecord) return null;
    if (runRecord.status !== "running") {
      return normalizePersistedAgentSummary(runRecord);
    }

    const output = runRecord.outputJson as Record<string, unknown> | null;
    const runState = output && typeof output === "object" ? output.runState : null;
    const runStateRecord =
      runState && typeof runState === "object" ? (runState as Record<string, unknown>) : null;
    const partialOutput =
      runStateRecord && typeof runStateRecord[AGENT_RUN_STATE_KEYS.partialOutput] === "string"
        ? String(runStateRecord[AGENT_RUN_STATE_KEYS.partialOutput])
        : "";

    const toolsInvoked =
      runStateRecord && Array.isArray(runStateRecord[AGENT_RUN_STATE_KEYS.toolsInvoked])
        ? (runStateRecord[AGENT_RUN_STATE_KEYS.toolsInvoked] as unknown[]).filter(
            (value): value is string => typeof value === "string",
          )
        : [];
    const lastAgentName =
      runStateRecord && typeof runStateRecord[AGENT_RUN_STATE_KEYS.lastAgentName] === "string"
        ? String(runStateRecord[AGENT_RUN_STATE_KEYS.lastAgentName])
        : undefined;

    if (partialOutput.length > lastEmittedText.length) {
      const delta = partialOutput.slice(lastEmittedText.length);
      if (delta.length > 0) {
        onEvent?.({
          type: "text_delta",
          content: delta,
        });
        lastEmittedText = partialOutput;
      }
    } else if (partialOutput !== lastEmittedText) {
      lastEmittedText = partialOutput;
    }

    onEvent?.({
      type: "agent_progress",
      runId,
      status: "running",
      partialOutput,
      toolsInvoked,
      lastAgentName,
      runState: runStateRecord ?? undefined,
    });
    await sleepMs(RUN_LEASE_RETRY_MS);
  }
  return null;
}

export async function claimLocalRunLease(runId: string): Promise<string | null> {
  const leaseToken = `${LOCAL_LEASE_PREFIX}${randomUUID()}`;
  const cleanClaim = await prisma.run.updateMany({
    where: {
      id: runId,
      status: "running",
      openaiResponseId: null,
    },
    data: { openaiResponseId: leaseToken },
  });

  if (cleanClaim.count === 1) {
    return leaseToken;
  }

  const activeRun = await prisma.run.findUnique({
    where: { id: runId },
    select: { status: true, startedAt: true, openaiResponseId: true },
  });
  if (!activeRun || activeRun.status !== "running") {
    return null;
  }

  if (activeRun.openaiResponseId !== null) {
    const isStale = Date.now() - new Date(activeRun.startedAt).getTime() > LOCAL_LEASE_GRACE_MS;
    if (!isStale) {
      return null;
    }
  }

  const staleLease = await prisma.run.updateMany({
    where: {
      id: runId,
      status: "running",
    },
    data: { openaiResponseId: leaseToken },
  });

  return staleLease.count === 1 ? leaseToken : null;
}

export function buildRequestFingerprint(payload: {
  orgId: string;
  userId: string;
  conversationId?: string | null;
  message?: string | null;
  input?: AgentInputMessage[] | null;
  dealId?: string | null;
  jurisdictionId?: string | null;
  sku?: string | null;
  runType?: string;
  maxTurns?: number;
  runInputCorrelationId?: string | null;
  preferredCuaModel?: CuaModelPreference | null;
  researchLane?: ResearchLaneSelection;
}) {
  return hashJsonSha256({
    orgId: payload.orgId,
    userId: payload.userId,
    conversationId: payload.conversationId ?? null,
    message: payload.message ?? null,
    input: payload.input ?? null,
    dealId: payload.dealId ?? null,
    jurisdictionId: payload.jurisdictionId ?? null,
    sku: payload.sku ?? null,
    runType: payload.runType,
    maxTurns: payload.maxTurns,
    runInputCorrelationId: payload.runInputCorrelationId ?? null,
    preferredCuaModel: payload.preferredCuaModel ?? null,
    researchLane: payload.researchLane ?? "auto",
  });
}

export async function resolveTemporalHandleOrExisting(
  client: Awaited<ReturnType<typeof getTemporalClient>>,
  workflowId: string,
) {
  const handle = client.workflow.getHandle(workflowId);
  try {
    await handle.describe();
    return handle;
  } catch {
    return null;
  }
}

export function shouldUseTemporalAgentFlow(): boolean {
  if (process.env.ENABLE_TEMPORAL !== "true") {
    return false;
  }
  const temporalAddress = process.env.TEMPORAL_ADDRESS;
  return typeof temporalAddress === "string" && temporalAddress.length > 0;
}

export function mapTemporalTrustForEvents(trust: AgentRunWorkflowOutput["trust"]) {
  return {
    toolsInvoked: trust.toolsInvoked,
    packVersionsUsed: trust.packVersionsUsed,
    evidenceCitations: trust.evidenceCitations,
    evidenceHash: trust.evidenceHash ?? null,
    confidence: trust.confidence,
    researchLane: trust.researchLane,
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
    fallbackLineage: trust.fallbackLineage,
    fallbackReason: trust.fallbackReason,
  };
}

export function buildSystemContext(
  orgId: string,
  userId: string,
  dealId?: string | null,
  jurisdictionId?: string | null,
  sku?: string | null,
  preferenceContext?: string,
) {
  return [
    `[System context — use these values when calling tools]`,
    `orgId: ${orgId}`,
    `userId: ${userId}`,
    dealId ? `dealId: ${dealId}` : "",
    jurisdictionId ? `jurisdictionId: ${jurisdictionId}` : "",
    sku ? `sku: ${sku}` : "",
    preferenceContext ? `\n[Learned user preferences]\n${preferenceContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildJurisdictionContext(jurisdiction: JurisdictionContext | null) {
  if (!jurisdiction) return "";
  return [
    "Active jurisdiction context:",
    `jurisdictionId: ${jurisdiction.id}`,
    `jurisdiction: ${jurisdiction.name}, ${jurisdiction.state}`,
  ].join("\n");
}

export function toAgentInputMessage(entry: {
  role: string;
  content: string;
}): AgentInputMessage | null {
  if (entry.role === "assistant") {
    return {
      role: "assistant",
      status: "completed",
      content: [
        {
          type: "output_text",
          text: entry.content,
        },
      ],
    };
  }

  if (entry.role === "user") {
    return {
      role: "user",
      content: entry.content,
    };
  }

  return null;
}

export async function streamTemporalRunProgress(
  runId: string,
  onEvent?: (event: AgentStreamEvent) => void,
): Promise<void> {
  let lastEmittedText = "";
  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt > 60_000 * 10) {
      return;
    }

    const runRecord = await prisma.run.findUnique({
      where: { id: runId },
      select: { status: true, outputJson: true },
    });

    if (runRecord) {
      const output = runRecord.outputJson;
      const outputObject =
        output && typeof output === "object" && !Array.isArray(output)
          ? (output as Record<string, unknown>)
          : null;
      if (outputObject) {
        const runState = outputObject.runState;
        if (runState && typeof runState === "object" && runState !== null) {
          const runStateRecord = runState as Record<string, unknown>;
          const partialOutput =
            typeof runStateRecord[AGENT_RUN_STATE_KEYS.partialOutput] === "string"
              ? String(runStateRecord[AGENT_RUN_STATE_KEYS.partialOutput])
              : "";
          const toolsInvoked =
            Array.isArray(runStateRecord[AGENT_RUN_STATE_KEYS.toolsInvoked])
              ? (runStateRecord[AGENT_RUN_STATE_KEYS.toolsInvoked] as unknown[]).filter(
                  (value): value is string => typeof value === "string",
                )
              : [];
          const lastAgentName =
            typeof runStateRecord[AGENT_RUN_STATE_KEYS.lastAgentName] === "string"
              ? String(runStateRecord[AGENT_RUN_STATE_KEYS.lastAgentName])
              : undefined;

          if (partialOutput.length > lastEmittedText.length) {
            const delta = partialOutput.slice(lastEmittedText.length);
            if (delta.length > 0) {
              onEvent?.({
                type: "text_delta",
                content: delta,
              });
              lastEmittedText = partialOutput;
            }
          } else if (partialOutput !== lastEmittedText) {
            lastEmittedText = partialOutput;
          }

          onEvent?.({
            type: "agent_progress",
            runId,
            status: "running",
            partialOutput,
            toolsInvoked,
            lastAgentName,
            runState: runStateRecord ?? undefined,
          });

          if (runRecord.status !== "running") {
            return;
          }
        }
      }

      if (runRecord.status !== "running") {
        return;
      }
    }

    await sleepMs(700);
  }
}

export async function runAgentWorkflow(params: AgentRunInput) {
  const {
    orgId,
    userId,
    conversationId: requestedConversationId,
    message,
    input,
    dealId,
    jurisdictionId,
    sku,
    runType,
    maxTurns,
    correlationId: requestedCorrelationId,
    persistConversation = true,
    injectSystemContext = true,
    onEvent,
    intent: intentOverride,
    preferredCuaModel,
    researchLane,
    ephemeralMode = false,
  } = params;

  if (!message && !(input && input.length > 0)) {
    throw new Error("Either 'message' or 'input' is required.");
  }

  let referencedMapFeatures: MapFeature[] = [];
  const emitEvent = (event: AgentStreamEvent) => {
    if (event.type === "map_action") {
      referencedMapFeatures = mergeMapFeatures(
        referencedMapFeatures,
        mapFeaturesFromActionPayload(event.payload),
      );
    }

    if (event.type === "tool_end" && event.result !== undefined) {
      referencedMapFeatures = mergeMapFeatures(
        referencedMapFeatures,
        parseToolResultMapFeatures(event.result) ?? [],
      );
    }

    onEvent?.(event);
  };
  const buildAssistantMessageMetadata = (
    runId: string,
    openaiResponseId: string | null,
    trust?: PersistableAssistantTrust | null,
    phase?: string | null,
  ) =>
    toJsonValue({
      kind: "chat_assistant_message",
      runId,
      openaiResponseId,
      ...(trust ? { trust } : {}),
      ...(phase ? { phase } : {}),
      ...(referencedMapFeatures.length > 0
        ? { mapFeatures: referencedMapFeatures }
        : {}),
    });

  if (ephemeralMode) {
    const ephemeralAgentInput = input && input.length > 0
      ? [...input]
      : message
        ? [{ role: "user", content: message } satisfies AgentInputMessage]
        : [];
    const ephemeralSystemContext = buildSystemContext(
      orgId,
      userId,
      dealId ?? undefined,
      jurisdictionId ?? undefined,
      sku ?? undefined,
      undefined,
    );
    if (
      injectSystemContext &&
      ephemeralSystemContext.length > 0 &&
      ephemeralAgentInput.length > 0 &&
      ephemeralAgentInput[0].role === "user"
    ) {
      ephemeralAgentInput[0] = {
        ...ephemeralAgentInput[0],
        content: `${ephemeralSystemContext}\n\n${ephemeralAgentInput[0].content}`,
      };
    }
    const ephemeralIntentHint =
      message ?? [...ephemeralAgentInput].reverse().find((entry) => entry.role === "user")?.content;
    const result = await executeAgentWorkflow({
      orgId,
      userId,
      conversationId: "agent-run",
      input: ephemeralAgentInput,
      runId: `agent-ephemeral-${buildRequestFingerprint({
        orgId,
        userId,
        conversationId: null,
        message,
        input: input ?? null,
        dealId: dealId ?? null,
        jurisdictionId: jurisdictionId ?? null,
        sku: sku ?? null,
        runType,
        maxTurns,
        runInputCorrelationId: requestedCorrelationId ?? null,
        preferredCuaModel: preferredCuaModel ?? null,
        researchLane: researchLane ?? "auto",
      })}`,
      runType,
      maxTurns,
      intentHint: ephemeralIntentHint,
      queryIntentOverride: intentOverride as import("@entitlement-os/openai").QueryIntent | undefined,
      preferredCuaModel,
      researchLaneOverride: researchLane,
      previousResponseId: null,
      onEvent: emitEvent,
      skipRunPersistence: true,
    });
    return {
      result,
      conversationId: null,
      agentInput: ephemeralAgentInput,
    };
  }

  let conversationId = requestedConversationId ?? null;
  let chatSession: PrismaChatSession | null = null;
  let contextDeal: DealContext | null = null;
  let jurisdictionContext: JurisdictionContext | null = null;
  let previousResponseId: string | null = null;

  if (dealId) {
    contextDeal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: {
        id: true,
        name: true,
        status: true,
        sku: true,
        jurisdiction: {
          select: { id: true, name: true, state: true },
        },
      },
    });

    if (!contextDeal) {
      // Non-fatal: if deal lookup fails (DB unreachable or deal doesn't exist),
      // continue without deal context rather than blocking the entire chat.
      logger.warn("Agent runner missing deal context", {
        dealId,
        orgId,
      });
    }

    jurisdictionContext = contextDeal?.jurisdiction
      ? {
          id: contextDeal.jurisdiction.id,
          name: contextDeal.jurisdiction.name,
          state: contextDeal.jurisdiction.state,
        }
      : null;
  } else if (jurisdictionId) {
    const jurisdiction = await prisma.jurisdiction.findFirst({
      where: { id: jurisdictionId, orgId },
      select: { id: true, name: true, state: true },
    });
    if (!jurisdiction) {
      throw new Error("Jurisdiction not found or access denied");
    }
    jurisdictionContext = jurisdiction;
  }

  if (conversationId) {
    Sentry.setConversationId(conversationId);
    if (!persistConversation) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, orgId },
        select: { id: true },
      });
      if (!conversation) {
        throw new Error("Conversation not found");
      }
    }
  }

  const preferenceContext = await buildPreferenceContext(orgId, userId);

  let memoryBlock = "";
  if (message && dealId) {
    try {
      const dealParcels = await prisma.parcel.findMany({
        where: { dealId, orgId },
        select: { id: true, address: true },
        take: 1,
      });
      if (dealParcels.length > 0) {
        const parcel = dealParcels[0];
        const internalEntity = await prisma.internalEntity.findFirst({
          where: { orgId, parcelId: parcel.id },
          select: { id: true },
        });
        if (internalEntity) {
          const memCtx = await buildMemoryContext({
            userMessage: message,
            entityId: internalEntity.id,
            orgId,
            address: parcel.address ?? undefined,
            parcelId: parcel.id,
          });
          if (memCtx) {
            memoryBlock = memCtx.contextBlock;
          }
        }
      }
    } catch {
      // Memory context is best-effort; never block the chat flow
    }
  }

  let agentInput: AgentInputMessage[];
  let businessMemoryBlock = "";
  let learningContextBlock = "";
  let persistedUserMessageId: string | null = null;
  let persistedUserMessageCreatedAt: Date | undefined;

  const hasInputOverride = input && input.length > 0;
  const shouldCreateConversation =
    persistConversation && !conversationId && (Boolean(dealId) || hasInputOverride || Boolean(message));

  if (persistConversation) {
    chatSession = await PrismaChatSession.create({
      orgId,
      userId,
      conversationId,
      dealId: contextDeal?.id ?? dealId ?? null,
      title: message ? message.slice(0, 100) : "Agent run",
      autoCreate: shouldCreateConversation,
    });
    conversationId = chatSession.getConversationId();
  }

  if (hasInputOverride) {
    agentInput = [...input];
  } else {
    if (chatSession) {
      await chatSession.runCompaction();
    }
    const history = chatSession
      ? await chatSession.getItems({ limit: 50 })
      : !conversationId || !persistConversation
        ? []
        : await prisma.message.findMany({
            where: {
              conversationId,
              conversation: {
                orgId,
              },
            },
            orderBy: { createdAt: "asc" },
            take: 50,
            select: {
              role: true,
              content: true,
              metadata: true,
            },
          });

    previousResponseId = await resolvePreviousResponseIdFromHistory(orgId, history);

    agentInput = history
      .map((entry: { role: string; content: string }) =>
        toAgentInputMessage({ role: entry.role, content: entry.content }),
      )
      .filter((entry: AgentInputMessage | null): entry is AgentInputMessage => entry !== null);

    if (message) {
      agentInput.push({ role: "user", content: message });
    }

    if (persistConversation && message && chatSession) {
      const persistedItems = await chatSession.addItems([
        {
          role: "user",
          content: message,
          metadata: { kind: "chat_user_message" },
        },
      ]);
      const persistedUserMessage =
        persistedItems.find((item) => item.role === "user") ?? null;
      persistedUserMessageId = persistedUserMessage?.id ?? null;
      persistedUserMessageCreatedAt = persistedUserMessage?.createdAt;
    }
  }

  if (message) {
    try {
      const businessMemoryContext = await buildBusinessMemoryContext({
        orgId,
        userId,
        userMessage: message,
        conversationId,
        dealId: contextDeal?.id ?? dealId ?? null,
      });
      businessMemoryBlock = businessMemoryContext.contextBlock;
    } catch {
      // Business memory retrieval is best-effort; never block the chat flow.
    }

    try {
      const learningContext = await buildLearningContext({
        orgId,
        userId,
        userMessage: message,
        conversationId: conversationId ?? null,
        dealId: contextDeal?.id ?? dealId ?? null,
        jurisdictionId: jurisdictionContext?.id ?? jurisdictionId ?? null,
        runTypeHint: runType ?? null,
      });
      learningContextBlock = learningContext.contextBlock;
    } catch {
      // Learning context retrieval is best-effort; never block the chat flow.
    }
  }

  const systemContext = [
    buildSystemContext(orgId, userId, dealId, jurisdictionId, sku, preferenceContext),
    buildJurisdictionContext(jurisdictionContext),
    contextDeal
      ? [
          "Current deal context:",
          `Deal: ${contextDeal.name} (${contextDeal.status})`,
          `Deal ID: ${contextDeal.id}`,
          `Jurisdiction: ${contextDeal.jurisdiction?.name ?? "Unknown"}, ${
            contextDeal.jurisdiction?.state ?? "LA"
          }`,
          `SKU: ${contextDeal.sku}`,
        ].join("\n")
      : "",
    memoryBlock,
    businessMemoryBlock,
    learningContextBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (message && persistedUserMessageId) {
    try {
      await captureBusinessChatMemory({
        orgId,
        userId,
        messageId: persistedUserMessageId,
        messageText: message,
        conversationId,
        dealId: contextDeal?.id ?? dealId ?? null,
        createdAt: persistedUserMessageCreatedAt,
      });
    } catch {
      // Business memory capture is best-effort; never block the chat flow.
    }
  }

  const lastUserEntry = [...agentInput].reverse().find((entry) => entry.role === "user");
  const intentHint = message ?? lastUserEntry?.content;
  if (injectSystemContext && agentInput.length > 0 && agentInput[0].role === "user") {
    agentInput[0] = {
      ...agentInput[0],
      content: `${systemContext}\n\n${agentInput[0].content}`,
    };
  }

  if (shouldUseTemporalAgentFlow()) {
    const client = await getTemporalClient();
    const requestFingerprint = buildRequestFingerprint({
      orgId,
      userId,
      conversationId: conversationId ?? null,
      message,
      input: hasInputOverride ? input : null,
      dealId: dealId ?? null,
      jurisdictionId: jurisdictionId ?? null,
      sku: sku ?? null,
      runType,
      maxTurns,
      runInputCorrelationId: requestedCorrelationId ?? null,
      preferredCuaModel: preferredCuaModel ?? null,
      researchLane: researchLane ?? "auto",
    });
    const correlationId = normalizeCorrelationId(
      requestedCorrelationId ?? requestFingerprint,
    );
    const workflowId = `agent-run-${correlationId}`;
    const persistedRunId = toDatabaseRunId(workflowId);
    let fallbackReason: string | undefined;
    let fallbackLineage: string[] = ["local-fallback"];
    let temporalStartFailure: string | undefined;

    const priorRun = await prisma.run.findUnique({
      where: { id: persistedRunId },
      select: { status: true, outputJson: true, inputHash: true, openaiResponseId: true },
    });

    const priorLineage =
      priorRun?.outputJson &&
      typeof priorRun.outputJson === "object" &&
      !Array.isArray(priorRun.outputJson) &&
      typeof (priorRun.outputJson as { runState?: unknown }).runState === "object"
        ? toStringArray(
            ((priorRun.outputJson as { runState?: unknown }).runState as {
              [AGENT_RUN_STATE_KEYS.fallbackLineage]?: unknown;
            })[AGENT_RUN_STATE_KEYS.fallbackLineage],
          )
        : [];
    fallbackLineage = Array.from(new Set([...fallbackLineage, ...priorLineage]));

    if (priorRun && priorRun.status !== "running") {
      const replay = normalizePersistedAgentSummary(priorRun);
      emitEvent({
        type: "agent_summary",
        runId: workflowId,
        trust: mapTemporalTrustForEvents(replay.trust),
      });
      emitEvent({
        type: "done",
        runId: workflowId,
        status: replay.status === "succeeded" ? "succeeded" : "failed",
        conversationId: conversationId ?? undefined,
      });
      return {
        result: {
          runId: workflowId,
          status: replay.status,
          finalOutput: replay.finalOutput,
          finalReport: replay.finalReport,
          toolsInvoked: replay.toolsInvoked,
          trust: mapTemporalTrustForEvents(replay.trust),
          openaiResponseId: replay.openaiResponseId,
          inputHash: replay.inputHash,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        conversationId,
        agentInput,
      };
    }

    if (priorRun?.status === "running") {
      const replay = await loadCompletedRunResultById(persistedRunId, emitEvent);
      if (replay && replay.status !== "running") {
        emitEvent({
          type: "agent_summary",
          runId: workflowId,
          trust: mapTemporalTrustForEvents(replay.trust),
        });
        emitEvent({
          type: "done",
          runId: workflowId,
          status: replay.status === "succeeded" ? "succeeded" : "failed",
          conversationId: conversationId ?? undefined,
        });
        return {
          result: {
            runId: workflowId,
            status: replay.status,
            finalOutput: replay.finalOutput,
            finalReport: replay.finalReport,
            toolsInvoked: replay.toolsInvoked,
            trust: mapTemporalTrustForEvents(replay.trust),
            openaiResponseId: replay.openaiResponseId,
            inputHash: replay.inputHash,
            startedAt: new Date(),
            finishedAt: new Date(),
          },
          conversationId,
          agentInput,
        };
      }
    }

    const workflowInput: AgentRunWorkflowInput = {
      orgId,
      userId,
      conversationId: conversationId ?? "agent-run",
      previousResponseId,
      input: agentInput as AgentRunInputMessage[],
      runId: workflowId,
      correlationId,
      runType,
      maxTurns,
      dealId: dealId ?? null,
      jurisdictionId: jurisdictionId ?? null,
      sku: sku ?? null,
      intentHint,
    };

    let handle;
    try {
      handle = await client.workflow.start("agentRunWorkflow", {
        taskQueue: TEMPORAL_TASK_QUEUE,
        workflowId,
        args: [workflowInput],
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      });
    } catch (error) {
      temporalStartFailure = error instanceof Error ? error.message : "Unable to start temporal workflow";
      handle = await resolveTemporalHandleOrExisting(client, workflowId);
    }

    if (handle) {
      const resultPromise = handle.result() as Promise<AgentRunWorkflowOutput>;
      const progressPromise = streamTemporalRunProgress(persistedRunId, emitEvent).catch(() => {});
      const workflowResult = await resultPromise;
      await progressPromise;

      if (workflowResult.correlationId && workflowResult.correlationId !== correlationId) {
        emitEvent({
          type: "agent_progress",
          runId: workflowResult.runId,
          status: "running",
          partialOutput: "",
          correlationId,
        });
      }

      if (persistConversation && conversationId && workflowResult.finalOutput.length > 0) {
        if (chatSession) {
          await chatSession.addItems([
            {
              role: "assistant",
              content: workflowResult.finalOutput,
              metadata: buildAssistantMessageMetadata(
                workflowResult.runId,
                workflowResult.openaiResponseId,
                mapTemporalTrustForEvents(workflowResult.trust),
                extractPhaseFromFinalReport(workflowResult.finalReport),
              ),
            },
          ]);
        } else {
          await prisma.message.create({
            data: {
              conversationId,
              role: "assistant",
              content: workflowResult.finalOutput,
              metadata: buildAssistantMessageMetadata(
                workflowResult.runId,
                workflowResult.openaiResponseId,
                mapTemporalTrustForEvents(workflowResult.trust),
                extractPhaseFromFinalReport(workflowResult.finalReport),
              ),
            },
          });
        }
      }

      emitEvent({
        type: "agent_summary",
        runId: workflowResult.runId,
        trust: mapTemporalTrustForEvents(workflowResult.trust),
      });
      emitEvent({
        type: "done",
        runId: workflowResult.runId,
        status: workflowResult.status === "succeeded" ? "succeeded" : "failed",
        conversationId: conversationId ?? undefined,
      });

      dispatchRunCompleted({
        runId: workflowResult.runId,
        orgId,
        userId,
        status: workflowResult.status === "succeeded" ? "succeeded" : "failed",
        conversationId,
        dealId,
        jurisdictionId,
        runType,
        inputPreview: message ? message.slice(0, 500) : null,
      });

      return {
        result: {
          runId: workflowResult.runId,
          status: workflowResult.status,
          finalOutput: workflowResult.finalOutput,
          finalReport: workflowResult.finalReport,
          toolsInvoked: workflowResult.toolsInvoked,
          trust: mapTemporalTrustForEvents(workflowResult.trust),
          openaiResponseId: workflowResult.openaiResponseId,
          inputHash: workflowResult.inputHash,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        conversationId,
        agentInput,
      };
    }

    fallbackReason = temporalStartFailure ?? "Temporal workflow unavailable";

    const replay = await loadCompletedRunResultById(persistedRunId, emitEvent);
    if (replay && replay.status !== "running") {
      emitEvent({
        type: "agent_summary",
        runId: workflowId,
        trust: mapTemporalTrustForEvents(replay.trust),
      });
      emitEvent({
        type: "done",
        runId: workflowId,
        status: replay.status === "succeeded" ? "succeeded" : "failed",
        conversationId: conversationId ?? undefined,
      });
      return {
        result: {
          runId: workflowId,
          status: replay.status,
          finalOutput: replay.finalOutput,
          finalReport: replay.finalReport,
          toolsInvoked: replay.toolsInvoked,
          trust: mapTemporalTrustForEvents(replay.trust),
          openaiResponseId: replay.openaiResponseId,
          inputHash: replay.inputHash,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        conversationId,
        agentInput,
      };
    }

    const leaseToken = await claimLocalRunLease(persistedRunId);
    if (!leaseToken) {
      const replay = await loadCompletedRunResultById(persistedRunId, emitEvent);
      if (replay && replay.status !== "running") {
        emitEvent({
          type: "agent_summary",
          runId: workflowId,
          trust: mapTemporalTrustForEvents(replay.trust),
        });
        emitEvent({
          type: "done",
          runId: workflowId,
          status: replay.status === AGENT_RUN_STATE_STATUS.SUCCEEDED ? "succeeded" : "failed",
          conversationId: conversationId ?? undefined,
        });
        return {
          result: {
            runId: workflowId,
            status: replay.status,
            finalOutput: replay.finalOutput,
            finalReport: replay.finalReport,
            toolsInvoked: replay.toolsInvoked,
            trust: mapTemporalTrustForEvents(replay.trust),
            openaiResponseId: replay.openaiResponseId,
            inputHash: replay.inputHash,
            startedAt: new Date(),
            finishedAt: new Date(),
          },
          conversationId,
          agentInput,
        };
      }
      throw new Error(`Local run lease unavailable for ${workflowId}.`);
    }

    const result = await executeAgentWorkflow({
      orgId,
      userId,
      conversationId: conversationId ?? "agent-run",
      input: agentInput,
      runId: workflowId,
      runType,
      maxTurns,
      correlationId,
      retryMode: LOCAL_FALLBACK_RETRY_MODE,
      retryAttempts: 1,
      retryMaxAttempts: LOCAL_FALLBACK_MAX_ATTEMPTS,
      executionLeaseToken: leaseToken,
      fallbackLineage,
      fallbackReason,
      dealId: dealId ?? undefined,
      jurisdictionId: jurisdictionId ?? undefined,
      sku: sku ?? undefined,
      intentHint,
      queryIntentOverride: intentOverride as import("@entitlement-os/openai").QueryIntent | undefined,
      preferredCuaModel,
      researchLaneOverride: researchLane,
      previousResponseId,
      onEvent: emitEvent,
    });

    if (persistConversation && conversationId && result.finalOutput.length > 0) {
      if (chatSession) {
        await chatSession.addItems([
          {
            role: "assistant",
            content: result.finalOutput,
            metadata: buildAssistantMessageMetadata(
              result.runId,
              result.openaiResponseId,
              result.trust,
              extractPhaseFromFinalReport(result.finalReport),
            ),
          },
        ]);
      } else {
        await prisma.message.create({
          data: {
            conversationId,
            role: "assistant",
            content: result.finalOutput,
            metadata: buildAssistantMessageMetadata(
              result.runId,
              result.openaiResponseId,
              result.trust,
              extractPhaseFromFinalReport(result.finalReport),
            ),
          },
        });
      }
    }

    dispatchRunCompleted({
      runId: result.runId,
      orgId,
      userId,
      status: result.status === "succeeded" ? "succeeded" : "failed",
      conversationId,
      dealId,
      jurisdictionId,
      runType,
      inputPreview: message ? message.slice(0, 500) : null,
    });

    return {
      result,
      conversationId,
      agentInput,
    };
  }

  const result = await executeAgentWorkflow({
    orgId,
    userId,
    conversationId: conversationId ?? "agent-run",
    input: agentInput,
    runId: `agent-run-${buildRequestFingerprint({
      orgId,
      userId,
      conversationId: conversationId ?? null,
      message,
      input: hasInputOverride ? input : null,
      dealId: dealId ?? null,
      jurisdictionId: jurisdictionId ?? null,
      sku: sku ?? null,
      runType,
      maxTurns,
      runInputCorrelationId: requestedCorrelationId ?? null,
      preferredCuaModel: preferredCuaModel ?? null,
      researchLane: researchLane ?? "auto",
    })}`,
    runType,
    maxTurns,
    dealId: dealId ?? undefined,
    jurisdictionId: jurisdictionId ?? undefined,
    sku: sku ?? undefined,
    intentHint,
    queryIntentOverride: intentOverride as import("@entitlement-os/openai").QueryIntent | undefined,
    preferredCuaModel,
    researchLaneOverride: researchLane,
    previousResponseId,
    onEvent: emitEvent,
  });

  if (persistConversation && conversationId && result.finalOutput.length > 0) {
    if (chatSession) {
      await chatSession.addItems([
        {
          role: "assistant",
          content: result.finalOutput,
          metadata: buildAssistantMessageMetadata(
            result.runId,
            result.openaiResponseId,
            result.trust,
            extractPhaseFromFinalReport(result.finalReport),
          ),
        },
      ]);
    } else {
      await prisma.message.create({
        data: {
          conversationId,
          role: "assistant",
          content: result.finalOutput,
          metadata: buildAssistantMessageMetadata(
            result.runId,
            result.openaiResponseId,
            result.trust,
            extractPhaseFromFinalReport(result.finalReport),
          ),
        },
      });
    }
  }

  dispatchRunCompleted({
    runId: result.runId,
    orgId,
    userId,
    status: result.status === "succeeded" ? "succeeded" : "failed",
    conversationId,
    dealId,
    jurisdictionId,
    runType,
    inputPreview: message ? message.slice(0, 500) : null,
  });

  return {
    result,
    conversationId,
    agentInput,
  };
}
