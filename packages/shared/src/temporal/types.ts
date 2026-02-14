import type { ArtifactType, RunType, SkuType } from "../enums.js";
import type { ParcelTriage } from "../schemas/parcelTriage.js";
import type { OpportunityScorecard } from "../schemas/opportunityScorecard.js";
import type { ThroughputRouting } from "../throughput/engine.js";

export const AGENT_RUN_STATE_SCHEMA_VERSION = 1;

export const AGENT_RUN_STATE_STATUS = {
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELED: "canceled",
} as const;

export type AgentRunStateStatus =
  (typeof AGENT_RUN_STATE_STATUS)[keyof typeof AGENT_RUN_STATE_STATUS];

export const AGENT_RUN_STATE_KEYS = {
  runId: "runId",
  status: "status",
  partialOutput: "partialOutput",
  lastAgentName: "lastAgentName",
  correlationId: "correlationId",
  toolsInvoked: "toolsInvoked",
  confidence: "confidence",
  missingEvidence: "missingEvidence",
  runStartedAt: "runStartedAt",
  durationMs: "durationMs",
  runInputHash: "runInputHash",
  lastUpdatedAt: "lastUpdatedAt",
  leaseOwner: "leaseOwner",
  leaseExpiresAt: "leaseExpiresAt",
  toolFailures: "toolFailures",
  proofChecks: "proofChecks",
  retryAttempts: "retryAttempts",
  retryMaxAttempts: "retryMaxAttempts",
  retryMode: "retryMode",
  evidenceRetryPolicy: "evidenceRetryPolicy",
  fallbackLineage: "fallbackLineage",
  fallbackReason: "fallbackReason",
} as const;

export type AgentEvidenceRetryPolicy = {
  enabled: boolean;
  threshold: number;
  missingEvidenceCount: number;
  attempts: number;
  maxAttempts: number;
  shouldRetry: boolean;
  nextAttempt: number;
  nextRetryMode: string;
  reason: string;
};

export type AgentRunState = {
  schemaVersion?: number;
  runId: string;
  status: AgentRunStateStatus;
  partialOutput: string;
  correlationId?: string;
  lastAgentName?: string;
  toolsInvoked: string[];
  confidence: number | null;
  missingEvidence: string[];
  durationMs?: number;
  lastUpdatedAt: string;
  runStartedAt?: string;
  runInputHash?: string | null;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  toolFailures?: string[];
  proofChecks?: string[];
  retryAttempts?: number;
  retryMaxAttempts?: number;
  retryMode?: string;
  evidenceRetryPolicy?: AgentEvidenceRetryPolicy;
  fallbackLineage?: string[];
  fallbackReason?: string;
};

export type AgentRunOutputJson = {
  runState: AgentRunState;
  correlationId?: string;
  toolsInvoked?: string[];
  packVersionsUsed?: string[];
  toolFailures?: string[];
  proofChecks?: string[];
  retryAttempts?: number;
  retryMaxAttempts?: number;
  retryMode?: string;
  evidenceRetryPolicy?: AgentEvidenceRetryPolicy;
  fallbackLineage?: string[];
  fallbackReason?: string;
  evidenceCitations?: Array<{
    tool: string;
    sourceId?: string;
    snapshotId?: string;
    contentHash?: string;
    url?: string;
    isOfficial?: boolean;
  }>;
  evidenceHash?: string | null;
  confidence?: number | null;
  missingEvidence?: string[];
  verificationSteps?: string[];
  lastAgentName?: string;
  durationMs?: number;
  finalReport?: Record<string, unknown> | null;
  errorSummary?: string | null;
  finalOutput?: string;
};

export type DealIntakeWorkflowInput = {
  orgId: string;
  dealId: string;
  runId: string;
};

export type JurisdictionRefreshWorkflowInput = {
  orgId: string;
  jurisdictionId: string;
  sku: SkuType;
  runId: string;
  officialOnly?: boolean;
};

export type ArtifactGenerationWorkflowInput = {
  orgId: string;
  dealId: string;
  runIdsByArtifactType: Record<ArtifactType, string | undefined>;
  artifactTypes: ArtifactType[];
};

export type ChangeDetectionWorkflowInput = {
  orgId: string;
  jurisdictionId: string;
  runId: string;
};

export type BuyerPresellWorkflowInput = {
  orgId: string;
  dealId: string;
  runId: string;
};

export type RunRecordCreateInput = {
  orgId: string;
  runType: RunType;
  dealId?: string;
  jurisdictionId?: string;
  sku?: SkuType;
  status?: "running" | "succeeded" | "failed" | "canceled";
  inputHash?: string;
};

export type TriageRerunMetadata = {
  reusedPreviousRun: boolean;
  reason: string;
  sourceRunId?: string;
};

export type TriageWorkflowInput = {
  orgId: string;
  dealId: string;
};

export type TriageToolSource = {
  url: string;
  title?: string;
};

export type TriageWorkflowResult = {
  runId: string;
  triage: ParcelTriage;
  triageScore: number;
  summary: string;
  scorecard: OpportunityScorecard;
  routing: ThroughputRouting;
  rerun: TriageRerunMetadata;
  sources: TriageToolSource[];
  queueName: string;
  artifactId: string | null;
};

export type AgentRunInputMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      status: "completed";
      content: Array<{ type: "output_text"; text: string }>;
    };

export type AgentRunWorkflowInput = {
  orgId: string;
  userId: string;
  conversationId: string;
  runId?: string;
  correlationId?: string;
  input: AgentRunInputMessage[];
  runType?: string;
  maxTurns?: number;
  dealId?: string | null;
  jurisdictionId?: string | null;
  sku?: string | null;
  intentHint?: string | null;
  retryMode?: string | null;
  retryAttempts?: number | null;
  retryMaxAttempts?: number | null;
  fallbackLineage?: string[] | null;
  fallbackReason?: string | null;
};

export type AgentTrustSnapshot = {
  toolsInvoked: string[];
  packVersionsUsed: string[];
  evidenceCitations: Array<{
    tool?: string;
    sourceId?: string;
    snapshotId?: string;
    contentHash?: string;
    url?: string;
    isOfficial?: boolean;
  }>;
  evidenceHash?: string | null;
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
  evidenceRetryPolicy?: AgentEvidenceRetryPolicy;
  fallbackLineage?: string[];
  fallbackReason?: string;
};

export type AgentRunWorkflowOutput = {
  runId: string;
  correlationId?: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  finalOutput: string;
  finalReport: Record<string, unknown> | null;
  toolsInvoked: string[];
  trust: AgentTrustSnapshot;
  openaiResponseId: string | null;
  inputHash: string;
};
