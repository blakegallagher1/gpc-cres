import { beforeEach, describe, expect, it, vi } from "vitest";

const { clerkAuthMock, clerkClientMock, currentUserMock, isEmailAllowedMock, prismaMock } = vi.hoisted(() => ({
  clerkAuthMock: vi.fn(),
  clerkClientMock: vi.fn(),
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
  auth: clerkAuthMock,
  clerkClient: clerkClientMock,
  currentUser: currentUserMock,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/allowedEmails", () => ({
  isEmailAllowed: isEmailAllowedMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

describe("resolveRouteAuth", () => {
  let resolveRouteAuth: typeof import("./routeAuth").resolveRouteAuth;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    vi.resetModules();
    clerkAuthMock.mockReset();
    clerkClientMock.mockReset();
    currentUserMock.mockReset();
    isEmailAllowedMock.mockReset();
    prismaMock.user.findFirst.mockReset();
    prismaMock.orgMembership.findFirst.mockReset();

    process.env.NODE_ENV = originalNodeEnv ?? "test";
    delete process.env.NEXT_PUBLIC_DISABLE_AUTH;
    delete process.env.NEXT_PUBLIC_E2E;
    delete process.env.AGENT_TOOL_INTERNAL_TOKEN;
    delete process.env.LOCAL_DEV_AUTH_USER_ID;
    delete process.env.LOCAL_DEV_AUTH_ORG_ID;

    ({ resolveRouteAuth } = await import("./routeAuth"));
  });

  it("returns unauthenticated for app routes without a request", async () => {
    const result = await resolveRouteAuth({ kind: "app" });
    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("returns authorized state for app-route local bypass", async () => {
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";
    ({ resolveRouteAuth } = await import("./routeAuth"));

    const result = await resolveRouteAuth({ kind: "app" });

    expect(result).toEqual({
      status: "authorized",
      auth: {
        userId: "00000000-0000-0000-0000-000000000003",
        orgId: "00000000-0000-0000-0000-000000000001",
      },
    });
  });

  it("falls back to the seeded local user when local bypass env ids are stale", async () => {
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";
    process.env.LOCAL_DEV_AUTH_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    process.env.LOCAL_DEV_AUTH_ORG_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    prismaMock.orgMembership.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        userId: "00000000-0000-0000-0000-000000000003",
        orgId: "00000000-0000-0000-0000-000000000001",
      });
    ({ resolveRouteAuth } = await import("./routeAuth"));

    const result = await resolveRouteAuth({ kind: "app" });

    expect(result).toEqual({
      status: "authorized",
      auth: {
        userId: "00000000-0000-0000-0000-000000000003",
        orgId: "00000000-0000-0000-0000-000000000001",
      },
    });
  });

  it("returns authorized state for Clerk-backed app routes", async () => {
    clerkAuthMock.mockResolvedValue({ userId: "clerk_user_123" });
    const mockGetUser = vi.fn().mockResolvedValue({
      emailAddresses: [{ emailAddress: "user@example.com" }],
    });
    clerkClientMock.mockResolvedValue({ users: { getUser: mockGetUser } });
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-123" });
    prismaMock.orgMembership.findFirst.mockResolvedValue({ orgId: "org-123" });

    const result = await resolveRouteAuth({
      kind: "app",
      request: new Request("http://localhost/api/test"),
    });

    expect(result).toEqual({
      status: "authorized",
      auth: { userId: "user-123", orgId: "org-123" },
    });
  });

  it("returns unauthenticated for app routes when Clerk returns no userId", async () => {
    clerkAuthMock.mockResolvedValue({ userId: null });

    const result = await resolveRouteAuth({
      kind: "app",
      request: new Request("http://localhost/api/test"),
    });

    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("returns authorized state for coordinator memory app-route auth", async () => {
    process.env.AGENT_TOOL_INTERNAL_TOKEN = "internal-secret";
    prismaMock.orgMembership.findFirst.mockResolvedValue({ orgId: "org-coord" });
    ({ resolveRouteAuth } = await import("./routeAuth"));

    const result = await resolveRouteAuth({
      kind: "app",
      request: new Request("http://localhost/api/test", {
        headers: {
          Authorization: "Bearer internal-secret",
          "x-agent-tool-auth": "coordinator-memory",
          "x-agent-org-id": "org-coord",
          "x-agent-user-id": "user-coord",
        },
      }),
    });

    expect(result).toEqual({
      status: "authorized",
      auth: { userId: "user-coord", orgId: "org-coord" },
    });
    expect(clerkAuthMock).not.toHaveBeenCalled();
  });

  it("returns authorized state for admin-route local bypass", async () => {
    const result = await resolveRouteAuth({
      kind: "admin",
      localBypassEnabled: true,
    });

    expect(result).toEqual({
      status: "authorized",
      auth: { userId: "local-dev-user", orgId: "local-dev-org" },
    });
  });

  it("returns unauthenticated for admin routes without a session", async () => {
    currentUserMock.mockResolvedValue(null);
    const result = await resolveRouteAuth({
      kind: "admin",
      localBypassEnabled: false,
    });

    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("returns forbidden for admin routes when email is not allowed", async () => {
    currentUserMock.mockResolvedValue({
      id: "clerk_user_123",
      emailAddresses: [{ emailAddress: "viewer@example.com" }],
    });
    isEmailAllowedMock.mockReturnValue(false);

    const result = await resolveRouteAuth({
      kind: "admin",
      localBypassEnabled: false,
    });

    expect(result).toEqual({ status: "forbidden" });
  });

  it("returns unauthenticated for admin routes when DB user not found", async () => {
    currentUserMock.mockResolvedValue({
      id: "clerk_user_123",
      emailAddresses: [{ emailAddress: "blake@gallagherpropco.com" }],
    });
    isEmailAllowedMock.mockReturnValue(true);
    prismaMock.user.findFirst.mockResolvedValue(null);

    const result = await resolveRouteAuth({
      kind: "admin",
      localBypassEnabled: false,
    });

    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("returns authorized state for admin routes with an allowed session", async () => {
    currentUserMock.mockResolvedValue({
      id: "clerk_user_123",
      emailAddresses: [{ emailAddress: "blake@gallagherpropco.com" }],
    });
    isEmailAllowedMock.mockReturnValue(true);
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-123" });
    prismaMock.orgMembership.findFirst.mockResolvedValue({ orgId: "org-123" });

    const result = await resolveRouteAuth({
      kind: "admin",
      localBypassEnabled: false,
    });

    expect(result).toEqual({
      status: "authorized",
      auth: { userId: "user-123", orgId: "org-123" },
    });
  });
});
