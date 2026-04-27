import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listOperatorWorkflowDefinitionsMock,
  createOperatorWorkflowDefinitionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listOperatorWorkflowDefinitionsMock: vi.fn(),
  createOperatorWorkflowDefinitionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  listOperatorWorkflowDefinitions: listOperatorWorkflowDefinitionsMock,
  createOperatorWorkflowDefinition: createOperatorWorkflowDefinitionMock,
  OperatorWorkflowValidationError: class OperatorWorkflowValidationError extends Error {},
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/automation/workflows route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthMock.mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/automation/workflows"));

    expect(res.status).toBe(401);
    expect(listOperatorWorkflowDefinitionsMock).not.toHaveBeenCalled();
  });

  it("lists persisted definitions for the auth org", async () => {
    listOperatorWorkflowDefinitionsMock.mockResolvedValue([
      {
        id: "workflow-1",
        orgId: ORG_ID,
        name: "Saved",
        nodes: [],
        edges: [],
      },
    ]);

    const res = await GET(new NextRequest("http://localhost/api/automation/workflows"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listOperatorWorkflowDefinitionsMock).toHaveBeenCalledWith(ORG_ID);
    expect(body.workflows).toHaveLength(1);
  });

  it("creates a definition for the auth org and user", async () => {
    createOperatorWorkflowDefinitionMock.mockResolvedValue({
      id: "workflow-2",
      orgId: ORG_ID,
      name: "New workflow",
    });

    const req = new NextRequest("http://localhost/api/automation/workflows", {
      method: "POST",
      body: JSON.stringify({
        name: "New workflow",
        nodes: [],
        edges: [],
        runType: "TRIAGE",
        runMessage: "Run new workflow",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(createOperatorWorkflowDefinitionMock).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      expect.objectContaining({ name: "New workflow" }),
    );
    expect(body.workflow.id).toBe("workflow-2");
  });
});
