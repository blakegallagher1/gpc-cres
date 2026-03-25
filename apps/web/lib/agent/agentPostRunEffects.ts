import { prisma } from "@entitlement-os/db";
import { AGENT_RUN_STATE_SCHEMA_VERSION, type DataAgentRetrievalContext } from "@entitlement-os/shared";
import { computeEvidenceHash } from "@entitlement-os/shared/evidence";
import {
  isAgentOsFeatureEnabled,
  runCriticEvaluation,
  type QueryIntent,
} from "@entitlement-os/openai";
import type { AgentReport } from "@entitlement-os/shared";
import type { AgentTrustEnvelope } from "@/types";
import { autoFeedRun } from "@/lib/agent/dataAgentAutoFeed.service";
import { AUTOMATION_CONFIG } from "@/lib/automation/config";
import { dispatchEvent } from "@/lib/automation/events";
import { logger } from "./loggerAdapter";

/**
 * Runs the asynchronous side effects that happen after a local agent run is
 * persisted: learning promotion dispatch, auto-feed, and critic evaluation.
 */
export async function runAgentPostRunEffects(params: {
  runId: string;
  orgId: string;
  userId: string;
  conversationId?: string | null;
  dealId?: string | null;
  jurisdictionId?: string | null;
  runType?: string | null;
  status: "running" | "succeeded" | "failed" | "canceled";
  firstUserInput: unknown;
  queryIntent: QueryIntent | null;
  skipRunPersistence: boolean;
  ingestionOnly: boolean;
  finalText: string;
  finalReport: AgentReport | null;
  trust: AgentTrustEnvelope;
  retrievalContext: DataAgentRetrievalContext | null;
  retrievalSummary: Record<string, unknown>;
}): Promise<void> {
  if (
    !params.skipRunPersistence &&
    AUTOMATION_CONFIG.agentLearning.enabled &&
    params.status !== "running"
  ) {
    const inputPreview =
      typeof params.firstUserInput === "string"
        ? params.firstUserInput.slice(0, 2000)
        : null;

    await prisma.run.update({
      where: { id: params.runId },
      data: {
        memoryPromotionStatus: "pending",
        memoryPromotionError: null,
        memoryPromotedAt: null,
      },
    });

    void dispatchEvent({
      type: "agent.run.completed",
      runId: params.runId,
      orgId: params.orgId,
      userId: params.userId,
      conversationId: params.conversationId ?? null,
      dealId: params.dealId ?? null,
      jurisdictionId: params.jurisdictionId ?? null,
      runType: params.runType ?? null,
      status:
        params.status === "succeeded"
          ? "succeeded"
          : params.status === "failed"
            ? "failed"
            : "canceled",
      inputPreview,
      queryIntent: params.queryIntent ?? null,
    }).catch((error) => {
      logger.warn("Agent learning event dispatch failed", {
        runId: params.runId,
        error: String(error),
      });
    });
  }

  if (!params.skipRunPersistence && !params.ingestionOnly) {
    void autoFeedRun({
      orgId: params.orgId,
      runId: params.runId,
      runType: params.runType ?? "ENRICHMENT",
      agentIntent:
        typeof params.firstUserInput === "string"
          ? params.firstUserInput.slice(0, 280)
          : "agent run",
      finalOutputText: params.finalText,
      finalReport: params.finalReport
        ? (params.finalReport as unknown as Record<string, unknown>)
        : null,
      confidence: params.trust.confidence,
      evidenceHash:
        params.trust.evidenceHash ??
        computeEvidenceHash(
          params.trust.evidenceCitations.map((citation) => ({
            tool: citation.tool ?? "agent_tool",
            sourceId: citation.sourceId,
            snapshotId: citation.snapshotId,
            contentHash: citation.contentHash,
            url: citation.url,
            isOfficial: citation.isOfficial,
          })),
        ) ??
        "no-evidence-hash",
      toolsInvoked: params.trust.toolsInvoked,
      evidenceCitations: params.trust.evidenceCitations.map((citation) => ({
        tool: citation.tool,
        sourceId: citation.sourceId,
        snapshotId: citation.snapshotId,
        contentHash: citation.contentHash,
        url: citation.url,
        isOfficial: citation.isOfficial,
      })),
      retrievalMeta: {
        runId: params.runId,
        queryIntent: params.queryIntent ?? null,
        status: params.status,
        schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
        retrievalContext: params.retrievalContext ?? null,
        retrievalSummary: params.retrievalSummary,
      },
      subjectId: params.runId,
      autoScore: params.trust.confidence,
    }).catch((error) => {
      logger.warn("Data Agent auto-feed failed after local run", {
        runId: params.runId,
        error: String(error),
      });
    });
  }

  if (isAgentOsFeatureEnabled("criticEvaluation")) {
    void runCriticEvaluation({
      runId: params.runId,
      orgId: params.orgId,
      finalOutput: params.finalText,
      toolsInvoked: params.trust.toolsInvoked,
      toolFailures: params.trust.toolFailures,
      missingEvidence: params.trust.missingEvidence,
    }).catch((error) => {
      logger.warn("AgentOS critic evaluation failed", {
        runId: params.runId,
        error: String(error),
      });
    });
  }
}
