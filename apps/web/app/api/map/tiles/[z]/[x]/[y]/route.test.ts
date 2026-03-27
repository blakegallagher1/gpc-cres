import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCloudflareAccessHeadersFromEnvMock } = vi.hoisted(() => ({
  getCloudflareAccessHeadersFromEnvMock: vi.fn(),
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  getCloudflareAccessHeadersFromEnv: getCloudflareAccessHeadersFromEnvMock,
}));

import { GET } from "./route";

describe("GET /api/map/tiles/[z]/[x]/[y]", () => {
  const fetchMock = vi.fn();
  const priorEnv = {
    localApiUrl: process.env.LOCAL_API_URL,
    localApiKey: process.env.LOCAL_API_KEY,
    tileServerUrl: process.env.TILE_SERVER_URL,
    tileLayerName: process.env.TILE_LAYER_NAME,
  };

  beforeEach(() => {
    getCloudflareAccessHeadersFromEnvMock.mockReset();
    getCloudflareAccessHeadersFromEnvMock.mockReturnValue({
      "CF-Access-Client-Id": "client-id",
      "CF-Access-Client-Secret": "client-secret",
    });
    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "test-key";
    delete process.env.TILE_SERVER_URL;
    delete process.env.TILE_LAYER_NAME;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env.LOCAL_API_URL = priorEnv.localApiUrl;
    process.env.LOCAL_API_KEY = priorEnv.localApiKey;
    process.env.TILE_SERVER_URL = priorEnv.tileServerUrl;
    process.env.TILE_LAYER_NAME = priorEnv.tileLayerName;
  });

  it("returns 400 for malformed coordinates", async () => {
    const res = await GET(new Request("http://localhost/api/map/tiles/not/a/number"), {
      params: Promise.resolve({ z: "abc", x: "0", y: "0" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid tile coordinates" });
  });

  it("returns 503 when local API config is unavailable", async () => {
    process.env.LOCAL_API_URL = "";
    process.env.LOCAL_API_KEY = "";

    const res = await GET(new Request("http://localhost/api/map/tiles/1/0/0"), {
      params: Promise.resolve({ z: "1", x: "0", y: "0" }),
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Local API not configured" });
  });

  it("returns 204 when the tile backend has no data", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const res = await GET(new Request("http://localhost/api/map/tiles/1/0/0"), {
      params: Promise.resolve({ z: "1", x: "0", y: "0" }),
    });

    expect(res.status).toBe(204);
    expect((await res.arrayBuffer()).byteLength).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://tiles.gallagherpropco.com/ebr_parcels/1/0/0",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "CF-Access-Client-Id": "client-id",
        }),
      }),
    );
  });

  it("returns proxy response and content headers for tiles", async () => {
    const tilePayload = new Uint8Array([1, 2, 3]).buffer;
    const headers = new Headers({
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private",
    });
    fetchMock.mockResolvedValue(new Response(tilePayload, { status: 200, headers }));

    const res = await GET(new Request("http://localhost/api/map/tiles/2/1/2"), {
      params: Promise.resolve({ z: "2", x: "1", y: "2" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.mapbox-vector-tile");
    expect(res.headers.get("Content-Length")).toBe("3");
    const body = await res.arrayBuffer();
    expect(new Uint8Array(body)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
