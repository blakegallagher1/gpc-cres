import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getTokenMock, isEmailAllowedMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getTokenMock: vi.fn(),
  isEmailAllowedMock: vi.fn(),
  prismaMock: {
    orgMembership: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/auth/allowedEmails", () => ({
  isEmailAllowed: isEmailAllowedMock,
}));

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

describe("resolveRouteAuth", () => {
  let resolveRouteAuth: typeof import("./routeAuth").resolveRouteAuth;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    vi.resetModules();
    authMock.mockReset();
    getTokenMock.mockReset();
    isEmailAllowedMock.mockReset();
    prismaMock.orgMembership.findFirst.mockReset();

    process.env.AUTH_SECRET = "test-secret-32chars-minimum-len";
    process.env.NODE_ENV = originalNodeEnv ?? "test";
    delete process.env.NEXTAUTH_SECRET;
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

  it("returns authorized state for JWT-backed app routes", async () => {
    getTokenMock.mockResolvedValue({ userId: "user-123", orgId: "org-123" });

    const result = await resolveRouteAuth({
      kind: "app",
      request: new Request("http://localhost/api/test"),
    });

    expect(result).toEqual({
      status: "authorized",
      auth: { userId: "user-123", orgId: "org-123" },
    });
  });

  it("accepts NEXTAUTH_SECRET as the route auth token secret fallback", async () => {
    delete process.env.AUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "legacy-nextauth-secret";
    ({ resolveRouteAuth } = await import("./routeAuth"));
    getTokenMock.mockResolvedValue({ userId: "user-legacy", orgId: "org-legacy" });

    const result = await resolveRouteAuth({
      kind: "app",
      request: new Request("http://localhost/api/test"),
    });

    expect(result).toEqual({
      status: "authorized",
      auth: { userId: "user-legacy", orgId: "org-legacy" },
    });
    expect(getTokenMock).toHaveBeenCalledWith({
      req: expect.anything(),
      secret: "legacy-nextauth-secret",
      secureCookie: false,
    });
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
    expect(getTokenMock).not.toHaveBeenCalled();
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
    authMock.mockResolvedValue(null);
    const result = await resolveRouteAuth({
      kind: "admin",
      localBypassEnabled: false,
    });

    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("returns forbidden for admin routes when email is not allowed", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "user-123",
        email: "viewer@example.com",
        orgId: "org-123",
      },
    });
    isEmailAllowedMock.mockReturnValue(false);

    const result = await resolveRouteAuth({
      kind: "admin",
      localBypassEnabled: false,
    });

    expect(result).toEqual({ status: "forbidden" });
  });

  it("returns unauthenticated for admin routes when org context is missing", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "user-123",
        email: "blake@gallagherpropco.com",
      },
    });
    isEmailAllowedMock.mockReturnValue(true);

    const result = await resolveRouteAuth({
      kind: "admin",
      localBypassEnabled: false,
    });

    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("returns authorized state for admin routes with an allowed session", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "user-123",
        email: "blake@gallagherpropco.com",
        orgId: "org-123",
      },
    });
    isEmailAllowedMock.mockReturnValue(true);

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
