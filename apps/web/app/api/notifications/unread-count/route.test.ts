import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, getUnreadCountMock, captureExceptionMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getUnreadCountMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/notification.service", () => ({
  NotificationService: class NotificationService {
    getUnreadCount = getUnreadCountMock;
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { GET } from "./route";

describe("GET /api/notifications/unread-count", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getUnreadCountMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/notifications/unread-count");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getUnreadCountMock).not.toHaveBeenCalled();
  });

  it("returns the unread count for the current user", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    getUnreadCountMock.mockResolvedValue(7);

    const req = new NextRequest("http://localhost/api/notifications/unread-count");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ count: 7 });
    expect(getUnreadCountMock).toHaveBeenCalledWith(
      "99999999-9999-4999-8999-999999999999",
    );
  });

  it("degrades to zero when notification storage is unavailable", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    getUnreadCountMock.mockRejectedValue(
      new Error("Can't reach database server at localhost:5432"),
    );

    const req = new NextRequest("http://localhost/api/notifications/unread-count");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ count: 0, degraded: true });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("degrades to zero when the gateway DB proxy is unavailable", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    getUnreadCountMock.mockRejectedValue(
      new Error('Gateway DB proxy failed across 1 target(s): gateway-proxy (https://gateway.gallagherpropco.com) gateway DB proxy error (530): "error code: 1033"'),
    );

    const req = new NextRequest("http://localhost/api/notifications/unread-count");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ count: 0, degraded: true });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
