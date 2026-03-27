import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCloudflareAccessHeadersFromEnvMock } = vi.hoisted(() => ({
  getCloudflareAccessHeadersFromEnvMock: vi.fn(),
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  getCloudflareAccessHeadersFromEnv: getCloudflareAccessHeadersFromEnvMock,
}));

import { GET } from "./route";

describe("GET /api/map/zoning-tiles/[z]/[x]/[y]", () => {
  const fetchMock = vi.fn();
  const priorEnv = {
    localApiUrl: process.env.LOCAL_API_URL,
    localApiKey: process.env.LOCAL_API_KEY,
  };

  beforeEach(() => {
    getCloudflareAccessHeadersFromEnvMock.mockReset();
    getCloudflareAccessHeadersFromEnvMock.mockReturnValue({
      "CF-Access-Client-Id": "client-id",
      "CF-Access-Client-Secret": "client-secret",
    });
    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "test-key";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env.LOCAL_API_URL = priorEnv.localApiUrl;
    process.env.LOCAL_API_KEY = priorEnv.localApiKey;
  });

  it("returns 400 for malformed coordinates", async () => {
    const res = await GET(new Request("http://localhost/api/map/zoning-tiles/not/a/number"), {
      params: Promise.resolve({ z: "abc", x: "0", y: "0" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid tile coordinates" });
  });

  it("returns 503 when local API config is unavailable", async () => {
    process.env.LOCAL_API_URL = "";
    process.env.LOCAL_API_KEY = "";

    const res = await GET(new Request("http://localhost/api/map/zoning-tiles/1/0/0"), {
      params: Promise.resolve({ z: "1", x: "0", y: "0" }),
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Local API not configured" });
  });

  it("proxies gateway zoning tiles with auth headers by default", async () => {
    const tilePayload = new Uint8Array([1, 2, 3]).buffer;
    fetchMock.mockResolvedValue(new Response(tilePayload, { status: 200 }));

    const res = await GET(new Request("http://localhost/api/map/zoning-tiles/2/1/2"), {
      params: Promise.resolve({ z: "2", x: "1", y: "2" }),
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gallagherpropco.com/tiles/zoning/2/1/2.pbf",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "CF-Access-Client-Id": "client-id",
          "CF-Access-Client-Secret": "client-secret",
        }),
      }),
    );
  });
});
