import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  })),
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without creating supabase client when supabase env is missing", async () => {
    const previousPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousPublicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const previousUrl = process.env.SUPABASE_URL;
    const previousAnonKey = process.env.SUPABASE_ANON_KEY;
    const previousHealthToken = process.env.HEALTHCHECK_TOKEN;
    const previousVercelAccessToken = process.env.VERCEL_ACCESS_TOKEN;

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.HEALTHCHECK_TOKEN;
    delete process.env.VERCEL_ACCESS_TOKEN;

    try {
      const { GET } = await import("@/app/api/health/route");
      const { createServerClient } = await import("@supabase/ssr");

      const response = await GET(new NextRequest("http://localhost/api/health"));

      expect(response.status).toBe(401);
      expect(createServerClient).not.toHaveBeenCalled();
    } finally {
      if (previousPublicUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = previousPublicUrl;
      }
      if (previousPublicAnonKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousPublicAnonKey;
      }
      if (previousUrl === undefined) {
        delete process.env.SUPABASE_URL;
      } else {
        process.env.SUPABASE_URL = previousUrl;
      }
      if (previousAnonKey === undefined) {
        delete process.env.SUPABASE_ANON_KEY;
      } else {
        process.env.SUPABASE_ANON_KEY = previousAnonKey;
      }
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

  it("authorizes with x-health-token without calling supabase", async () => {
    const previousHealthToken = process.env.HEALTHCHECK_TOKEN;
    process.env.HEALTHCHECK_TOKEN = "health-token";

    try {
      const { GET } = await import("@/app/api/health/route");
      const { createServerClient } = await import("@supabase/ssr");

      const response = await GET(
        new NextRequest("http://localhost/api/health", {
          headers: { "x-health-token": "health-token" },
        })
      );

      expect(response.status).not.toBe(401);
      expect(createServerClient).not.toHaveBeenCalled();
    } finally {
      if (previousHealthToken === undefined) {
        delete process.env.HEALTHCHECK_TOKEN;
      } else {
        process.env.HEALTHCHECK_TOKEN = previousHealthToken;
      }
    }
  });
});
