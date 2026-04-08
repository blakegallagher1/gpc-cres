import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, getIntelligenceDeadlinesForOrgMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getIntelligenceDeadlinesForOrgMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  getIntelligenceDeadlinesForOrg: getIntelligenceDeadlinesForOrgMock,
}));

import { GET } from "./route";

describe("GET /api/intelligence/deadlines", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getIntelligenceDeadlinesForOrgMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/intelligence/deadlines");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(getIntelligenceDeadlinesForOrgMock).not.toHaveBeenCalled();
  });

  it("returns the delegated org-scoped deadlines", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    getIntelligenceDeadlinesForOrgMock.mockResolvedValue({
      deadlines: [
        {
          taskId: "task-1",
          taskTitle: "Upload phase I package",
          dueAt: "2026-03-01T09:00:00.000Z",
          hoursUntilDue: 9,
          urgency: "red",
          status: "OPEN",
          pipelineStep: 2,
          dealId: "deal-1",
          dealName: "Pecan Ridge",
          dealStatus: "UNDER_REVIEW",
        },
        {
          taskId: "entitlement-ent-1",
          taskTitle: "Entitlement hearing (Planning Commission)",
          dueAt: "2026-03-08T10:00:00.000Z",
          hoursUntilDue: 178,
          urgency: "green",
          status: "SCHEDULED",
          pipelineStep: 0,
          dealId: "deal-1",
          dealName: "Pecan Ridge",
          dealStatus: "UNDER_REVIEW",
        },
      ],
      total: 2,
    });

    const req = new NextRequest("http://localhost/api/intelligence/deadlines");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deadlines: [
        {
          taskId: "task-1",
          taskTitle: "Upload phase I package",
          dueAt: "2026-03-01T09:00:00.000Z",
          hoursUntilDue: 9,
          urgency: "red",
          status: "OPEN",
          pipelineStep: 2,
          dealId: "deal-1",
          dealName: "Pecan Ridge",
          dealStatus: "UNDER_REVIEW",
        },
        {
          taskId: "entitlement-ent-1",
          taskTitle: "Entitlement hearing (Planning Commission)",
          dueAt: "2026-03-08T10:00:00.000Z",
          hoursUntilDue: 178,
          urgency: "green",
          status: "SCHEDULED",
          pipelineStep: 0,
          dealId: "deal-1",
          dealName: "Pecan Ridge",
          dealStatus: "UNDER_REVIEW",
        },
      ],
      total: 2,
    });
    expect(getIntelligenceDeadlinesForOrgMock).toHaveBeenCalledWith("org-1");
  });
});
