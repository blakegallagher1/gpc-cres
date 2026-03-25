import { describe, expect, it } from "vitest";
import {
  buildFinalTrust,
  buildPendingApprovalTrust,
  buildVerificationSteps,
} from "./agentTrust";

describe("agentTrust", () => {
  it("adds an evidence snapshot retry step when evidence snapshots are missing", () => {
    expect(
      buildVerificationSteps([
        "Missing evidence_snapshot for zoning source",
        "Missing county citation",
      ]),
    ).toEqual([
      "Re-run with stricter input (full parcel identifiers and target jurisdiction).",
      "Verify official seed-source snapshots for each cited claim.",
      "Re-run evidence_snapshot for sources that returned errors.",
    ]);
  });

  it("builds pending approval trust with the paused tool in verification steps", () => {
    expect(
      buildPendingApprovalTrust({
        toolsInvoked: ["screen_full"],
        packVersionsUsed: ["pack-v1"],
        evidenceHash: "hash-1",
        lastAgentName: "Coordinator",
        durationMs: 3200,
        retryAttempts: 1,
        retryMaxAttempts: 3,
        retryMode: "local",
        fallbackLineage: ["Coordinator"],
        fallbackReason: "tool_approval",
        toolName: "screen_full",
      }),
    ).toEqual(
      expect.objectContaining({
        toolsInvoked: ["screen_full"],
        packVersionsUsed: ["pack-v1"],
        evidenceHash: "hash-1",
        confidence: 0.5,
        verificationSteps: ["Awaiting human approval for tool: screen_full"],
        lastAgentName: "Coordinator",
        retryAttempts: 1,
        retryMaxAttempts: 3,
        retryMode: "local",
        fallbackLineage: ["Coordinator"],
        fallbackReason: "tool_approval",
      }),
    );
  });

  it("clamps final trust confidence and derives verification steps from missing evidence", () => {
    const trust = buildFinalTrust({
      toolsInvoked: ["screen_full"],
      packVersionsUsed: ["pack-v1"],
      evidenceCitations: [],
      evidenceHash: "hash-2",
      confidence: 1.4,
      missingEvidence: ["Missing evidence_snapshot for parcel dossier"],
      lastAgentName: "Coordinator",
      errorSummary: null,
      durationMs: 5000,
      toolFailures: [],
      proofChecks: ["parcel:satisfied"],
      retryAttempts: 2,
      retryMaxAttempts: 3,
      retryMode: "local",
    });

    expect(trust.confidence).toBe(1);
    expect(trust.verificationSteps).toContain(
      "Re-run evidence_snapshot for sources that returned errors.",
    );
  });
});
