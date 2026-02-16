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
      create: vi.fn(),
    },
    org: {
      findFirst: vi.fn(),
    },
    user: {
      upsert: vi.fn(),
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

    cookiesMock.mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    });
    headersMock.mockResolvedValue({
      get: vi.fn().mockReturnValue(null),
    });
    getUserMock.mockResolvedValue({ data: { user: null } });
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

  it("returns null without touching Prisma when DATABASE_URL is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.DATABASE_URL;

    const auth = await resolveAuth();

    expect(auth).toBeNull();
    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(prismaMock.orgMembership.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.org.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
  });

  it("continues through Supabase auth flow when DATABASE_URL is present", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.DATABASE_URL = "postgresql://localhost:5432/entitlement_os_test";

    const auth = await resolveAuth();

    expect(auth).toBeNull();
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });
});
