export interface EvidenceCitation {
  tool?: string;
  sourceId?: string;
  snapshotId?: string;
  contentHash?: string;
  url?: string;
  isOfficial?: boolean;
}

export interface EvidenceRetryPolicy {
  enabled: boolean;
  threshold: number;
  missingEvidenceCount: number;
  attempts: number;
  maxAttempts: number;
  shouldRetry: boolean;
  nextAttempt: number;
  nextRetryMode: string;
  reason: string;
}

export interface AgentTrustEnvelope {
  toolsInvoked: string[];
  packVersionsUsed: string[];
  evidenceCitations: EvidenceCitation[];
  evidenceHash?: string | null;
  confidence: number;
  researchLane?: "auto" | "local_first" | "public_web" | "interactive_browser";
  missingEvidence: string[];
  verificationSteps: string[];
  toolFailures?: string[];
  proofChecks?: string[];
  retryAttempts?: number;
  retryMaxAttempts?: number;
  retryMode?: string;
  evidenceRetryPolicy?: EvidenceRetryPolicy;
  fallbackLineage?: string[];
  fallbackReason?: string;
  plan?: string[];
  lastAgentName?: string;
  errorSummary?: string | null;
  durationMs?: number;
}
