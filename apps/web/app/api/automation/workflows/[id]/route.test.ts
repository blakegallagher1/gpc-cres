import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getOperatorWorkflowDefinitionMock,
  updateOperatorWorkflowDefinitionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getOperatorWorkflowDefinitionMock: vi.fn(),
  updateOperatorWorkflowDefinitionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  getOperatorWorkflowDefinition: getOperatorWorkflowDefinitionMock,
  updateOperatorWorkflowDefinition: updateOperatorWorkflowDefinitionMock,
  OperatorWorkflowValidationError: class OperatorWorkflowValidationError extends Error {},
}));

import { GET, PATCH } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const WORKFLOW_ID = "22222222-2222-4222-8222-222222222222";
const PARAMS = { params: Promise.resolve({ id: WORKFLOW_ID }) };

describe("/api/automation/workflows/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthMock.mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
  });

  it("returns an org-scoped definition", async () => {
    getOperatorWorkflowDefinitionMock.mockResolvedValue({ id: WORKFLOW_ID, orgId: ORG_ID });

    const res = await GET(
      new NextRequest(`http://localhost/api/automation/workflows/${WORKFLOW_ID}`),
      PARAMS,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getOperatorWorkflowDefinitionMock).toHaveBeenCalledWith(ORG_ID, WORKFLOW_ID);
    expect(body.workflow.id).toBe(WORKFLOW_ID);
  });

  it("returns 404 when the definition is outside the auth org", async () => {
    getOperatorWorkflowDefinitionMock.mockResolvedValue(null);

    const res = await GET(
      new NextRequest(`http://localhost/api/automation/workflows/${WORKFLOW_ID}`),
      PARAMS,
    );

    expect(res.status).toBe(404);
  });

  it("updates an org-scoped definition", async () => {
    updateOperatorWorkflowDefinitionMock.mockResolvedValue({
      id: WORKFLOW_ID,
      orgId: ORG_ID,
      name: "Updated",
    });

    const res = await PATCH(
      new NextRequest(`http://localhost/api/automation/workflows/${WORKFLOW_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
      PARAMS,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(updateOperatorWorkflowDefinitionMock).toHaveBeenCalledWith(
      ORG_ID,
      WORKFLOW_ID,
      expect.objectContaining({ name: "Updated" }),
    );
    expect(body.workflow.name).toBe("Updated");
  });
});
