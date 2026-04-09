import { prisma } from "@entitlement-os/db";
import { AGENT_RUN_STATE_SCHEMA_VERSION, type AgentReport, type DataAgentRetrievalContext } from "@entitlement-os/shared";
import { computeEvidenceHash } from "@entitlement-os/shared/evidence";
import {
  isAgentOsFeatureEnabled,
  runCriticEvaluation,
  type QueryIntent,
} from "@entitlement-os/openai";

export interface AgentPostRunEffectsTrustEnvelope {
  evidenceCitations: Array<{
    tool?: string | null;
    sourceId?: string | null;
    snapshotId?: string | null;
    contentHash?: string | null;
    url?: string | null;
    isOfficial?: boolean | null;
  }>;
  evidenceHash: string | null;
  confidence: number;
  toolsInvoked: string[];
  missingEvidence: string[];
  toolFailures: string[];
}

type AutoFeedCitation = {
  tool?: string;
  sourceId?: string;
  snapshotId?: string;
  contentHash?: string;
  url?: string;
  isOfficial?: boolean;
};

export interface AgentRunPostRunEffectsParams {
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
  trust: AgentPostRunEffectsTrustEnvelope;
  retrievalContext: DataAgentRetrievalContext | null;
  retrievalSummary: Record<string, unknown>;
}

export interface AgentRunPostRunEffectsDeps {
  agentLearningEnabled: boolean;
  dispatchAgentRunCompleted(event: {
    type: "agent.run.completed";
    runId: string;
    orgId: string;
    userId: string;
    conversationId: string | null;
    dealId: string | null;
    jurisdictionId: string | null;
    runType: string | null;
    status: "succeeded" | "failed" | "canceled";
    inputPreview: string | null;
    queryIntent: QueryIntent | null;
  }): Promise<void>;
  autoFeedRun(input: {
    orgId: string;
    runId: string;
    runType: string;
    agentIntent: string;
    finalOutputText: string;
    finalReport: Record<string, unknown> | null;
    confidence: number;
    evidenceHash: string;
    toolsInvoked: string[];
    evidenceCitations: AutoFeedCitation[];
    retrievalMeta: Record<string, unknown>;
    subjectId: string;
    autoScore: number;
  }): Promise<unknown>;
  warn(message: string, fields: Record<string, unknown>): void;
}

function getInputPreview(firstUserInput: unknown): string | null {
  return typeof firstUserInput === "string" ? firstUserInput.slice(0, 2000) : null;
}

function getAgentIntent(firstUserInput: unknown): string {
  return typeof firstUserInput === "string" ? firstUserInput.slice(0, 280) : "agent run";
}

function buildEvidenceHash(params: AgentRunPostRunEffectsParams): string {
  return (
    params.trust.evidenceHash ??
    computeEvidenceHash(
      params.trust.evidenceCitations.map((citation) => ({
        tool: citation.tool ?? "agent_tool",
        sourceId: citation.sourceId ?? undefined,
        snapshotId: citation.snapshotId ?? undefined,
        contentHash: citation.contentHash ?? undefined,
        url: citation.url ?? undefined,
        isOfficial: citation.isOfficial ?? undefined,
      })),
    ) ??
    "no-evidence-hash"
  );
}

function normalizeEvidenceCitations(
  citations: AgentPostRunEffectsTrustEnvelope["evidenceCitations"],
): AutoFeedCitation[] {
  return citations.map((citation) => ({
    tool: citation.tool ?? undefined,
    sourceId: citation.sourceId ?? undefined,
    snapshotId: citation.snapshotId ?? undefined,
    contentHash: citation.contentHash ?? undefined,
    url: citation.url ?? undefined,
    isOfficial: citation.isOfficial ?? undefined,
  }));
}

export async function runAgentPostRunEffects(
  params: AgentRunPostRunEffectsParams,
  deps: AgentRunPostRunEffectsDeps,
): Promise<void> {
  if (
    !params.skipRunPersistence &&
    deps.agentLearningEnabled &&
    params.status !== "running"
  ) {
    await prisma.run.update({
      where: { id: params.runId },
      data: {
        memoryPromotionStatus: "pending",
        memoryPromotionError: null,
        memoryPromotedAt: null,
      },
    });

    void deps.dispatchAgentRunCompleted({
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
      inputPreview: getInputPreview(params.firstUserInput),
      queryIntent: params.queryIntent ?? null,
    }).catch((error) => {
      deps.warn("Agent learning event dispatch failed", {
        runId: params.runId,
        error: String(error),
      });
    });
  }

  if (!params.skipRunPersistence && !params.ingestionOnly) {
    void deps.autoFeedRun({
      orgId: params.orgId,
      runId: params.runId,
      runType: params.runType ?? "ENRICHMENT",
      agentIntent: getAgentIntent(params.firstUserInput),
      finalOutputText: params.finalText,
      finalReport: params.finalReport ? (params.finalReport as unknown as Record<string, unknown>) : null,
      confidence: params.trust.confidence,
      evidenceHash: buildEvidenceHash(params),
      toolsInvoked: params.trust.toolsInvoked,
      evidenceCitations: normalizeEvidenceCitations(params.trust.evidenceCitations),
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
      deps.warn("Data Agent auto-feed failed after local run", {
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
      deps.warn("AgentOS critic evaluation failed", {
        runId: params.runId,
        error: String(error),
      });
    });
  }
}
