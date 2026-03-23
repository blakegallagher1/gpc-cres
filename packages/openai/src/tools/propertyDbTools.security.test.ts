import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  tool: <T>(definition: T) => definition,
}));

describe("propertyDbTools rpc key enforcement", () => {
  const originalKey = process.env.LOCAL_API_KEY;
  const originalUrl = process.env.LOCAL_API_URL;
  const originalGoogleMapsKey = process.env.GOOGLE_MAPS_API_KEY;

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

    if (originalGoogleMapsKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalGoogleMapsKey;
    }
  });

  it("returns RPC JSON on happy path with geocode + gateway POST sequence", async () => {
    process.env.LOCAL_API_URL = "https://api.example.com";
    process.env.LOCAL_API_KEY = "local-api-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ lat: "30.4515", lon: "-91.1871" }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { rpc } = await import("./propertyDbTools");
    const result = await rpc("api_search_parcels", { search_text: "main", limit_rows: 7 });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(
      /^https:\/\/nominatim\.openstreetmap\.org\/search\?/,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { "User-Agent": "EntitlementOS/1.0 (gallagherpropco.com)" },
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.example.com/tools/parcel.bbox");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer local-api-key",
        apikey: "local-api-key",
        "Content-Type": "application/json",
      },
    });
    const bboxBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(bboxBody.limit).toBe(7);
    expect(bboxBody.min_lat).toBeCloseTo(30.4465, 3);
    expect(bboxBody.max_lat).toBeCloseTo(30.4565, 3);
    expect(bboxBody.min_lng).toBeCloseTo(-91.1921, 3);
    expect(bboxBody.max_lng).toBeCloseTo(-91.1821, 3);
  });

  it("throws when LOCAL_API_KEY is missing", async () => {
    process.env.LOCAL_API_URL = "https://api.example.com";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_get_parcel", { parcel_id: "001-5096-7" })).rejects.toThrow(
      "[propertyDbTools] Missing required LOCAL_API_KEY.",
    );
  });

  it("treats whitespace-only LOCAL_API_KEY as missing", async () => {
    process.env.LOCAL_API_URL = "https://api.example.com";
    process.env.LOCAL_API_KEY = "   ";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_get_parcel", { parcel_id: "001-5096-7" })).rejects.toThrow(
      "[propertyDbTools] Missing required LOCAL_API_KEY.",
    );
  });

  it("throws when LOCAL_API_URL is missing", async () => {
    process.env.LOCAL_API_KEY = "local-api-key";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_get_parcel", { parcel_id: "001-5096-7" })).rejects.toThrow(
      "[propertyDbTools] Missing required LOCAL_API_URL.",
    );
  });

  it("treats whitespace-only LOCAL_API_URL as missing", async () => {
    process.env.LOCAL_API_URL = "   ";
    process.env.LOCAL_API_KEY = "local-api-key";
    const { rpc } = await import("./propertyDbTools");

    await expect(rpc("api_get_parcel", { parcel_id: "001-5096-7" })).rejects.toThrow(
      "[propertyDbTools] Missing required LOCAL_API_URL.",
    );
  });
});
