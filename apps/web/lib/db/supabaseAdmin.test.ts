import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

describe("supabaseAdmin env validation", () => {
  const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServerUrl = process.env.SUPABASE_URL;
  const originalCustomPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL;
  const originalCustomServerUrl = process.env.SUPABASE_CUSTOM_DOMAIN_URL;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalPublicUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
    }

    if (originalServerUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalServerUrl;
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

    if (originalServiceRole === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
    }
  });

  it("builds a working admin client on happy path", async () => {
    const authObj = { admin: { listUsers: vi.fn() } };
    createClientMock.mockReturnValue({ auth: authObj });
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const { supabaseAdmin } = await import("./supabaseAdmin");

    expect(createClientMock).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "service-role-key",
    );
    expect((supabaseAdmin as { auth: unknown }).auth).toBe(authObj);
  });

  it("throws when service-role env var is missing", async () => {
    createClientMock.mockReturnValue({ auth: { admin: { listUsers: vi.fn() } } });
    process.env.SUPABASE_URL = "https://project.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { supabaseAdmin } = await import("./supabaseAdmin");

    expect(() => (supabaseAdmin as { auth: unknown }).auth).toThrow(
      "[supabaseAdmin] Missing valid SUPABASE_SERVICE_ROLE_KEY.",
    );
  });

  it("throws when all Supabase URLs are missing", async () => {
    createClientMock.mockReturnValue({ auth: { admin: { listUsers: vi.fn() } } });
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL;
    delete process.env.SUPABASE_CUSTOM_DOMAIN_URL;

    const { supabaseAdmin } = await import("./supabaseAdmin");

    expect(() => (supabaseAdmin as { auth: unknown }).auth).toThrow(
      "[supabaseAdmin] Missing valid NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL or SUPABASE_CUSTOM_DOMAIN_URL or NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.",
    );
  });

  it("treats placeholder service-role env value as invalid", async () => {
    createClientMock.mockReturnValue({ auth: { admin: { listUsers: vi.fn() } } });
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";

    const { supabaseAdmin } = await import("./supabaseAdmin");

    expect(() => (supabaseAdmin as { auth: unknown }).auth).toThrow(
      "[supabaseAdmin] Missing valid SUPABASE_SERVICE_ROLE_KEY.",
    );
  });
});
