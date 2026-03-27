import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeGeometryLoad, useParcelGeometry } from "./useParcelGeometry";

const fetchMock = vi.fn();

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useParcelGeometry", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks missing geometry rows as unavailable instead of treating them as upstream failures", async () => {
    fetchMock.mockResolvedValue(
      makeJsonResponse(
        {
          ok: false,
          request_id: "req-geometry-missing",
          error: {
            code: "GEOMETRY_UNAVAILABLE",
            message: "Parcel geometry unavailable",
          },
        },
        404,
      ),
    );

    const { result, unmount } = renderHook(() =>
      useParcelGeometry(
        [
          {
            id: "parcel-1",
            lat: 30.45,
            lng: -91.18,
            propertyDbId: "000028d9-4de7-467a-b904-64238e593b34",
          },
        ],
        1,
        null,
      ),
    );

    await waitFor(() => {
      expect(result.current.health.geometryUnavailable).toBe(true);
      expect(result.current.health.upstreamError).toBe(false);
      expect(result.current.health.lastErrorCode).toBe("GEOMETRY_UNAVAILABLE");
      expect(result.current.health.lastRequestId).toBe("req-geometry-missing");
      expect(result.current.health.failedCount).toBeGreaterThan(0);
      expect(result.current.loading).toBe(false);
      expect(result.current.summary.status).toBe("unavailable");
      expect(result.current.summary.unavailableCount).toBe(1);
    });

    unmount();
  });

  it("reports a partial summary when some parcel geometries resolve and others do not", () => {
    const summary = summarizeGeometryLoad({
      visibleCandidates: [
        { id: "parcel-1", lookupKey: "parcel-1" },
        { id: "parcel-2", lookupKey: "parcel-2" },
      ],
      geometries: new Map([
        [
          "parcel-1",
          {
            geometry: { type: "Polygon", coordinates: [] },
            bbox: [-91.2, 30.4, -91.1, 30.5],
            area_sqft: 43560,
          },
        ],
      ]),
      geometryCacheKeys: new Set(["parcel-1"]),
      unavailableLookupKeys: new Set(["parcel-2"]),
      failedLookupKeys: new Set(),
      loading: false,
    });

    expect(summary).toEqual({
      status: "partial",
      requestedCount: 2,
      loadedCount: 1,
      unavailableCount: 1,
      pendingCount: 0,
    });
  });

  it("reports a ready summary once visible parcel shapes are loaded", () => {
    const summary = summarizeGeometryLoad({
      visibleCandidates: [{ id: "parcel-1", lookupKey: "parcel-1" }],
      geometries: new Map([
        [
          "parcel-1",
          {
            geometry: { type: "Polygon", coordinates: [] },
            bbox: [-91.2, 30.4, -91.1, 30.5],
            area_sqft: 43560,
          },
        ],
      ]),
      geometryCacheKeys: new Set(["parcel-1"]),
      unavailableLookupKeys: new Set(),
      failedLookupKeys: new Set(),
      loading: false,
    });

    expect(summary.status).toBe("ready");
    expect(summary.loadedCount).toBe(1);
    expect(summary.unavailableCount).toBe(0);
  });
});
