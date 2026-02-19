import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  headersMock,
  createServerClientMock,
  getUserMock,
  prismaMock,
  startSpanMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  headersMock: vi.fn(),
  createServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
  prismaMock: {
    orgMembership: {
      findFirst: vi.fn(),
    },
  },
  startSpanMock: vi.fn(
    (_spanContext: unknown, callback: () => Promise<unknown>) => callback(),
  ),
  captureExceptionMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
  headers: headersMock,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@sentry/nextjs", () => ({
  startSpan: startSpanMock,
  captureException: captureExceptionMock,
}));

import { resolveAuth } from "./resolveAuth";

describe("resolveAuth", () => {
  let originalSupabaseUrl: string | undefined;
  let originalSupabaseAnonKey: string | undefined;
  let originalDatabaseUrl: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    originalDatabaseUrl = process.env.DATABASE_URL;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.DATABASE_URL = "postgresql://localhost:5432/entitlement_os_test";

    cookiesMock.mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    });
    headersMock.mockResolvedValue({
      get: vi.fn().mockReturnValue(null),
    });
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
  });

  afterEach(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }

    if (originalSupabaseAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
    }

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("returns auth for the oldest membership on happy path", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    prismaMock.orgMembership.findFirst.mockResolvedValue({ orgId: "org-oldest" });

    const auth = await resolveAuth();

    expect(auth).toEqual({ userId: "user-1", orgId: "org-oldest" });
    expect(prismaMock.orgMembership.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "asc" },
      select: { orgId: true },
    });
  });

  it("fails closed when authenticated user has no membership", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-2" } } });
    prismaMock.orgMembership.findFirst.mockResolvedValue(null);

    const auth = await resolveAuth();

    expect(auth).toBeNull();
    expect(prismaMock.orgMembership.findFirst).toHaveBeenCalledTimes(1);
  });

  it("captures bearer token errors and falls back to cookie auth user", async () => {
    headersMock.mockResolvedValue({
      get: vi.fn().mockReturnValue("Bearer expired-token"),
    });
    getUserMock
      .mockResolvedValueOnce({
        data: { user: null },
        error: new Error("JWT expired"),
      })
      .mockResolvedValueOnce({
        data: { user: { id: "user-cookie" } },
      });
    prismaMock.orgMembership.findFirst.mockResolvedValue({ orgId: "org-1" });

    const auth = await resolveAuth();

    expect(auth).toEqual({ userId: "user-cookie", orgId: "org-1" });
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(getUserMock).toHaveBeenNthCalledWith(1, "expired-token");
    expect(getUserMock).toHaveBeenNthCalledWith(2);
  });
});
