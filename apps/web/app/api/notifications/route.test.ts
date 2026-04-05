import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, getAllMock, captureExceptionMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getAllMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/notification.service", () => ({
  NotificationService: class NotificationService {
    getAll = getAllMock;
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { GET } from "./route";

describe("GET /api/notifications", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getAllMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/notifications");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getAllMock).not.toHaveBeenCalled();
  });

  it("passes parsed filters to the notification service", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    getAllMock.mockResolvedValue({
      notifications: [{ id: "note-1", title: "Ping" }],
      total: 1,
      hasMore: false,
    });

    const req = new NextRequest(
      "http://localhost/api/notifications?type=SYSTEM&priority=HIGH&unread=true&dealId=deal-1&limit=25&offset=10",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      notifications: [{ id: "note-1", title: "Ping" }],
      total: 1,
      hasMore: false,
    });
    expect(getAllMock).toHaveBeenCalledWith(
      "99999999-9999-4999-8999-999999999999",
      {
        type: "SYSTEM",
        priority: "HIGH",
        unreadOnly: true,
        dealId: "deal-1",
        limit: 25,
        offset: 10,
      },
    );
  });

  it("returns 500 and captures unexpected service failures", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    const error = new Error("db offline");
    getAllMock.mockRejectedValue(error);

    const req = new NextRequest("http://localhost/api/notifications");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Failed to fetch notifications" });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { route: "api.notifications", method: "GET" },
      }),
    );
  });
});