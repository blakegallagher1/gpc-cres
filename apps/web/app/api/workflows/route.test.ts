import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  workflowTemplateFindManyMock,
  workflowTemplateUpdateManyMock,
  workflowTemplateCreateMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  workflowTemplateFindManyMock: vi.fn(),
  workflowTemplateUpdateManyMock: vi.fn(),
  workflowTemplateCreateMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    workflowTemplate: {
      findMany: workflowTemplateFindManyMock,
      updateMany: workflowTemplateUpdateManyMock,
      create: workflowTemplateCreateMock,
    },
  },
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/workflows route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    workflowTemplateFindManyMock.mockReset();
    workflowTemplateUpdateManyMock.mockReset();
    workflowTemplateCreateMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/workflows");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(workflowTemplateFindManyMock).not.toHaveBeenCalled();
  });

  it("lists workflow templates scoped to the auth org", async () => {
    workflowTemplateFindManyMock.mockResolvedValue([
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
    expect(workflowTemplateFindManyMock).toHaveBeenCalledWith({
      where: { orgId: ORG_ID },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
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
    workflowTemplateUpdateManyMock.mockResolvedValue({ count: 1 });
    workflowTemplateCreateMock.mockResolvedValue({
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
    expect(workflowTemplateUpdateManyMock).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, isDefault: true },
      data: { isDefault: false },
    });
    expect(workflowTemplateCreateMock).toHaveBeenCalledWith({
      data: {
        orgId: ORG_ID,
        key: "ACQUISITION",
        name: "Acquisition",
        description: "Generic acquisition flow",
        isDefault: true,
        stages: {
          create: [
            {
              orgId: ORG_ID,
              key: "UNDERWRITING",
              name: "Underwriting",
              ordinal: 1,
              description: "Run initial underwriting",
              requiredGate: null,
            },
          ],
        },
      },
      include: {
        stages: {
          orderBy: { ordinal: "asc" },
        },
      },
    });
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
