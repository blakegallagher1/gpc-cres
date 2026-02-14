import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, runFindManyMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  runFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    run: {
      findMany: runFindManyMock,
    },
  },
}));

import { AGENT_RUN_STATE_KEYS } from "@entitlement-os/shared";
import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

describe("GET /api/runs/dashboard", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    runFindManyMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/runs/dashboard");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(runFindManyMock).not.toHaveBeenCalled();
  });

  it("builds dashboard aggregates and surfaces run-state metrics", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    runFindManyMock.mockResolvedValue([
      {
        id: "run-success",
        runType: "ENRICHMENT",
        status: "succeeded",
        startedAt: new Date("2026-02-13T10:00:00.000Z"),
        finishedAt: new Date("2026-02-13T10:00:08.000Z"),
        outputJson: {
          runState: {
            [AGENT_RUN_STATE_KEYS.runId]: "run-success",
            [AGENT_RUN_STATE_KEYS.status]: "succeeded",
            [AGENT_RUN_STATE_KEYS.partialOutput]: "{}",
            [AGENT_RUN_STATE_KEYS.lastAgentName]: "coordinator",
            [AGENT_RUN_STATE_KEYS.toolsInvoked]: ["coordinator"],
            [AGENT_RUN_STATE_KEYS.confidence]: 0.92,
            [AGENT_RUN_STATE_KEYS.missingEvidence]: [],
            [AGENT_RUN_STATE_KEYS.toolFailures]: ["web_search:timeout"],
            [AGENT_RUN_STATE_KEYS.proofChecks]: ["zoning", "tax", "records"],
            [AGENT_RUN_STATE_KEYS.retryAttempts]: 1,
            [AGENT_RUN_STATE_KEYS.retryMaxAttempts]: 2,
            [AGENT_RUN_STATE_KEYS.retryMode]: "local",
            [AGENT_RUN_STATE_KEYS.fallbackLineage]: ["local-fallback"],
            [AGENT_RUN_STATE_KEYS.fallbackReason]: "Local replay",
          },
          evidenceCitations: [{ source: "source-1" }],
          confidence: 0.92,
          retryAttempts: 1,
          retryMode: "local",
        },
      },
      {
        id: "run-fail",
        runType: "SCREENING",
        status: "failed",
        startedAt: new Date("2026-02-13T11:00:00.000Z"),
        finishedAt: new Date("2026-02-13T11:00:06.000Z"),
        outputJson: {
          lastAgentName: "planner",
          confidence: 0.44,
          missingEvidence: ["zoning", "tax"],
          proofChecks: [],
          retryAttempts: 0,
          retryMode: null,
          toolFailures: ["planner:invalid-output", "planner:invalid-output"],
          fallbackReason: "Schema validation failed",
          runState: {
            [AGENT_RUN_STATE_KEYS.runId]: "run-fail",
            [AGENT_RUN_STATE_KEYS.status]: "failed",
            [AGENT_RUN_STATE_KEYS.partialOutput]: "{}",
            [AGENT_RUN_STATE_KEYS.lastAgentName]: "planner",
            [AGENT_RUN_STATE_KEYS.toolsInvoked]: ["planner"],
            [AGENT_RUN_STATE_KEYS.confidence]: 0.44,
            [AGENT_RUN_STATE_KEYS.missingEvidence]: ["zoning", "tax"],
            [AGENT_RUN_STATE_KEYS.toolFailures]: ["planner:invalid-output", "planner:invalid-output"],
            [AGENT_RUN_STATE_KEYS.proofChecks]: [],
            [AGENT_RUN_STATE_KEYS.retryAttempts]: 0,
            [AGENT_RUN_STATE_KEYS.retryMaxAttempts]: 0,
            [AGENT_RUN_STATE_KEYS.retryMode]: "none",
            [AGENT_RUN_STATE_KEYS.fallbackLineage]: [],
            [AGENT_RUN_STATE_KEYS.fallbackReason]: "Schema validation failed",
          },
        },
      },
    ]);

    const req = new NextRequest("http://localhost/api/runs/dashboard");
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.totals.totalRuns).toBe(2);
    expect(payload.totals.succeededRuns).toBe(1);
    expect(payload.totals.failedRuns).toBe(1);
    expect(payload.totals.runsWithRetry).toBe(1);
    expect(payload.totals.runsWithFallback).toBe(2);
    expect(payload.totals.runsWithToolFailures).toBe(2);
    expect(payload.totals.runsWithMissingEvidence).toBe(1);
    expect(Array.isArray(payload.confidenceTimeline)).toBe(true);
    expect(payload.runTypeDistribution[0].key).toBe("ENRICHMENT");
    expect(payload.recentRuns.length).toBe(2);
    expect(payload.recentRuns[0].id).toBe("run-fail");
    expect(payload.recentRuns[1].id).toBe("run-success");
  });
});
