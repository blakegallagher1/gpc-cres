import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, findTasksMock, findEntitlementPathsMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  findTasksMock: vi.fn(),
  findEntitlementPathsMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    task: {
      findMany: findTasksMock,
    },
    entitlementPath: {
      findMany: findEntitlementPathsMock,
    },
  },
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("GET /api/intelligence/deadlines", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    resolveAuthMock.mockReset();
    findTasksMock.mockReset();
    findEntitlementPathsMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/intelligence/deadlines");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(findTasksMock).not.toHaveBeenCalled();
    expect(findEntitlementPathsMock).not.toHaveBeenCalled();
  });

  it("includes entitlement hearing deadlines and enforces org-scoped queries", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findTasksMock.mockResolvedValue([
      {
        id: "task-1",
        title: "Upload phase I package",
        dueAt: new Date("2026-03-01T09:00:00.000Z"),
        status: "OPEN",
        pipelineStep: 2,
        deal: {
          id: "deal-1",
          name: "Pecan Ridge",
          status: "UNDER_REVIEW",
        },
      },
    ]);
    findEntitlementPathsMock.mockResolvedValue([
      {
        id: "ent-1",
        hearingScheduledDate: new Date("2026-03-08T10:00:00.000Z"),
        hearingBody: "Planning Commission",
        deal: {
          id: "deal-1",
          name: "Pecan Ridge",
          status: "UNDER_REVIEW",
        },
      },
    ]);

    const req = new NextRequest("http://localhost/api/intelligence/deadlines");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.deadlines).toHaveLength(2);
    expect(body.deadlines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: "task-1",
          taskTitle: "Upload phase I package",
          status: "OPEN",
          dealId: "deal-1",
          dealName: "Pecan Ridge",
        }),
        expect.objectContaining({
          taskId: "entitlement-ent-1",
          taskTitle: "Entitlement hearing (Planning Commission)",
          status: "SCHEDULED",
          dealId: "deal-1",
          dealName: "Pecan Ridge",
        }),
      ]),
    );

    expect(findTasksMock).toHaveBeenCalledTimes(1);
    expect(findTasksMock).toHaveBeenCalledWith({
      where: {
        dueAt: { not: null },
        status: { notIn: ["DONE", "CANCELED"] },
        deal: { orgId: ORG_ID },
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        status: true,
        pipelineStep: true,
        ownerUserId: true,
        deal: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { dueAt: "asc" },
      take: 50,
    });
    expect(findEntitlementPathsMock).toHaveBeenCalledTimes(1);
    expect(findEntitlementPathsMock).toHaveBeenCalledWith({
      where: {
        hearingScheduledDate: { not: null },
        deal: { orgId: ORG_ID },
      },
      select: {
        id: true,
        hearingScheduledDate: true,
        hearingBody: true,
        deal: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { hearingScheduledDate: "asc" },
      take: 50,
    });
  });
});
