import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthMock, getTokenMock } = vi.hoisted(() => {
  const getTokenMock = vi.fn();
  const getAuthMock = vi.fn();
  return { getAuthMock, getTokenMock };
});

vi.mock("@clerk/nextjs/server", () => ({
  getAuth: getAuthMock,
}));

vi.mock("server-only", () => ({}));

describe("GET /api/auth/token", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    getAuthMock.mockReset();
    getTokenMock.mockReset();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_DISABLE_AUTH;
    delete process.env.LOCAL_DEV_AUTH_USER_ID;
    delete process.env.LOCAL_DEV_AUTH_ORG_ID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 401 when no user session exists", async () => {
    getAuthMock.mockReturnValue({ userId: null, getToken: getTokenMock });

    const { GET } = await import("./route");
    const response = await GET(new NextRequest("https://gallagherpropco.com/api/auth/token"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not authenticated" });
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("returns 401 when getToken returns null", async () => {
    getAuthMock.mockReturnValue({ userId: "clerk_user_1", getToken: getTokenMock });
    getTokenMock.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(new NextRequest("https://gallagherpropco.com/api/auth/token"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Token unavailable" });
  });

  it("returns signed token when user is authenticated", async () => {
    getAuthMock.mockReturnValue({ userId: "clerk_user_1", getToken: getTokenMock });
    getTokenMock.mockResolvedValue("clerk-signed-token");

    const { GET } = await import("./route");
    const response = await GET(new NextRequest("https://gallagherpropco.com/api/auth/token"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: "clerk-signed-token" });
    expect(getTokenMock).toHaveBeenCalled();
  });

  it("returns local dev bypass token when NEXT_PUBLIC_DISABLE_AUTH=true", async () => {
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";
    process.env.LOCAL_DEV_AUTH_USER_ID = "local-user-1";
    process.env.LOCAL_DEV_AUTH_ORG_ID = "local-org-1";

    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost:3002/api/auth/token"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.token).toMatch(/^local-dev:local-user-1:local-org-1$/);
    expect(getAuthMock).not.toHaveBeenCalled();
  });
});
