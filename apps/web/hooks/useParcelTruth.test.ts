import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useParcelTruth } from "./useParcelTruth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useParcelTruth", () => {
  it("returns null truth when no params provided", async () => {
    const { result } = renderHook(() => useParcelTruth(null));

    // With no URL, SWR won't fetch at all — isLoading stays false
    expect(result.current.found).toBe(false);
    expect(result.current.truth).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches by propertyDbId", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ found: false }));

    const { result } = renderHook(() =>
      useParcelTruth({ propertyDbId: "test-123" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/entities/lookup?parcel_id=test-123",
    );
  });

  it("falls back to parcelId when no propertyDbId", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ found: false }));

    const { result } = renderHook(() => useParcelTruth({ parcelId: "456" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/entities/lookup?parcel_id=456",
    );
  });

  it("falls back to address when no parcelId or propertyDbId", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ found: false }));

    const { result } = renderHook(() =>
      useParcelTruth({ address: "123 Main St" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/entities/lookup?address=123%20Main%20St",
    );
  });

  it("returns truth when found: true", async () => {
    const truth = {
      currentValues: {
        "comp.sale_price": {
          value: 1_200_000,
          source: "agent",
          verifiedAt: "2026-01-01T00:00:00Z",
        },
      },
      openConflicts: [],
      corrections: [],
    };
    fetchMock.mockResolvedValue(
      makeJsonResponse({ found: true, entityId: "eid-1", truth }),
    );

    const { result } = renderHook(() =>
      useParcelTruth({ propertyDbId: "found-parcel" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.found).toBe(true);
    expect(result.current.truth).toEqual(truth);
    expect(result.current.entityId).toBe("eid-1");
  });

  it("returns null truth when found: false", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ found: false }));

    const { result } = renderHook(() =>
      useParcelTruth({ propertyDbId: "not-found-parcel" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.found).toBe(false);
    expect(result.current.truth).toBeNull();
  });

  it("gracefully handles 401 — returns found: false without throwing", async () => {
    // The fetcher short-circuits on 401: return { found: false }
    fetchMock.mockResolvedValue(makeJsonResponse({}, 401));

    const { result } = renderHook(() =>
      useParcelTruth({ propertyDbId: "auth-fail-parcel" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.found).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it("calls mutate on gpc:memory-updated event — SWR revalidation is triggered", async () => {
    // Use a unique key to avoid deduplication with other tests
    const parcelId = `mutate-test-parcel-${Date.now()}`;

    fetchMock
      .mockResolvedValueOnce(makeJsonResponse({ found: false }))
      .mockResolvedValue(
        makeJsonResponse({ found: true, entityId: "eid-after-event" }),
      );

    const { result } = renderHook(() =>
      useParcelTruth({ propertyDbId: parcelId }),
    );

    // Wait for initial load
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Dispatch the custom event — the hook should call mutate() which triggers revalidation
    await act(async () => {
      window.dispatchEvent(new CustomEvent("gpc:memory-updated"));
    });

    // SWR should revalidate — fetch should be called again
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.found).toBe(true));
    expect(result.current.entityId).toBe("eid-after-event");
  });
});
