import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, markAllReadMock, captureExceptionMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  markAllReadMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/notification.service", () => ({
  NotificationService: class NotificationService {
    markAllRead = markAllReadMock;
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { POST } from "./route";

describe("POST /api/notifications/mark-all-read", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    markAllReadMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/notifications/mark-all-read", {
      method: "POST",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(markAllReadMock).not.toHaveBeenCalled();
  });

  it("marks all notifications read for the current user", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    markAllReadMock.mockResolvedValue(4);

    const req = new NextRequest("http://localhost/api/notifications/mark-all-read", {
      method: "POST",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, markedRead: 4 });
    expect(markAllReadMock).toHaveBeenCalledWith(
      "99999999-9999-4999-8999-999999999999",
    );
  });

  it("returns 500 when marking all read fails", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    const error = new Error("write failed");
    markAllReadMock.mockRejectedValue(error);

    const req = new NextRequest("http://localhost/api/notifications/mark-all-read", {
      method: "POST",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Failed to mark all read" });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { route: "api.notifications.mark-all-read", method: "POST" },
      }),
    );
  });
});