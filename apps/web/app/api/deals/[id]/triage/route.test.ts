import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  dealFindFirstMock,
  runFindFirstMock,
  sentryCaptureExceptionMock,
  sentryFlushMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  dealFindFirstMock: vi.fn(),
  runFindFirstMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  sentryFlushMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/automation/events", () => ({
  dispatchEvent: vi.fn(),
}));

vi.mock("@/lib/workflowClient", () => ({
  getTemporalClient: vi.fn(),
}));

vi.mock("@entitlement-os/artifacts", () => ({
  renderArtifactFromSpec: vi.fn(),
}));

vi.mock("@/lib/storage/gatewayStorage", () => ({
  uploadArtifactToGateway: vi.fn(),
}));

vi.mock("@/lib/automation/sentry", () => ({
  captureAutomationDispatchError: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findFirst: dealFindFirstMock,
    },
    run: {
      findFirst: runFindFirstMock,
    },
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
  flush: sentryFlushMock,
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

function buildTriagePayload() {
  return {
    schema_version: "1.0",
    generated_at: "2026-03-11T12:00:00.000Z",
    deal_id: DEAL_ID,
    decision: "ADVANCE",
    recommended_path: "REZONING",
    rationale: "The parcel clears initial screening.",
    risk_scores: {
      access: 3,
      drainage: 4,
      adjacency: 2,
      env: 3,
      utilities: 2,
      politics: 5,
    },
    disqualifiers: [],
    next_actions: [
      {
        title: "Order survey",
        description: "Confirm current site conditions.",
        pipeline_step: 2,
        due_in_days: 7,
      },
    ],
    assumptions: [
      {
        assumption: "Zoning staff will support the entitlement path.",
        impact: "Supports advancement to underwriting.",
        sources: ["Planning staff call"],
      },
    ],
    sources_summary: ["Planning staff call"],
  };
}

describe("/api/deals/[id]/triage route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    dealFindFirstMock.mockReset();
    runFindFirstMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    sentryFlushMock.mockReset();
    sentryFlushMock.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/triage`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(dealFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deal is outside the auth org", async () => {
    dealFindFirstMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/triage`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Deal not found" });
    expect(runFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns the latest normalized triage result for the auth org", async () => {
    dealFindFirstMock.mockResolvedValue({ id: DEAL_ID });
    runFindFirstMock.mockResolvedValue({
      id: "run-1",
      status: "succeeded",
      startedAt: new Date("2026-03-11T12:00:00.000Z"),
      finishedAt: new Date("2026-03-11T12:01:00.000Z"),
      outputJson: {
        triage: buildTriagePayload(),
        triageScore: 0.88,
        summary: "Advance to underwriting.",
        routing: null,
        scorecard: null,
        rerun: {
          reusedPreviousRun: true,
          reason: "cache_hit",
          sourceRunId: "run-0",
        },
      },
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/triage`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(dealFindFirstMock).toHaveBeenCalledWith({
      where: { id: DEAL_ID, orgId: ORG_ID },
      select: { id: true },
    });
    expect(runFindFirstMock).toHaveBeenCalledWith({
      where: { dealId: DEAL_ID, orgId: ORG_ID, runType: "TRIAGE" },
      orderBy: { startedAt: "desc" },
    });
    expect(body.run).toEqual({
      id: "run-1",
      status: "succeeded",
      startedAt: "2026-03-11T12:00:00.000Z",
      finishedAt: "2026-03-11T12:01:00.000Z",
    });
    expect(body.triage.decision).toBe("ADVANCE");
    expect(body.triageScore).toBe(0.88);
    expect(body.summary).toBe("Advance to underwriting.");
    expect(body.rerun).toEqual({
      reusedPreviousRun: true,
      reason: "cache_hit",
      sourceRunId: "run-0",
    });
  });
});
