import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { currentUserMock, isEmailAllowedMock, prismaMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  isEmailAllowedMock: vi.fn(),
  prismaMock: {
    user: {
      findFirst: vi.fn(),
    },
    orgMembership: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: currentUserMock,
}));
vi.mock("@/lib/auth/allowedEmails", () => ({
  isEmailAllowed: isEmailAllowedMock,
}));
vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));
const { queryRecentObservabilityMock } = vi.hoisted(() => ({
  queryRecentObservabilityMock: vi.fn(),
}));

vi.mock("@/lib/server/observability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/observability")>();
  const store = await import("../../../../lib/server/observabilityStore");
  return {
    ...actual,
    queryRecentObservability: queryRecentObservabilityMock.mockImplementation((options) =>
      store.queryObservabilityStore(options),
    ),
  };
});

import {
  recordObservabilityEvent,
  recordObservabilityMonitorSnapshot,
  resetObservabilityStore,
} from "../../../../lib/server/observabilityStore";
import { GET } from "./route";

// Mirrors the DB IDs returned by the mocked prisma stubs above.
const TEST_SESSION = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "blake@gallagherpropco.com",
    orgId: "22222222-2222-4222-8222-222222222222",
  },
};

// Clerk user object returned by currentUser()
const CLERK_TEST_USER = {
  id: "clerk_11111111-1111-4111-8111-111111111111",
  emailAddresses: [{ emailAddress: "blake@gallagherpropco.com" }],
};

const originalEnv = { ...process.env };

describe("/api/admin/observability route", () => {
  beforeEach(() => {
    resetObservabilityStore();
    vi.clearAllMocks();
    process.env.OBSERVABILITY_ADMIN_LOCAL_BYPASS = "false";
    delete process.env.NEXT_PUBLIC_DISABLE_AUTH;
    // Default: authenticated admin user
    currentUserMock.mockResolvedValue(CLERK_TEST_USER);
    isEmailAllowedMock.mockReturnValue(true);
    // Re-establish default prisma mocks after clearAllMocks
    prismaMock.user.findFirst.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    prismaMock.orgMembership.findFirst.mockResolvedValue({ orgId: "22222222-2222-4222-8222-222222222222" });
  });

  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  it("returns 401 when unauthenticated", async () => {
    currentUserMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/admin/observability"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when authenticated user is not admin", async () => {
    isEmailAllowedMock.mockReturnValue(false);

    const res = await GET(new NextRequest("http://localhost/api/admin/observability"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("returns 400 for invalid query params", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/observability?kind=bad&limit=0&level=trace"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ error: "Invalid limit" });
  });

  it("returns recent observability events and monitor snapshots for admins", async () => {
    recordObservabilityEvent({
      level: "error",
      event: "request_complete",
      route: "/api/map/comps",
      requestId: "req-map-1",
      orgId: TEST_SESSION.user.orgId,
      userId: TEST_SESSION.user.id,
      status: 504,
      durationMs: 61_000,
      fields: {
        upstream: "gateway",
      },
    });
    recordObservabilityEvent({
      level: "info",
      event: "request_complete",
      route: "/api/health",
      requestId: "req-health-1",
      status: 200,
    });
    recordObservabilityMonitorSnapshot({
      source: "production-monitor",
      surface: "/map",
      route: "/api/map/comps",
      status: "error",
      summary: "Map page failed to load parcels",
      details: {
        page: "/map",
      },
    });
    recordObservabilityMonitorSnapshot({
      source: "production-monitor",
      surface: "/api/health",
      route: "/api/health",
      status: "ok",
      summary: "Health endpoint responded",
    });

    const res = await GET(
      new NextRequest(
        "http://localhost/api/admin/observability?route=/api/map/comps&source=production-monitor&surface=/map",
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body.ok).toBe(true);
    expect(body.viewer).toEqual({
      userId: TEST_SESSION.user.id,
      orgId: TEST_SESSION.user.orgId,
    });
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      event: "request_complete",
      route: "/api/map/comps",
      status: 504,
      requestId: "req-map-1",
    });
    expect(body.monitorSnapshots).toHaveLength(1);
    expect(body.monitorSnapshots[0]).toMatchObject({
      source: "production-monitor",
      surface: "/map",
      status: "error",
      summary: "Map page failed to load parcels",
    });
    expect(body.stats).toMatchObject({
      totalEvents: 2,
      totalMonitorSnapshots: 2,
      matchedEvents: 1,
      matchedMonitorSnapshots: 1,
    });
  });

  it("ignores caller orgId filter and forces the authenticated org", async () => {
    recordObservabilityEvent({
      level: "error",
      event: "request_complete",
      route: "/api/map/comps",
      requestId: "req-map-1",
      orgId: TEST_SESSION.user.orgId,
      userId: TEST_SESSION.user.id,
      status: 504,
    });
    recordObservabilityEvent({
      level: "error",
      event: "request_complete",
      route: "/api/map/comps",
      requestId: "req-map-2",
      orgId: "33333333-3333-4333-8333-333333333333",
      userId: TEST_SESSION.user.id,
      status: 504,
    });

    const res = await GET(
      new NextRequest(
        "http://localhost/api/admin/observability?route=/api/map/comps&orgId=33333333-3333-4333-8333-333333333333",
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(queryRecentObservabilityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: TEST_SESSION.user.orgId,
      }),
    );
    expect(body.events).toHaveLength(1);
    expect(body.events[0].orgId).toBe(TEST_SESSION.user.orgId);
    expect(body.filters.orgId).toBe(TEST_SESSION.user.orgId);
  });

  it("supports local dev auth bypass", async () => {
    process.env.OBSERVABILITY_ADMIN_LOCAL_BYPASS = "true";
    delete process.env.NEXT_PUBLIC_DISABLE_AUTH;
    currentUserMock.mockResolvedValue(null);

    recordObservabilityMonitorSnapshot({
      source: "production-monitor",
      surface: "/api/deals",
      status: "degraded",
      summary: "Deals endpoint slow",
    });

    const res = await GET(new NextRequest("http://localhost/api/admin/observability?kind=snapshot"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body.viewer).toEqual({
      userId: "local-dev-user",
      orgId: "local-dev-org",
    });
    expect(body.events).toHaveLength(0);
    expect(body.monitorSnapshots).toHaveLength(1);
  });
});
