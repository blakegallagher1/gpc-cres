import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useParcelGeometry } from "./useParcelGeometry";

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
    });

    unmount();
  });
});
