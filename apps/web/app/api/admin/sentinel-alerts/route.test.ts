import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  persistSentinelAlertMock,
  listRecentSentinelAlertsMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  persistSentinelAlertMock: vi.fn(),
  listRecentSentinelAlertsMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server/admin/sentinel-alerts.service", () => ({
  persistSentinelAlert: persistSentinelAlertMock,
  listRecentSentinelAlerts: listRecentSentinelAlertsMock,
}));

import { GET, POST } from "./route";

describe("/api/admin/sentinel-alerts", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    persistSentinelAlertMock.mockReset();
    listRecentSentinelAlertsMock.mockReset();

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
    expect(persistSentinelAlertMock).not.toHaveBeenCalled();
  });

  it("persists webhook alerts on POST", async () => {
    persistSentinelAlertMock.mockResolvedValue({ ok: true });

    const payload = {
      verdict: "FAIL",
      failCount: 2,
      warnCount: 1,
      failingChecks: ["chat-runtime", "map"],
    };

    const response = await POST(
      new NextRequest("http://localhost/api/admin/sentinel-alerts", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, stored: true });
    expect(persistSentinelAlertMock).toHaveBeenCalledWith(payload);
  });

  it("returns recent sentinel alerts on GET", async () => {
    listRecentSentinelAlertsMock.mockResolvedValue({
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

    const response = await GET(
      new NextRequest("http://localhost/api/admin/sentinel-alerts"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
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
    expect(listRecentSentinelAlertsMock).toHaveBeenCalledTimes(1);
  });
});
