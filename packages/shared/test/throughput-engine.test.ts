import { describe, expect, it } from "vitest";

import {
  buildDeterministicRerunDecision,
  classifyComplexity,
  classifyConfidence,
  computeTaskDueAt,
  computeThroughputRouting,
} from "../src/index.js";

describe("throughput routing", () => {
  it("routes low-complexity, high-confidence deals to fast-triage", () => {
    const routing = computeThroughputRouting({
      parcelCount: 1,
      avgRiskScore: 3,
      disqualifierCount: 0,
      confidence: 0.82,
      missingDataCount: 0,
    });

    expect(classifyComplexity({
      parcelCount: 1,
      avgRiskScore: 3,
      disqualifierCount: 0,
      confidence: 0.82,
      missingDataCount: 0,
    })).toBe("low");
    expect(classifyConfidence(0.82)).toBe("high");
    expect(routing.slaTier).toBe("fast-triage");
    expect(routing.queueName).toBe("entitlement-os.fast-triage");
  });

  it("routes high complexity to deep-diligence", () => {
    const routing = computeThroughputRouting({
      parcelCount: 5,
      avgRiskScore: 8,
      disqualifierCount: 2,
      confidence: 0.78,
      missingDataCount: 2,
    });

    expect(routing.slaTier).toBe("deep-diligence");
    expect(routing.queueName).toBe("entitlement-os.deep-diligence");
  });

  it("computes deterministic due dates by SLA and pipeline step", () => {
    const createdAt = new Date("2026-02-11T00:00:00.000Z");
    const fastDue = computeTaskDueAt(createdAt, 1, "fast-triage");
    const deepDue = computeTaskDueAt(createdAt, 1, "deep-diligence");

    expect(fastDue.toISOString()).toBe("2026-02-12T00:00:00.000Z");
    expect(deepDue.toISOString()).toBe("2026-02-14T00:00:00.000Z");
  });
});

describe("deterministic rerun policy", () => {
  it("reuses previous outputs when input hash matches", () => {
    const payload = { deal: "A", parcels: [{ id: 1 }] };

    const first = buildDeterministicRerunDecision({
      runType: "TRIAGE",
      dealId: "deal-1",
      orgId: "org-1",
      payload,
      previousInputHash: null,
    });

    const second = buildDeterministicRerunDecision({
      runType: "TRIAGE",
      dealId: "deal-1",
      orgId: "org-1",
      payload,
      previousInputHash: first.inputHash,
    });

    expect(second.shouldReuse).toBe(true);
    expect(second.reason).toBe("input_hash_match");
  });

  it("disables reuse when force rerun is set", () => {
    const decision = buildDeterministicRerunDecision({
      runType: "TRIAGE",
      dealId: "deal-1",
      orgId: "org-1",
      payload: { foo: "bar" },
      previousInputHash: "b".repeat(64),
      forceRerun: true,
    });

    expect(decision.shouldReuse).toBe(false);
    expect(decision.reason).toBe("force_rerun_requested");
  });
});
