import { describe, expect, it } from "vitest";

import {
  AGENT_RUN_STATE_KEYS,
  AGENT_RUN_STATE_SCHEMA_VERSION,
  AGENT_RUN_STATE_STATUS,
  type AgentRunOutputJson,
  type AgentRunState,
} from "../src/temporal/types";

describe("Agent run state contract", () => {
  it("locks shared run-state schema keys and status values", () => {
    expect(AGENT_RUN_STATE_SCHEMA_VERSION).toBe(1);
    expect(AGENT_RUN_STATE_KEYS).toMatchObject({
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
      evidenceRetryPolicy: "evidenceRetryPolicy",
      retryAttempts: "retryAttempts",
      retryMaxAttempts: "retryMaxAttempts",
      retryMode: "retryMode",
      fallbackLineage: "fallbackLineage",
      fallbackReason: "fallbackReason",
    });

    expect(AGENT_RUN_STATE_STATUS).toMatchObject({
      RUNNING: "running",
      SUCCEEDED: "succeeded",
      FAILED: "failed",
      CANCELED: "canceled",
    });
  });

  it("accepts a typed AgentRunState payload and persists required fields", () => {
    const runState: AgentRunState = {
      schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
      runId: "run-123",
      status: AGENT_RUN_STATE_STATUS.RUNNING,
      partialOutput: "partial output",
      toolsInvoked: ["coordinator", "legal"],
      confidence: 0.92,
      missingEvidence: [],
      durationMs: 1200,
      lastUpdatedAt: new Date().toISOString(),
      runStartedAt: new Date().toISOString(),
      runInputHash: "input-hash-1",
      leaseOwner: "agent-runner",
      leaseExpiresAt: new Date().toISOString(),
      toolFailures: ["search_parcels: timeout"],
      proofChecks: ["sources:satisfied", "zoning:missing"],
      evidenceRetryPolicy: {
        enabled: true,
        threshold: 2,
        missingEvidenceCount: 2,
        attempts: 1,
        maxAttempts: 4,
        shouldRetry: true,
        nextAttempt: 2,
        nextRetryMode: "missing-evidence-policy",
        reason: "Missing evidence count (2) exceeded threshold 2.",
      },
      retryAttempts: 1,
      retryMaxAttempts: 1,
      retryMode: "local_fallback_after_temporal_start",
      fallbackLineage: ["local-fallback", "temporal-start"],
      fallbackReason: "Temporal workflow unavailable",
      lastAgentName: "coordinator",
      correlationId: "corr-123",
    };

    const outputJson: AgentRunOutputJson = {
      runState,
      toolsInvoked: ["coordinator"],
      packVersionsUsed: ["p1"],
      finalReport: null,
    };

    const serialized = JSON.stringify(outputJson);
    const parsed = JSON.parse(serialized) as AgentRunOutputJson;

    expect(parsed.runState).toEqual(runState);
    expect(parsed.runState[AGENT_RUN_STATE_KEYS.correlationId]).toBe("corr-123");
    expect(parsed.runState[AGENT_RUN_STATE_KEYS.status]).toBe(AGENT_RUN_STATE_STATUS.RUNNING);
    expect(parsed.runState[AGENT_RUN_STATE_KEYS.lastAgentName]).toBe("coordinator");
    expect(parsed.runState[AGENT_RUN_STATE_KEYS.evidenceRetryPolicy]).toEqual({
      ...runState.evidenceRetryPolicy,
    });
    expect(parsed.finalReport).toBeNull();
  });
});
