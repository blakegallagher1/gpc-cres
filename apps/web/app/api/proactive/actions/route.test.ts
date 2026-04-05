import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listProactiveActionsMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listProactiveActionsMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/proactiveAction.service", () => ({
  listProactiveActions: listProactiveActionsMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET } from "./route";

describe("GET /api/proactive/actions", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listProactiveActionsMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/proactive/actions"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid status filters", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });

    const res = await GET(new NextRequest("http://localhost/api/proactive/actions?status=BOGUS"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid status filter" });
  });

  it("lists proactive actions with an optional valid status filter", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    listProactiveActionsMock.mockResolvedValue([{ id: "action-1", status: "PENDING" }]);

    const res = await GET(new NextRequest("http://localhost/api/proactive/actions?status=PENDING"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ actions: [{ id: "action-1", status: "PENDING" }] });
    expect(listProactiveActionsMock).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
      status: "PENDING",
    });
  });
});