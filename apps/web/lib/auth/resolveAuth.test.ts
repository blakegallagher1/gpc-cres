import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTokenMock, prismaMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  prismaMock: {
    orgMembership: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

describe("resolveAuth", () => {
  let resolveAuth: typeof import("./resolveAuth").resolveAuth;

  beforeEach(async () => {
    vi.resetModules();
    getTokenMock.mockReset();
    prismaMock.orgMembership.findFirst.mockReset();

    process.env.NEXTAUTH_SECRET = "test-secret-32chars-minimum-len";
    delete process.env.NEXT_PUBLIC_DISABLE_AUTH;
    delete process.env.AGENT_TOOL_INTERNAL_TOKEN;

    ({ resolveAuth } = await import("./resolveAuth"));
  });

  it("returns null when called with no request", async () => {
    const result = await resolveAuth();
    expect(result).toBeNull();
  });

  it("returns dev user when NEXT_PUBLIC_DISABLE_AUTH=true in test env", async () => {
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";
    ({ resolveAuth } = await import("./resolveAuth"));
    const result = await resolveAuth();
    expect(result).toEqual({ userId: "dev-user", orgId: "dev-org" });
  });

  it("returns null when no auth token present", async () => {
    getTokenMock.mockResolvedValue(null);
    const res = await resolveAuth(new Request("http://localhost/api/test"));
    expect(res).toBeNull();
  });

  it("returns userId and orgId from cookie session token", async () => {
    getTokenMock.mockResolvedValue({ userId: "user-abc", orgId: "org-xyz" });
    const res = await resolveAuth(new Request("http://localhost/api/test"));
    expect(res).toEqual({ userId: "user-abc", orgId: "org-xyz" });
    expect(getTokenMock).toHaveBeenCalledWith({
      req: expect.anything(),
      secret: "test-secret-32chars-minimum-len",
    });
  });

  it("returns userId and orgId from Bearer token via getToken", async () => {
    getTokenMock.mockResolvedValue({ userId: "user-bearer", orgId: "org-bearer" });
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer raw.jwt.token" },
    });
    const res = await resolveAuth(req);
    expect(res).toEqual({ userId: "user-bearer", orgId: "org-bearer" });
    expect(getTokenMock).toHaveBeenCalledWith({
      req: expect.anything(),
      secret: "test-secret-32chars-minimum-len",
    });
  });

  it("returns null when Bearer token is invalid", async () => {
    getTokenMock.mockResolvedValue(null);
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer bad.token" },
    });
    const res = await resolveAuth(req);
    expect(res).toBeNull();
  });

  it("coordinator-memory bypass uses Prisma only, skips JWT checks", async () => {
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
    expect(getTokenMock).not.toHaveBeenCalled();
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
