import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { encodeMock, getTokenMock } = vi.hoisted(() => ({
  encodeMock: vi.fn(),
  getTokenMock: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  encode: encodeMock,
  getToken: getTokenMock,
}));

describe("GET /api/auth/token", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    encodeMock.mockReset();
    getTokenMock.mockReset();
    process.env = { ...originalEnv };
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses NEXTAUTH_SECRET when AUTH_SECRET is missing", async () => {
    process.env.NEXTAUTH_SECRET = "legacy-nextauth-secret";
    getTokenMock.mockResolvedValue({ sub: "user-1" });
    encodeMock.mockResolvedValue("signed-token");

    const { GET } = await import("./route");
    const response = await GET(new NextRequest("https://gallagherpropco.com/api/auth/token"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: "signed-token" });
    expect(getTokenMock).toHaveBeenCalledWith({
      req: expect.anything(),
      secret: "legacy-nextauth-secret",
      secureCookie: true,
    });
    expect(encodeMock).toHaveBeenCalledWith({
      token: { sub: "user-1" },
      secret: "legacy-nextauth-secret",
      salt: "__Secure-authjs.session-token",
    });
  });

  it("returns 500 when no auth secret is configured", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("https://gallagherpropco.com/api/auth/token"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Auth not configured" });
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("mints a local bypass token when NEXT_PUBLIC_DISABLE_AUTH=true and no session cookie exists", async () => {
    process.env.AUTH_SECRET = "current-auth-secret";
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";
    process.env.LOCAL_DEV_AUTH_USER_ID = "local-user-1";
    process.env.LOCAL_DEV_AUTH_ORG_ID = "local-org-1";
    getTokenMock.mockResolvedValue(null);
    encodeMock.mockResolvedValue("local-bypass-token");

    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost:3002/api/auth/token"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: "local-bypass-token" });
    expect(getTokenMock).toHaveBeenCalledWith({
      req: expect.anything(),
      secret: "current-auth-secret",
      secureCookie: false,
    });
    expect(encodeMock).toHaveBeenCalledWith({
      token: expect.objectContaining({
        sub: "local-user-1",
        userId: "local-user-1",
        orgId: "local-org-1",
        email: "local-dev@gallagherpropco.com",
      }),
      secret: "current-auth-secret",
      salt: "authjs.session-token",
    });
  });
});
