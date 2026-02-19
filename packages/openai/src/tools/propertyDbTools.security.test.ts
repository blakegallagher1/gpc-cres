import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  tool: <T>(definition: T) => definition,
}));

describe("propertyDbTools rpc key enforcement", () => {
  const originalKey = process.env.LA_PROPERTY_DB_KEY;
  const originalUrl = process.env.LA_PROPERTY_DB_URL;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.LA_PROPERTY_DB_URL;
    delete process.env.LA_PROPERTY_DB_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.LA_PROPERTY_DB_KEY;
    } else {
      process.env.LA_PROPERTY_DB_KEY = originalKey;
    }

    if (originalUrl === undefined) {
      delete process.env.LA_PROPERTY_DB_URL;
    } else {
      process.env.LA_PROPERTY_DB_URL = originalUrl;
    }
  });

  it("returns RPC JSON on happy path with a valid LA_PROPERTY_DB_KEY", async () => {
    process.env.LA_PROPERTY_DB_URL = "https://example.supabase.co";
    process.env.LA_PROPERTY_DB_KEY = "service-role-key";
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

  it("throws when LA_PROPERTY_DB_KEY is missing", async () => {
    process.env.LA_PROPERTY_DB_URL = "https://example.supabase.co";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required LA_PROPERTY_DB_KEY.",
    );
  });

  it("treats whitespace-only LA_PROPERTY_DB_KEY as missing", async () => {
    process.env.LA_PROPERTY_DB_URL = "https://example.supabase.co";
    process.env.LA_PROPERTY_DB_KEY = "   ";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required LA_PROPERTY_DB_KEY.",
    );
  });

  it("throws when LA_PROPERTY_DB_URL is missing", async () => {
    process.env.LA_PROPERTY_DB_KEY = "service-role-key";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required LA_PROPERTY_DB_URL.",
    );
  });

  it("treats whitespace-only LA_PROPERTY_DB_URL as missing", async () => {
    process.env.LA_PROPERTY_DB_URL = "   ";
    process.env.LA_PROPERTY_DB_KEY = "service-role-key";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required LA_PROPERTY_DB_URL.",
    );
  });
});
