import type { AgentEvidenceRetryPolicy } from "@entitlement-os/shared";
import type { EvidenceCitation } from "@entitlement-os/shared/evidence";
import type { AgentTrustEnvelope } from "@/types";
import type { ResearchLaneSelection } from "./researchRouting";

/**
 * Builds the verification checklist shown to clients when evidence is missing.
 */
export function buildVerificationSteps(missingEvidence: string[]): string[] {
  const steps = [
    "Re-run with stricter input (full parcel identifiers and target jurisdiction).",
    "Verify official seed-source snapshots for each cited claim.",
  ];
  if (missingEvidence.some((entry) => entry.includes("evidence_snapshot"))) {
    steps.push("Re-run evidence_snapshot for sources that returned errors.");
  }
  return steps;
}

/**
 * Builds trust metadata for runs paused on tool approval.
 */
export function buildPendingApprovalTrust(params: {
  toolsInvoked: string[];
  packVersionsUsed: string[];
  evidenceHash: string | null;
  lastAgentName?: string;
  durationMs: number;
  retryAttempts?: number;
  retryMaxAttempts?: number;
  retryMode?: string;
  fallbackLineage?: string[];
  fallbackReason?: string;
  toolName?: string | null;
}): AgentTrustEnvelope {
  return {
    toolsInvoked: params.toolsInvoked,
    packVersionsUsed: params.packVersionsUsed,
    evidenceCitations: [],
    evidenceHash: params.evidenceHash,
    confidence: 0.5,
    missingEvidence: [],
    verificationSteps: [
      `Awaiting human approval for tool: ${params.toolName ?? "tool"}`,
    ],
    lastAgentName: params.lastAgentName,
    errorSummary: null,
    durationMs: params.durationMs,
    toolFailures: [],
    proofChecks: [],
    retryAttempts: params.retryAttempts,
    retryMaxAttempts: params.retryMaxAttempts,
    retryMode: params.retryMode,
    evidenceRetryPolicy: undefined,
    fallbackLineage: params.fallbackLineage,
    fallbackReason: params.fallbackReason,
  };
}

/**
 * Builds the final trust envelope for a completed run.
 */
export function buildFinalTrust(params: {
  toolsInvoked: string[];
  packVersionsUsed: string[];
  evidenceCitations: EvidenceCitation[];
  evidenceHash: string | null;
  confidence: number;
  researchLane?: ResearchLaneSelection;
  missingEvidence: string[];
  lastAgentName?: string;
  errorSummary: string | null;
  durationMs: number;
  toolFailures: string[];
  proofChecks: string[];
  retryAttempts?: number;
  retryMaxAttempts?: number;
  retryMode?: string;
  evidenceRetryPolicy?: AgentEvidenceRetryPolicy;
  fallbackLineage?: string[];
  fallbackReason?: string;
}): AgentTrustEnvelope {
  return {
    toolsInvoked: params.toolsInvoked,
    packVersionsUsed: params.packVersionsUsed,
    evidenceCitations: params.evidenceCitations,
    evidenceHash: params.evidenceHash,
    confidence: Math.max(0, Math.min(1, params.confidence)),
    researchLane: params.researchLane,
    missingEvidence: params.missingEvidence,
    verificationSteps: buildVerificationSteps(params.missingEvidence),
    lastAgentName: params.lastAgentName,
    errorSummary: params.errorSummary,
    durationMs: params.durationMs,
    toolFailures: params.toolFailures,
    proofChecks: params.proofChecks,
    retryAttempts: params.retryAttempts,
    retryMaxAttempts: params.retryMaxAttempts,
    retryMode: params.retryMode,
    evidenceRetryPolicy: params.evidenceRetryPolicy,
    fallbackLineage: params.fallbackLineage,
    fallbackReason: params.fallbackReason,
  };
}
