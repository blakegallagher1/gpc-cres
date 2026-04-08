import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listWorkflowTemplatesMock,
  createWorkflowTemplateMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listWorkflowTemplatesMock: vi.fn(),
  createWorkflowTemplateMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server/workflows/workflow-template.service", () => ({
  listWorkflowTemplates: listWorkflowTemplatesMock,
  createWorkflowTemplate: createWorkflowTemplateMock,
  WorkflowTemplateValidationError: class WorkflowTemplateValidationError extends Error {},
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/workflows route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listWorkflowTemplatesMock.mockReset();
    createWorkflowTemplateMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/workflows");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(listWorkflowTemplatesMock).not.toHaveBeenCalled();
  });

  it("lists workflow templates scoped to the auth org", async () => {
    listWorkflowTemplatesMock.mockResolvedValue([
      {
        id: "workflow-1",
        orgId: ORG_ID,
        key: "ENTITLEMENT_LAND",
        name: "Entitlement Land",
        description: "Legacy entitlement workflow",
        isDefault: true,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
      },
    ]);

    const req = new NextRequest("http://localhost/api/workflows");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listWorkflowTemplatesMock).toHaveBeenCalledWith(ORG_ID);
    expect(body.workflowTemplates).toEqual([
      {
        id: "workflow-1",
        orgId: ORG_ID,
        key: "ENTITLEMENT_LAND",
        name: "Entitlement Land",
        description: "Legacy entitlement workflow",
        isDefault: true,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
    ]);
  });

  it("creates a workflow template and stages for the auth org", async () => {
    createWorkflowTemplateMock.mockResolvedValue({
      id: "workflow-2",
      orgId: ORG_ID,
      key: "ACQUISITION",
      name: "Acquisition",
      description: "Generic acquisition flow",
      isDefault: true,
      createdAt: new Date("2026-03-03T00:00:00.000Z"),
      updatedAt: new Date("2026-03-03T00:00:00.000Z"),
      stages: [
        {
          id: "stage-1",
          orgId: ORG_ID,
          templateId: "workflow-2",
          key: "UNDERWRITING",
          name: "Underwriting",
          ordinal: 1,
          description: "Run initial underwriting",
          requiredGate: null,
          createdAt: new Date("2026-03-03T00:00:00.000Z"),
        },
      ],
    });

    const req = new NextRequest("http://localhost/api/workflows", {
      method: "POST",
      body: JSON.stringify({
        key: "ACQUISITION",
        name: "Acquisition",
        description: "Generic acquisition flow",
        isDefault: true,
        stages: [
          {
            key: "UNDERWRITING",
            name: "Underwriting",
            ordinal: 1,
            description: "Run initial underwriting",
            requiredGate: null,
          },
        ],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(createWorkflowTemplateMock).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        key: "ACQUISITION",
        name: "Acquisition",
        isDefault: true,
      }),
    );
    expect(body.workflowTemplate).toEqual({
      id: "workflow-2",
      orgId: ORG_ID,
      key: "ACQUISITION",
      name: "Acquisition",
      description: "Generic acquisition flow",
      isDefault: true,
      createdAt: "2026-03-03T00:00:00.000Z",
      updatedAt: "2026-03-03T00:00:00.000Z",
      stages: [
        {
          id: "stage-1",
          orgId: ORG_ID,
          templateId: "workflow-2",
          key: "UNDERWRITING",
          name: "Underwriting",
          ordinal: 1,
          description: "Run initial underwriting",
          requiredGate: null,
          createdAt: "2026-03-03T00:00:00.000Z",
        },
      ],
    });
  });
});
