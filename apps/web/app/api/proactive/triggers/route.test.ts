import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listProactiveTriggersMock,
  createProactiveTriggerMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listProactiveTriggersMock: vi.fn(),
  createProactiveTriggerMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/proactiveTrigger.service", () => ({
  listProactiveTriggers: listProactiveTriggersMock,
  createProactiveTrigger: createProactiveTriggerMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET, POST } from "./route";

describe("/api/proactive/triggers route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listProactiveTriggersMock.mockReset();
    createProactiveTriggerMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/proactive/triggers"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("lists proactive triggers for the org", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    listProactiveTriggersMock.mockResolvedValue([{ id: "trigger-1", name: "Daily scan" }]);

    const res = await GET(new NextRequest("http://localhost/api/proactive/triggers"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ triggers: [{ id: "trigger-1", name: "Daily scan" }] });
    expect(listProactiveTriggersMock).toHaveBeenCalledWith("org-1");
  });

  it("returns 400 when the proactive trigger payload is invalid", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });

    const res = await POST(new NextRequest("http://localhost/api/proactive/triggers", {
      method: "POST",
      body: JSON.stringify({ name: "", triggerType: "SCHEDULED" }),
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("creates a proactive trigger", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    createProactiveTriggerMock.mockResolvedValue({ id: "trigger-2", name: "Weekly watch" });

    const res = await POST(new NextRequest("http://localhost/api/proactive/triggers", {
      method: "POST",
      body: JSON.stringify({
        name: "Weekly watch",
        triggerType: "SCHEDULED",
        triggerConfig: { cron: "0 9 * * 1" },
        conditions: [],
        actionType: "NOTIFY",
        actionConfig: { channel: "email" },
        requireApproval: true,
        maxRunsPerDay: 5,
        maxAutoCost: 25,
      }),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ trigger: { id: "trigger-2", name: "Weekly watch" } });
    expect(createProactiveTriggerMock).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      expect.objectContaining({
        name: "Weekly watch",
        triggerType: "SCHEDULED",
        actionType: "NOTIFY",
      }),
    );
  });
});