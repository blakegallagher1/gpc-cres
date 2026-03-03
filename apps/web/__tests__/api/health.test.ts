import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    orgMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no auth token or session present", async () => {
    const previousHealthToken = process.env.HEALTHCHECK_TOKEN;
    const previousVercelAccessToken = process.env.VERCEL_ACCESS_TOKEN;

    delete process.env.HEALTHCHECK_TOKEN;
    delete process.env.VERCEL_ACCESS_TOKEN;

    try {
      const { GET } = await import("@/app/api/health/route");
      const { getToken } = await import("next-auth/jwt");

      const response = await GET(new NextRequest("http://localhost/api/health"));

      expect(response.status).toBe(401);
      expect(getToken).toHaveBeenCalled();
    } finally {
      if (previousHealthToken === undefined) {
        delete process.env.HEALTHCHECK_TOKEN;
      } else {
        process.env.HEALTHCHECK_TOKEN = previousHealthToken;
      }
      if (previousVercelAccessToken === undefined) {
        delete process.env.VERCEL_ACCESS_TOKEN;
      } else {
        process.env.VERCEL_ACCESS_TOKEN = previousVercelAccessToken;
      }
    }
  });

  it("authorizes with x-health-token without calling getToken", async () => {
    const previousHealthToken = process.env.HEALTHCHECK_TOKEN;
    process.env.HEALTHCHECK_TOKEN = "health-token";

    try {
      const { GET } = await import("@/app/api/health/route");
      const { getToken } = await import("next-auth/jwt");

      const response = await GET(
        new NextRequest("http://localhost/api/health", {
          headers: { "x-health-token": "health-token" },
        })
      );

      expect(response.status).not.toBe(401);
      expect(getToken).not.toHaveBeenCalled();
    } finally {
      if (previousHealthToken === undefined) {
        delete process.env.HEALTHCHECK_TOKEN;
      } else {
        process.env.HEALTHCHECK_TOKEN = previousHealthToken;
      }
    }
  });
});
