import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTokenMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

import { proxy } from "./proxy";

describe("proxy", () => {
  beforeEach(() => {
    getTokenMock.mockReset();
  });

  it("allows the public homepage without consulting auth", async () => {
    const response = await proxy(new NextRequest("http://localhost/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("allows public asset requests without consulting auth", async () => {
    const response = await proxy(new NextRequest("http://localhost/images/entitlement-os-login-hero.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("allows public video asset requests without consulting auth", async () => {
    const response = await proxy(new NextRequest("http://localhost/video/gpc-home-hero-video.mp4"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("redirects authenticated users from login to the chat workspace", async () => {
    getTokenMock.mockResolvedValue({ sub: "user-1" });

    const response = await proxy(new NextRequest("http://localhost/login"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/chat");
  });

  it("redirects protected routes to login when no session token is present", async () => {
    getTokenMock.mockResolvedValue(null);

    const response = await proxy(new NextRequest("http://localhost/map"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fmap");
    expect(getTokenMock).toHaveBeenCalledTimes(1);
  });
});
