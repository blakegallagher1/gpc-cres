import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted so both clerkAuthMock and handlerRef are available when the
// vi.mock factory runs (vi.mock is hoisted to the top of the file by Vitest).
const { clerkAuthMock, handlerRef } = vi.hoisted(() => {
  type HandlerFn = (
    clerkAuth: () => Promise<{ userId: string | null }>,
    request: NextRequest,
  ) => Promise<Response>;
  return {
    clerkAuthMock: vi.fn(),
    handlerRef: { fn: null as HandlerFn | null },
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (
    handler: (
      clerkAuth: () => Promise<{ userId: string | null }>,
      request: NextRequest,
    ) => Promise<Response>,
  ) => {
    handlerRef.fn = handler;
    // Return a function that delegates to the captured handler using the mock auth.
    return (request: NextRequest) => handlerRef.fn!(clerkAuthMock, request);
  },
}));

import { proxy } from "./proxy";

describe("proxy", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    clerkAuthMock.mockReset();
    // Default: no authenticated user
    clerkAuthMock.mockResolvedValue({ userId: null });
    process.env = {
      ...originalEnv,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("allows the public homepage without consulting auth", async () => {
    const response = await proxy(new NextRequest("http://localhost/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(clerkAuthMock).not.toHaveBeenCalled();
  });

  it("allows public asset requests without consulting auth", async () => {
    const response = await proxy(new NextRequest("http://localhost/images/entitlement-os-login-hero.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(clerkAuthMock).not.toHaveBeenCalled();
  });

  it("allows public video asset requests without consulting auth", async () => {
    const response = await proxy(new NextRequest("http://localhost/video/gpc-home-hero-video.mp4"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(clerkAuthMock).not.toHaveBeenCalled();
  });

  it("redirects authenticated users from login to the chat workspace", async () => {
    clerkAuthMock.mockResolvedValue({ userId: "user_clerk_123" });

    const response = await proxy(new NextRequest("http://localhost/login"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/chat");
  });

  it("allows the login page through when no authenticated user", async () => {
    clerkAuthMock.mockResolvedValue({ userId: null });

    const response = await proxy(new NextRequest("http://localhost/login"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects protected routes to login when no session token is present", async () => {
    clerkAuthMock.mockResolvedValue({ userId: null });

    const response = await proxy(new NextRequest("http://localhost/map"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fmap");
    expect(clerkAuthMock).toHaveBeenCalledTimes(1);
  });

  it("allows protected routes when user is authenticated", async () => {
    clerkAuthMock.mockResolvedValue({ userId: "user_clerk_123" });

    const response = await proxy(new NextRequest("http://localhost/map"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects to auth_db_unreachable when middleware auth lookup throws", async () => {
    clerkAuthMock.mockRejectedValue(new Error("clerk down"));

    const response = await proxy(new NextRequest("http://localhost/map"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=auth_db_unreachable",
    );
  });

  it("allows API routes through without checking clerk auth directly", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/health"));

    expect(response.status).toBe(200);
    expect(clerkAuthMock).not.toHaveBeenCalled();
  });
});
