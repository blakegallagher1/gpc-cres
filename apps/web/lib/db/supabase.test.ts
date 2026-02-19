import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createBrowserClientMock } = vi.hoisted(() => ({
  createBrowserClientMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: createBrowserClientMock,
}));

describe("supabase browser client env validation", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalCustomPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL;
  const originalCustomServerUrl = process.env.SUPABASE_CUSTOM_DOMAIN_URL;
  const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalCustomPublicUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL = originalCustomPublicUrl;
    }

    if (originalCustomServerUrl === undefined) {
      delete process.env.SUPABASE_CUSTOM_DOMAIN_URL;
    } else {
      process.env.SUPABASE_CUSTOM_DOMAIN_URL = originalCustomServerUrl;
    }

    if (originalAnon === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
    }
  });

  it("builds a working client on happy path", async () => {
    const authObj = { signInWithPassword: vi.fn() };
    createBrowserClientMock.mockReturnValue({ auth: authObj });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const { supabase } = await import("./supabase");

    expect(createBrowserClientMock).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
    );
    expect((supabase as { auth: unknown }).auth).toBe(authObj);
  });

  it("throws when env vars are missing", async () => {
    createBrowserClientMock.mockReturnValue({ auth: { signInWithPassword: vi.fn() } });
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL;
    delete process.env.SUPABASE_CUSTOM_DOMAIN_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const { supabase } = await import("./supabase");

    expect(() => (supabase as { auth: unknown }).auth).toThrow(
      "[supabase] Missing valid NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL or SUPABASE_CUSTOM_DOMAIN_URL or NEXT_PUBLIC_SUPABASE_URL.",
    );
  });

  it("treats placeholder env values as invalid", async () => {
    createBrowserClientMock.mockReturnValue({ auth: { signInWithPassword: vi.fn() } });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL;
    delete process.env.SUPABASE_CUSTOM_DOMAIN_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "placeholder";

    const { supabase } = await import("./supabase");

    expect(() => (supabase as { auth: unknown }).auth).toThrow(
      "[supabase] Missing valid NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL or SUPABASE_CUSTOM_DOMAIN_URL or NEXT_PUBLIC_SUPABASE_URL.",
    );
  });
});
