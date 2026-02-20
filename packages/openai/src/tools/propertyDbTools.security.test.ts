import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  tool: <T>(definition: T) => definition,
}));

describe("propertyDbTools rpc key enforcement", () => {
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalUrl = process.env.SUPABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }

    if (originalUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalUrl;
    }
  });

  it("returns RPC JSON on happy path with valid SUPABASE credentials", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { rpc } = await import("./propertyDbTools");
    const result = await rpc("api_search_parcels", { search_text: "main" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required SUPABASE_SERVICE_ROLE_KEY.",
    );
  });

  it("treats whitespace-only SUPABASE_SERVICE_ROLE_KEY as missing", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "   ";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required SUPABASE_SERVICE_ROLE_KEY.",
    );
  });

  it("throws when SUPABASE_URL is missing", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required SUPABASE_URL.",
    );
  });

  it("treats whitespace-only SUPABASE_URL as missing", async () => {
    process.env.SUPABASE_URL = "   ";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required SUPABASE_URL.",
    );
  });
});
