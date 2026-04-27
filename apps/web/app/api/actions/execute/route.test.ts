import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, runWorkflowSyncMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  runWorkflowSyncMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@gpc/server/workflows/workflow-orchestrator.service", () => ({
  runWorkflowSync: runWorkflowSyncMock,
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

describe("/api/actions/execute route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthMock.mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
    runWorkflowSyncMock.mockResolvedValue({
      id: "execution-1",
      orgId: ORG_ID,
      dealId: DEAL_ID,
      templateKey: "QUICK_SCREEN",
      status: "completed",
      output: { verdict: "fit", score: 91 },
      stepResults: [],
    });
  });

  it("runs the quick screen action through the workflow orchestrator", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/actions/execute", {
        method: "POST",
        body: JSON.stringify({
          actionId: "SCREEN_PARCEL",
          dealId: DEAL_ID,
          inputData: { source: "test" },
        }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(runWorkflowSyncMock).toHaveBeenCalledWith({
      orgId: ORG_ID,
      dealId: DEAL_ID,
      templateKey: "QUICK_SCREEN",
      startedBy: USER_ID,
      inputData: { source: "test", actionId: "SCREEN_PARCEL" },
    });
    expect(body.summary).toBe("Verdict: fit, score 91.");
  });

  it("maps acquisition path to the acquisition template", async () => {
    runWorkflowSyncMock.mockResolvedValue({
      id: "execution-2",
      templateKey: "ACQUISITION_PATH",
      status: "completed",
      output: { decision: "ADVANCE", fitScore: 88, gatePass: true },
      stepResults: [],
    });

    const res = await POST(
      new NextRequest("http://localhost/api/actions/execute", {
        method: "POST",
        body: JSON.stringify({
          actionId: "RUN_ACQUISITION_PATH",
          dealId: DEAL_ID,
        }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(runWorkflowSyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: "ACQUISITION_PATH" }),
    );
    expect(body.summary).toBe("Decision: ADVANCE, fit score 88, gate passed.");
  });

  it("rejects invalid payloads before execution", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/actions/execute", {
        method: "POST",
        body: JSON.stringify({
          actionId: "SCREEN_PARCEL",
          dealId: "not-a-uuid",
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(runWorkflowSyncMock).not.toHaveBeenCalled();
  });

  it("requires auth", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await POST(
      new NextRequest("http://localhost/api/actions/execute", {
        method: "POST",
        body: JSON.stringify({ actionId: "SCREEN_PARCEL", dealId: DEAL_ID }),
      }),
    );

    expect(res.status).toBe(401);
    expect(runWorkflowSyncMock).not.toHaveBeenCalled();
  });
});
