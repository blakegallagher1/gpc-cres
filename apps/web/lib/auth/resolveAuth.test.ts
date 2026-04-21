import { beforeEach, describe, expect, it, vi } from "vitest";

const { clerkAuthMock, clerkClientMock, prismaMock } = vi.hoisted(() => ({
  clerkAuthMock: vi.fn(),
  clerkClientMock: vi.fn(),
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
  currentUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

describe("resolveAuth", () => {
  let resolveAuth: typeof import("./resolveAuth").resolveAuth;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    vi.resetModules();
    clerkAuthMock.mockReset();
    clerkClientMock.mockReset();
    prismaMock.user.findFirst.mockReset();
    prismaMock.orgMembership.findFirst.mockReset();

    // Default: no authenticated Clerk user
    clerkAuthMock.mockResolvedValue({ userId: null });

    process.env.NODE_ENV = originalNodeEnv ?? "test";
    delete process.env.NEXT_PUBLIC_DISABLE_AUTH;
    delete process.env.NEXT_PUBLIC_E2E;
    delete process.env.AGENT_TOOL_INTERNAL_TOKEN;
    delete process.env.LOCAL_DEV_AUTH_USER_ID;
    delete process.env.LOCAL_DEV_AUTH_ORG_ID;

    ({ resolveAuth } = await import("./resolveAuth"));
  });

  it("returns null when called with no request", async () => {
    const result = await resolveAuth();
    expect(result).toBeNull();
  });

  it("returns seeded uuid identities when NEXT_PUBLIC_DISABLE_AUTH=true in test env", async () => {
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";
    ({ resolveAuth } = await import("./resolveAuth"));
    const result = await resolveAuth();
    expect(result).toEqual({
      userId: "00000000-0000-0000-0000-000000000003",
      orgId: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("returns configured local dev auth identity when override env vars are set", async () => {
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";
    process.env.LOCAL_DEV_AUTH_USER_ID = "00000000-0000-0000-0000-000000000003";
    process.env.LOCAL_DEV_AUTH_ORG_ID = "00000000-0000-0000-0000-000000000001";
    ({ resolveAuth } = await import("./resolveAuth"));

    const result = await resolveAuth();

    expect(result).toEqual({
      userId: "00000000-0000-0000-0000-000000000003",
      orgId: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("allows the seeded local bypass in explicit Playwright E2E mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";
    process.env.NEXT_PUBLIC_E2E = "true";
    process.env.LOCAL_DEV_AUTH_USER_ID = "00000000-0000-0000-0000-000000000003";
    process.env.LOCAL_DEV_AUTH_ORG_ID = "00000000-0000-0000-0000-000000000001";
    ({ resolveAuth } = await import("./resolveAuth"));

    const result = await resolveAuth(new Request("http://localhost/api/test"));

    expect(result).toEqual({
      userId: "00000000-0000-0000-0000-000000000003",
      orgId: "00000000-0000-0000-0000-000000000001",
    });
    expect(clerkAuthMock).not.toHaveBeenCalled();
  });

  it("returns null when no Clerk userId present", async () => {
    clerkAuthMock.mockResolvedValue({ userId: null });
    const res = await resolveAuth(new Request("http://localhost/api/test"));
    expect(res).toBeNull();
  });

  it("returns userId and orgId from Clerk session via DB lookup", async () => {
    clerkAuthMock.mockResolvedValue({ userId: "clerk_user_abc" });
    const mockClerkUser = {
      emailAddresses: [{ emailAddress: "user@example.com" }],
    };
    const mockGetUser = vi.fn().mockResolvedValue(mockClerkUser);
    clerkClientMock.mockResolvedValue({ users: { getUser: mockGetUser } });
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-abc" });
    prismaMock.orgMembership.findFirst.mockResolvedValue({ orgId: "org-xyz" });

    const res = await resolveAuth(new Request("http://localhost/api/test"));

    expect(res).toEqual({ userId: "user-abc", orgId: "org-xyz" });
    expect(clerkAuthMock).toHaveBeenCalledTimes(1);
    expect(mockGetUser).toHaveBeenCalledWith("clerk_user_abc");
  });

  it("returns null when Clerk user has no email", async () => {
    clerkAuthMock.mockResolvedValue({ userId: "clerk_user_noemail" });
    const mockGetUser = vi.fn().mockResolvedValue({ emailAddresses: [] });
    clerkClientMock.mockResolvedValue({ users: { getUser: mockGetUser } });

    const res = await resolveAuth(new Request("http://localhost/api/test"));
    expect(res).toBeNull();
  });

  it("returns null when DB user not found for Clerk email", async () => {
    clerkAuthMock.mockResolvedValue({ userId: "clerk_user_notindb" });
    const mockGetUser = vi.fn().mockResolvedValue({
      emailAddresses: [{ emailAddress: "notfound@example.com" }],
    });
    clerkClientMock.mockResolvedValue({ users: { getUser: mockGetUser } });
    prismaMock.user.findFirst.mockResolvedValue(null);

    const res = await resolveAuth(new Request("http://localhost/api/test"));
    expect(res).toBeNull();
  });

  it("coordinator-memory bypass uses Prisma only, skips Clerk checks", async () => {
    process.env.AGENT_TOOL_INTERNAL_TOKEN = "internal-secret";
    ({ resolveAuth } = await import("./resolveAuth"));
    prismaMock.orgMembership.findFirst.mockResolvedValue({ orgId: "org-coord" });

    const req = new Request("http://localhost/api/test", {
      headers: {
        Authorization: "Bearer internal-secret",
        "x-agent-tool-auth": "coordinator-memory",
        "x-agent-org-id": "org-coord",
        "x-agent-user-id": "user-coord",
      },
    });
    const res = await resolveAuth(req);
    expect(res).toEqual({ userId: "user-coord", orgId: "org-coord" });
    expect(clerkAuthMock).not.toHaveBeenCalled();
    expect(prismaMock.orgMembership.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-coord", orgId: "org-coord" },
      orderBy: { createdAt: "asc" },
      select: { orgId: true },
    });
  });

  it("coordinator-memory bypass returns null when membership not found", async () => {
    process.env.AGENT_TOOL_INTERNAL_TOKEN = "internal-secret";
    ({ resolveAuth } = await import("./resolveAuth"));
    prismaMock.orgMembership.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost/api/test", {
      headers: {
        Authorization: "Bearer internal-secret",
        "x-agent-tool-auth": "coordinator-memory",
        "x-agent-org-id": "org-coord",
        "x-agent-user-id": "user-coord",
      },
    });
    const res = await resolveAuth(req);
    expect(res).toBeNull();
  });
});
