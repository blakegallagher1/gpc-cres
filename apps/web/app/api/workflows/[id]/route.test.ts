import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getWorkflowTemplateByIdMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getWorkflowTemplateByIdMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  getWorkflowTemplateById: getWorkflowTemplateByIdMock,
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const WORKFLOW_ID = "workflow-1";

describe("/api/workflows/[id] route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getWorkflowTemplateByIdMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/workflows/${WORKFLOW_ID}`);
    const res = await GET(req, { params: Promise.resolve({ id: WORKFLOW_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getWorkflowTemplateByIdMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the template is outside the auth org", async () => {
    getWorkflowTemplateByIdMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/workflows/${WORKFLOW_ID}`);
    const res = await GET(req, { params: Promise.resolve({ id: WORKFLOW_ID }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Workflow template not found" });
    expect(getWorkflowTemplateByIdMock).toHaveBeenCalledWith(ORG_ID, WORKFLOW_ID);
  });

  it("returns the template with ordered stages for the auth org", async () => {
    getWorkflowTemplateByIdMock.mockResolvedValue({
      id: WORKFLOW_ID,
      orgId: ORG_ID,
      key: "ACQUISITION",
      name: "Acquisition",
      description: "Generic acquisition flow",
      isDefault: false,
      createdAt: "2026-03-04T00:00:00.000Z",
      updatedAt: "2026-03-05T00:00:00.000Z",
      stages: [
        {
          id: "stage-1",
          orgId: ORG_ID,
          templateId: WORKFLOW_ID,
          key: "UNDERWRITING",
          name: "Underwriting",
          ordinal: 1,
          description: null,
          requiredGate: "INITIAL_SCREEN",
          createdAt: "2026-03-04T00:00:00.000Z",
        },
      ],
    });

    const req = new NextRequest(`http://localhost/api/workflows/${WORKFLOW_ID}`);
    const res = await GET(req, { params: Promise.resolve({ id: WORKFLOW_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.workflowTemplate).toEqual({
      id: WORKFLOW_ID,
      orgId: ORG_ID,
      key: "ACQUISITION",
      name: "Acquisition",
      description: "Generic acquisition flow",
      isDefault: false,
      createdAt: "2026-03-04T00:00:00.000Z",
      updatedAt: "2026-03-05T00:00:00.000Z",
      stages: [
        {
          id: "stage-1",
          orgId: ORG_ID,
          templateId: WORKFLOW_ID,
          key: "UNDERWRITING",
          name: "Underwriting",
          ordinal: 1,
          description: null,
          requiredGate: "INITIAL_SCREEN",
          createdAt: "2026-03-04T00:00:00.000Z",
        },
      ],
    });
  });
});
