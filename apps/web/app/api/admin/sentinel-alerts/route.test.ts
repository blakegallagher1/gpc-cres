import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  automationEventCreateMock,
  automationEventFindManyMock,
  sentryCaptureExceptionMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  automationEventCreateMock: vi.fn(),
  automationEventFindManyMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    automationEvent: {
      create: automationEventCreateMock,
      findMany: automationEventFindManyMock,
    },
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
}));

import { GET, POST } from "./route";

describe("/api/admin/sentinel-alerts", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    automationEventCreateMock.mockReset();
    automationEventFindManyMock.mockReset();
    sentryCaptureExceptionMock.mockReset();

    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: {
        orgId: "org-1",
        userId: "user-1",
      },
      authorizedBy: "webhook_key",
      rule: { routePattern: "/api/admin/sentinel-alerts", authMode: "webhook", scopes: [] },
      key: null,
    });
  });

  it("returns the authorization response when the caller is rejected", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await POST(
      new NextRequest("http://localhost/api/admin/sentinel-alerts", {
        method: "POST",
        body: JSON.stringify({ verdict: "FAIL" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(automationEventCreateMock).not.toHaveBeenCalled();
  });

  it("persists webhook alerts on POST", async () => {
    automationEventCreateMock.mockResolvedValue({ id: "evt-1" });

    const response = await POST(
      new NextRequest("http://localhost/api/admin/sentinel-alerts", {
        method: "POST",
        body: JSON.stringify({
          verdict: "FAIL",
          failCount: 2,
          warnCount: 1,
          failingChecks: ["chat-runtime", "map"],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, stored: true });
    expect(automationEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "00000000-0000-0000-0000-000000000001",
        handlerName: "stability-sentinel-cli",
        eventType: "sentinel.alert",
        status: "completed",
        inputData: expect.objectContaining({
          verdict: "FAIL",
          failCount: 2,
          warnCount: 1,
        }),
        outputData: {
          source: "webhook",
          verdict: "FAIL",
          failCount: 2,
          warnCount: 1,
        },
        startedAt: expect.any(Date),
        completedAt: expect.any(Date),
        durationMs: 0,
      }),
    });
  });

  it("returns recent sentinel alerts on GET", async () => {
    automationEventFindManyMock.mockResolvedValue([
      {
        id: "evt-1",
        handlerName: "stability-sentinel-cli",
        inputData: { verdict: "FAIL" },
        outputData: { source: "webhook", failCount: 1 },
        startedAt: new Date("2026-04-01T12:00:00.000Z"),
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/admin/sentinel-alerts"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      count: 1,
      alerts: [
        {
          id: "evt-1",
          source: "stability-sentinel-cli",
          inputData: { verdict: "FAIL" },
          outputData: { source: "webhook", failCount: 1 },
          startedAt: "2026-04-01T12:00:00.000Z",
        },
      ],
    });
    expect(automationEventFindManyMock).toHaveBeenCalledWith({
      where: {
        handlerName: { in: ["stability-sentinel", "stability-sentinel-cli"] },
        eventType: "sentinel.alert",
        startedAt: { gte: expect.any(Date) },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  });
});