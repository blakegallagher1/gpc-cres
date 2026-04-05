import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  respondToProactiveActionMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  respondToProactiveActionMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/proactiveAction.service", () => ({
  respondToProactiveAction: respondToProactiveActionMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { POST } from "./route";

describe("POST /api/proactive/actions/[id]/respond", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    respondToProactiveActionMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await POST(new NextRequest("http://localhost/api/proactive/actions/action-1/respond", {
      method: "POST",
      body: JSON.stringify({ response: "APPROVE" }),
    }), { params: Promise.resolve({ id: "action-1" }) });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when the response payload is invalid", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });

    const res = await POST(new NextRequest("http://localhost/api/proactive/actions/action-1/respond", {
      method: "POST",
      body: JSON.stringify({ response: "INVALID" }),
    }), { params: Promise.resolve({ id: "action-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("responds to a proactive action", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    respondToProactiveActionMock.mockResolvedValue({ status: "APPROVED" });

    const res = await POST(new NextRequest("http://localhost/api/proactive/actions/action-1/respond", {
      method: "POST",
      body: JSON.stringify({ response: "APPROVE", note: "Looks good" }),
    }), { params: Promise.resolve({ id: "action-1" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, result: { status: "APPROVED" } });
    expect(respondToProactiveActionMock).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
      actionId: "action-1",
      response: "APPROVE",
      note: "Looks good",
    });
  });

  it("returns 404 when the service reports a missing action", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    respondToProactiveActionMock.mockRejectedValue(new Error("Action not found"));

    const res = await POST(new NextRequest("http://localhost/api/proactive/actions/action-1/respond", {
      method: "POST",
      body: JSON.stringify({ response: "REJECT" }),
    }), { params: Promise.resolve({ id: "action-1" }) });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Action not found" });
  });
});