import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, createManyMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  createManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    automationEvent: {
      createMany: createManyMock,
    },
  },
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("POST /api/observability/events", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    createManyMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/observability/events", {
      method: "POST",
      body: JSON.stringify({ events: [] }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it("returns 403 when auth has no org scope", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: "" });

    const req = new NextRequest("http://localhost/api/observability/events", {
      method: "POST",
      body: JSON.stringify({
        events: [
          {
            type: "route_view",
            timestamp: new Date().toISOString(),
            sessionId: "session-1",
          },
        ],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid payloads", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/observability/events", {
      method: "POST",
      body: JSON.stringify({
        events: [
          {
            type: "route_view",
          },
        ],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it("stores valid telemetry events", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    createManyMock.mockResolvedValue({ count: 2 });

    const payload = {
      events: [
        {
          type: "route_view",
          timestamp: "2026-03-06T01:02:03.000Z",
          sessionId: "session-1",
          pagePath: "/map",
          pageUrl: "https://gallagherpropco.com/map",
          userAgent: "Mozilla/5.0",
        },
        {
          type: "fetch_error",
          timestamp: "2026-03-06T01:02:05.000Z",
          sessionId: "session-1",
          pagePath: "/map",
          request: {
            url: "/api/parcels",
            method: "GET",
            statusCode: 500,
            durationMs: 1200,
            requestId: "req-123",
          },
          error: {
            message: "HTTP 500",
          },
        },
      ],
    };

    const req = new NextRequest("http://localhost/api/observability/events", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ ok: true, count: 2 });
    expect(createManyMock).toHaveBeenCalledTimes(1);

    const args = createManyMock.mock.calls[0]?.[0];
    expect(args.data).toHaveLength(2);
    expect(args.data[0]).toMatchObject({
      orgId: ORG_ID,
      handlerName: "observability-client",
      eventType: "route_view",
      status: "completed",
    });
    expect(args.data[0]?.startedAt).toBeInstanceOf(Date);
    expect(args.data[0]?.completedAt).toBeInstanceOf(Date);
    expect(args.data[1]).toMatchObject({
      orgId: ORG_ID,
      handlerName: "observability-client",
      eventType: "fetch_error",
      status: "failed",
      error: "HTTP 500",
      durationMs: 1200,
    });
    expect(args.data[1]?.inputData).toMatchObject({
      route: "/api/parcels",
      statusCode: 500,
      requestId: "req-123",
    });
  });
});
