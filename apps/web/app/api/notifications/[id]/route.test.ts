import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, markReadMock, dismissMock, captureExceptionMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  markReadMock: vi.fn(),
  dismissMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/notification.service", () => ({
  NotificationService: class NotificationService {
    markRead = markReadMock;
    dismiss = dismissMock;
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { AppError } from "@/lib/errors";
import { PATCH } from "./route";

describe("PATCH /api/notifications/[id]", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    markReadMock.mockReset();
    dismissMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/notifications/note-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "read" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "note-1" }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(markReadMock).not.toHaveBeenCalled();
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it("marks notifications read", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });

    const req = new NextRequest("http://localhost/api/notifications/note-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "read" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "note-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(markReadMock).toHaveBeenCalledWith(
      "note-1",
      "99999999-9999-4999-8999-999999999999",
    );
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid actions", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });

    const req = new NextRequest("http://localhost/api/notifications/note-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "archive" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "note-1" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid action. Use 'read' or 'dismiss'." });
  });

  it("surfaces AppError responses with typed status codes", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    dismissMock.mockRejectedValue(new AppError("Notification not found", "NOT_FOUND", 404));

    const req = new NextRequest("http://localhost/api/notifications/note-2", {
      method: "PATCH",
      body: JSON.stringify({ action: "dismiss" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "note-2" }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Notification not found" });
    expect(captureExceptionMock).toHaveBeenCalled();
  });
});