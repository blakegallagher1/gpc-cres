import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  tool: <T>(definition: T) => definition,
}));

describe("propertyDbTools rpc key enforcement", () => {
  const originalKey = process.env.LOCAL_API_KEY;
  const originalUrl = process.env.LOCAL_API_URL;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.LOCAL_API_URL;
    delete process.env.LOCAL_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.LOCAL_API_KEY;
    } else {
      process.env.LOCAL_API_KEY = originalKey;
    }

    if (originalUrl === undefined) {
      delete process.env.LOCAL_API_URL;
    } else {
      process.env.LOCAL_API_URL = originalUrl;
    }
  });

  it("returns RPC JSON on happy path with valid gateway credentials", async () => {
    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "gateway-key";
    process.env.GOOGLE_MAPS_API_KEY = "AIzaFakeKey";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: "OK",
          results: [
            {
              geometry: {
                location: { lat: 30.45, lng: -91.15 },
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { rpc } = await import("./propertyDbTools");
    const result = await rpc("api_search_parcels", { search_text: "main" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when LOCAL_API_KEY is missing", async () => {
    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required LOCAL_API_KEY.",
    );
  });

  it("treats whitespace-only LOCAL_API_KEY as missing", async () => {
    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "   ";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required LOCAL_API_KEY.",
    );
  });

  it("throws when LOCAL_API_URL is missing", async () => {
    process.env.LOCAL_API_KEY = "gateway-key";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required LOCAL_API_URL.",
    );
  });

  it("treats whitespace-only LOCAL_API_URL as missing", async () => {
    process.env.LOCAL_API_URL = "   ";
    process.env.LOCAL_API_KEY = "gateway-key";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_search_parcels", { search_text: "main" })).rejects.toThrow(
      "[propertyDbTools] Missing required LOCAL_API_URL.",
    );
  });
});
