import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveAuthMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));
vi.mock("@/lib/server/observability", async () => {
  const actual = await import("../../../../lib/server/observability");
  return actual;
});
vi.mock("@/lib/server/observabilityStore", async () => {
  const actual = await import("../../../../lib/server/observabilityStore");
  return actual;
});

import {
  queryObservabilityStore,
  resetObservabilityStore,
} from "../../../../lib/server/observabilityStore";
import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("POST /api/observability/events", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resetObservabilityStore();
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
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(queryObservabilityStore().stats.totalEvents).toBe(0);
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
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ error: "Forbidden" });
    expect(queryObservabilityStore().stats.totalEvents).toBe(0);
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
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body.error).toBe("Validation failed");
    expect(queryObservabilityStore().stats.totalEvents).toBe(0);
  });

  it("stores valid modern telemetry events in the in-memory observability store", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

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
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({
      ok: true,
      count: 2,
      counts: {
        events: 2,
        monitorSnapshots: 0,
      },
    });

    const stored = queryObservabilityStore();
    expect(stored.stats.totalEvents).toBe(2);
    expect(stored.events).toHaveLength(2);
    expect(stored.events[0]).toMatchObject({
      orgId: ORG_ID,
      userId: USER_ID,
      event: "fetch_error",
      level: "error",
      route: "/api/parcels",
      requestId: "req-123",
      status: 500,
      durationMs: 1200,
      upstream: "client",
    });
    expect(stored.events[0].fields).toMatchObject({
      source: "client",
      schemaVersion: "modern",
      sessionId: "session-1",
      route: "/api/parcels",
    });
    expect(stored.events[1]).toMatchObject({
      orgId: ORG_ID,
      userId: USER_ID,
      event: "route_view",
      level: "info",
      route: "/map",
      upstream: "client",
    });
  });

  it("stores legacy telemetry events and strips spoofed identity metadata", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/observability/events", {
      method: "POST",
      body: JSON.stringify({
        events: [
          {
            kind: "fetch_failure",
            occurredAt: "2026-03-06T01:04:03.000Z",
            route: "/deals",
            viewId: "view-1",
            sessionId: "session-legacy-1",
            level: "warning",
            message: "Failed to fetch deals",
            url: "/api/deals",
            method: "GET",
            statusCode: 503,
            durationMs: 980,
            requestId: " legacy-req-1 ",
            correlationId: "corr-123",
            metadata: {
              userId: "spoofed-user",
              userEmail: "spoofed@example.com",
              orgId: "spoofed-org",
              retryable: true,
            },
          },
        ],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({
      ok: true,
      count: 1,
      counts: {
        events: 1,
        monitorSnapshots: 0,
      },
    });

    const stored = queryObservabilityStore();
    expect(stored.stats.totalEvents).toBe(1);
    expect(stored.events[0]).toMatchObject({
      orgId: ORG_ID,
      userId: USER_ID,
      event: "fetch_failure",
      level: "warn",
      route: "/deals",
      requestId: "legacy-req-1",
      status: 503,
      durationMs: 980,
      upstream: "client",
    });
    expect(stored.events[0].fields).toMatchObject({
      source: "client",
      schemaVersion: "legacy",
      kind: "fetch_failure",
      route: "/deals",
      metadata: {
        retryable: true,
      },
      request: {
        url: "/api/deals",
        method: "GET",
        statusCode: 503,
        durationMs: 980,
        requestId: "legacy-req-1",
        correlationId: "corr-123",
      },
    });
  });

  it("accepts monitor snapshots and stamps auth scope onto them", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/observability/events", {
      method: "POST",
      body: JSON.stringify({
        monitorSnapshots: [
          {
            source: "production-monitor",
            surface: "/map",
            status: "error",
            summary: "Map page failed to load parcels",
            route: "/api/parcels",
            requestId: " req-monitor-1 ",
            details: {
              page: "/map",
              orgId: "spoofed-org",
            },
          },
        ],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({
      ok: true,
      count: 1,
      counts: {
        events: 0,
        monitorSnapshots: 1,
      },
    });

    const stored = queryObservabilityStore({ kind: "monitor" });
    expect(stored.stats.totalMonitorSnapshots).toBe(1);
    expect(stored.monitorSnapshots[0]).toMatchObject({
      source: "production-monitor",
      surface: "/map",
      status: "error",
      summary: "Map page failed to load parcels",
      route: "/api/parcels",
      requestId: "req-monitor-1",
      orgId: ORG_ID,
      userId: USER_ID,
      details: {
        source: "ingest-route",
        page: "/map",
      },
    });
    expect(stored.monitorSnapshots[0].details).not.toHaveProperty("orgId");
    expect(stored.monitorSnapshots[0].details).not.toHaveProperty("userId");
    expect(stored.monitorSnapshots[0].details).not.toHaveProperty("userEmail");
  });
});
