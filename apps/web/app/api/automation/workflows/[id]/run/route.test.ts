import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  runOperatorWorkflowDefinitionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  runOperatorWorkflowDefinitionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  runOperatorWorkflowDefinition: runOperatorWorkflowDefinitionMock,
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const WORKFLOW_ID = "22222222-2222-4222-8222-222222222222";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const PARAMS = { params: Promise.resolve({ id: WORKFLOW_ID }) };

describe("/api/automation/workflows/[id]/run route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthMock.mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
  });

  it("runs a persisted workflow definition for the auth org", async () => {
    runOperatorWorkflowDefinitionMock.mockResolvedValue({
      id: "execution-1",
      status: "completed",
      templateKey: "OPERATOR_WORKFLOW",
    });

    const res = await POST(
      new NextRequest(`http://localhost/api/automation/workflows/${WORKFLOW_ID}/run`, {
        method: "POST",
        body: JSON.stringify({ dealId: DEAL_ID, inputData: { source: "test" } }),
      }),
      PARAMS,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(runOperatorWorkflowDefinitionMock).toHaveBeenCalledWith({
      orgId: ORG_ID,
      definitionId: WORKFLOW_ID,
      dealId: DEAL_ID,
      startedBy: USER_ID,
      inputData: { source: "test" },
    });
    expect(body.execution.status).toBe("completed");
  });

  it("rejects invalid deal ids before execution", async () => {
    const res = await POST(
      new NextRequest(`http://localhost/api/automation/workflows/${WORKFLOW_ID}/run`, {
        method: "POST",
        body: JSON.stringify({ dealId: "not-a-uuid" }),
      }),
      PARAMS,
    );

    expect(res.status).toBe(400);
    expect(runOperatorWorkflowDefinitionMock).not.toHaveBeenCalled();
  });
});
