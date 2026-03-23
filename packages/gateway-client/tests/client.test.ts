import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatewayClient } from "../src/client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

describe("GatewayClient", () => {
  let client: GatewayClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GatewayClient({
      baseUrl: "https://gateway.gallagherpropco.com",
      token: "test-token",
    });
  });

  it("sends auth header on every request", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: [], source: "gateway", staleness_seconds: null }));
    await client.searchParcels({ address: "Main St" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/parcels/search"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
  });

  it("searchParcels builds query string", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: [{ id: 1 }], source: "gateway", staleness_seconds: null }));
    const result = await client.searchParcels({ address: "Airline Hwy", limit: 5 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("address=Airline+Hwy"),
      expect.anything()
    );
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it("getParcel encodes parcel ID", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: { id: "A/B" }, source: "gateway", staleness_seconds: null }));
    await client.getParcel("A/B");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/parcels/A%2FB"),
      expect.anything()
    );
  });

  it("screen routes to correct type endpoint", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: {}, source: "d1-cache", staleness_seconds: 120 }));
    const result = await client.screen("P-123", "flood");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/screening/flood/P-123"),
      expect.anything()
    );
    expect(result.source).toBe("d1-cache");
  });

  it("sql sends POST with query body", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: [{ count: 5 }], source: "gateway", staleness_seconds: null }));
    await client.sql("SELECT COUNT(*) FROM ebr_parcels");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/parcels/sql"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sql: "SELECT COUNT(*) FROM ebr_parcels" }),
      })
    );
  });

  it("returns error on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    const result = await client.searchParcels({ address: "test" });
    expect(result.error).toBe("network error");
    expect(result.data).toBeNull();
  });

  it("returns error on HTTP error", async () => {
    mockFetch.mockResolvedValue(mockResponse({ error: "unauthorized", source: "gateway", staleness_seconds: null }, 401));
    const result = await client.searchParcels({ address: "test" });
    expect(result.error).toBe("unauthorized");
  });

  it("screenFull sends POST", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: { flood: {} }, source: "gateway", staleness_seconds: null }));
    await client.screenFull("P-123");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/screening/full/P-123"),
      expect.objectContaining({ method: "POST" })
    );
  });
});
