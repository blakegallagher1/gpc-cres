import { describe, it, expect } from "vitest";
import { matchRoute } from "../src/routes";

describe("matchRoute", () => {
  describe("GET /parcels/search", () => {
    it("matches and maps to GET /api/parcels/search with query params", () => {
      const params = new URLSearchParams({ q: "Airline Hwy", limit: "10" });
      const route = matchRoute("/parcels/search", "GET", params);
      expect(route).not.toBeNull();
      expect(route!.upstreamMethod).toBe("GET");
      expect(route!.upstreamPath).toContain("/api/parcels/search?");
      expect(route!.upstreamPath).toContain("q=Airline");
      expect(route!.upstreamPath).toContain("limit=10");
    });

    it("passes through empty params", () => {
      const route = matchRoute("/parcels/search", "GET", new URLSearchParams());
      expect(route).not.toBeNull();
      expect(route!.upstreamPath).toBe("/api/parcels/search");
    });
  });

  describe("GET /parcels/:id", () => {
    it("matches and maps to POST /tools/parcel.lookup", () => {
      const route = matchRoute("/parcels/ABC-123", "GET");
      expect(route).not.toBeNull();
      expect(route!.upstreamMethod).toBe("POST");
      expect(route!.upstreamPath).toBe("/tools/parcel.lookup");
    });

    it("passes parcel_id in body", () => {
      const route = matchRoute("/parcels/E001234", "GET");
      const body = route!.buildBody!(new URLSearchParams());
      expect(body).toEqual({ parcel_id: "E001234" });
    });

    it("decodes URL-encoded parcel IDs", () => {
      const route = matchRoute("/parcels/A%2FB", "GET");
      const body = route!.buildBody!(new URLSearchParams());
      expect(body).toEqual({ parcel_id: "A/B" });
    });
  });

  describe("POST /parcels/sql", () => {
    it("matches and maps to POST /tools/parcels.sql", () => {
      const route = matchRoute("/parcels/sql", "POST");
      expect(route).not.toBeNull();
      expect(route!.upstreamPath).toBe("/tools/parcels.sql");
    });

    it("does not match GET", () => {
      expect(matchRoute("/parcels/sql", "GET")).toBeNull();
    });
  });

  describe("GET /screening/:type/:parcelId", () => {
    it("matches flood screening", () => {
      const route = matchRoute("/screening/flood/ABC-123", "GET");
      expect(route).not.toBeNull();
      expect(route!.upstreamPath).toBe("/api/screening/flood");
    });

    it("matches soils screening", () => {
      const route = matchRoute("/screening/soils/ABC-123", "GET");
      expect(route!.upstreamPath).toBe("/api/screening/soils");
    });

    it("passes parcelId in body", () => {
      const route = matchRoute("/screening/flood/P-123", "GET");
      const body = route!.buildBody!(new URLSearchParams());
      expect(body).toEqual({ parcelId: "P-123" });
    });

    it("passes radiusMiles through when present", () => {
      const route = matchRoute(
        "/screening/traffic/P-123",
        "GET",
        new URLSearchParams({ radiusMiles: "0.5" }),
      );
      const body = route!.buildBody!(new URLSearchParams({ radiusMiles: "0.5" }));
      expect(route!.upstreamPath).toBe("/api/screening/traffic");
      expect(body).toEqual({ parcelId: "P-123", radiusMiles: 0.5 });
    });

    it("does not match GET /screening/full/:id (separate route)", () => {
      expect(matchRoute("/screening/full/ABC-123", "GET")).toBeNull();
    });
  });

  describe("POST /screening/full/:parcelId", () => {
    it("matches and maps to POST /api/screening/full", () => {
      const route = matchRoute("/screening/full/ABC-123", "POST");
      expect(route).not.toBeNull();
      expect(route!.upstreamPath).toBe("/api/screening/full");
    });

    it("passes parcelId in body", () => {
      const route = matchRoute("/screening/full/P-999", "POST");
      const body = route!.buildBody!(new URLSearchParams());
      expect(body).toEqual({ parcelId: "P-999" });
    });
  });

  describe("unknown routes", () => {
    it("returns null for unknown paths", () => {
      expect(matchRoute("/unknown", "GET")).toBeNull();
    });

    it("returns null for wrong method on known path", () => {
      expect(matchRoute("/parcels/search", "DELETE")).toBeNull();
    });

    it("returns null for root path", () => {
      expect(matchRoute("/", "GET")).toBeNull();
    });
  });
});
