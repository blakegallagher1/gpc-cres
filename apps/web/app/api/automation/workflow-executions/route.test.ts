import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listWorkflowExecutionsMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listWorkflowExecutionsMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  listWorkflowExecutions: listWorkflowExecutionsMock,
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/automation/workflow-executions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthMock.mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
  });

  it("lists workflow executions for the auth org", async () => {
    listWorkflowExecutionsMock.mockResolvedValue([
      {
        id: "execution-1",
        orgId: ORG_ID,
        status: "completed",
      },
    ]);

    const res = await GET(
      new NextRequest("http://localhost/api/automation/workflow-executions?limit=25"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listWorkflowExecutionsMock).toHaveBeenCalledWith(ORG_ID, 25);
    expect(body.executions).toHaveLength(1);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost/api/automation/workflow-executions"),
    );

    expect(res.status).toBe(401);
    expect(listWorkflowExecutionsMock).not.toHaveBeenCalled();
  });
});
