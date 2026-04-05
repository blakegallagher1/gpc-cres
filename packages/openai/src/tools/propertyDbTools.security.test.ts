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

  it("resolves zoning COUNT queries through parcel.search", async () => {
    process.env.LOCAL_API_URL = "https://api.example.com";
    process.env.LOCAL_API_KEY = "local-api-key";
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, count: 11936 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { queryPropertyDbSql } = await import("./propertyDbTools");
    const queryPropertyDbSqlTool = queryPropertyDbSql as unknown as {
      execute: (params: { sql: string }) => Promise<unknown>;
    };
    const output = await queryPropertyDbSqlTool.execute({
      sql: "SELECT zoning_type, COUNT(*) AS cnt FROM ebr_parcels WHERE zoning_type = 'C2' GROUP BY zoning_type",
    });
    const parsed = JSON.parse(output as string) as {
      rowCount: number;
      rows: Array<{ zoning_type: string; cnt: number }>;
      fallback?: string;
    };

    expect(parsed.rowCount).toBe(1);
    expect(parsed.rows[0]).toEqual({ zoning_type: "C2", cnt: 11936 });
    expect(parsed.fallback).toBe("parcel_search_count");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/tools/parcel.search");
  });

  it("returns tiered parish verification with verified rows ranked first", async () => {
    process.env.LOCAL_API_URL = "https://api.example.com";
    process.env.LOCAL_API_KEY = "local-api-key";
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { sql?: string };
      const sql = body.sql ?? "";

      if (sql.includes("SELECT parcel_id, address FROM ebr_parcels")) {
        return {
          ok: true,
          json: async () => ({
            rowCount: 2,
            rows: [
              { parcel_id: "p1", address: "100 A St" },
              { parcel_id: "p2", address: "200 B St" },
            ],
          }),
        } as Response;
      }

      if (sql.includes("JOIN fema_flood r ON ST_Intersects(e.geom, r.geom)")) {
        return {
          ok: true,
          json: async () => ({
            rowCount: 1,
            rows: [{ parcel_id: "p1" }],
          }),
        } as Response;
      }

      if (sql.includes("JOIN zcta z") || sql.includes("FROM zcta z")) {
        if (sql.includes("JOIN fema_flood r ON ST_Intersects(z.geom, r.geom)")) {
          return {
            ok: true,
            json: async () => ({ rowCount: 1, rows: [{ zip: "70726" }] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ rowCount: 0, rows: [] }),
        } as Response;
      }

      if (sql.includes("SELECT parcel_id, zip FROM ebr_parcels")) {
        return {
          ok: true,
          json: async () => ({
            rowCount: 2,
            rows: [
              { parcel_id: "p1", zip: "70706" },
              { parcel_id: "p2", zip: "70726" },
            ],
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ rowCount: 0, rows: [] }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { queryPropertyDbSql } = await import("./propertyDbTools");
    const queryPropertyDbSqlTool = queryPropertyDbSql as unknown as {
      execute: (params: { sql: string }) => Promise<unknown>;
    };
    const output = await queryPropertyDbSqlTool.execute({
      sql: "SELECT parcel_id, address FROM ebr_parcels WHERE 'Livingston Parish' IS NOT NULL LIMIT 20",
    });
    const parsed = JSON.parse(output as string) as {
      rowCount: number;
      rows: Array<{ parcel_id: string; verification_tier: string; parish_verified: boolean }>;
      rows_probable: Array<{ parcel_id: string; verification_tier: string; parish_verified: boolean }>;
      rows_unknown: Array<{ parcel_id: string; verification_tier: string; parish_verified: boolean }>;
      requestedParish: string | null;
      verification?: { rankingRule?: string };
    };

    expect(parsed.rowCount).toBe(1);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      parcel_id: "p1",
      verification_tier: "verified",
      parish_verified: true,
    });
    expect(parsed.rows_probable).toHaveLength(1);
    expect(parsed.rows_probable[0]).toMatchObject({
      parcel_id: "p2",
      verification_tier: "probable",
      parish_verified: false,
    });
    expect(parsed.rows_unknown).toHaveLength(0);
    expect(parsed.requestedParish).toBe("Livingston");
    expect(parsed.verification?.rankingRule).toBe("rank_verified_only");
    expect(fetchMock).toHaveBeenCalled();
  });
});
