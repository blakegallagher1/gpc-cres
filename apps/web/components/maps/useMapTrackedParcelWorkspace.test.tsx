import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMapTrackedParcelWorkspace } from "./useMapTrackedParcelWorkspace";
import type { MapParcel } from "./types";

const fetchMock = vi.fn();

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const activeParcels: MapParcel[] = [
  {
    id: "PROPERTY1",
    parcelId: "parcel-1",
    address: "123 Main St",
    lat: 30.45,
    lng: -91.18,
    acreage: 1.5,
    currentZoning: "C2",
    floodZone: "X",
  },
];

describe("useMapTrackedParcelWorkspace", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("persists canonical parcel ids and strips non-uuid ai output ids", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        workspace: {
          id: "workspace-1",
          trackedParcels: [],
        },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        workspace: {
          id: "workspace-1",
          trackedParcels: [
            {
              parcelId: "parcel-1",
              address: "123 Main St",
              lat: 30.45,
              lng: -91.18,
              acreage: 1.5,
              currentZoning: "C2",
              floodZone: "X",
              note: "Frontage first",
              task: "Call broker",
              status: "active",
              createdAt: "2026-03-31T18:00:00.000Z",
              updatedAt: "2026-03-31T18:00:00.000Z",
            },
          ],
        },
      }),
    );

    const { result } = renderHook(() =>
      useMapTrackedParcelWorkspace({
        activeParcels,
        selectedParcelIds: ["PROPERTY1"],
        polygon: null,
        aiOutputs: [
          {
            id: "card-1",
            title: "Assemblage summary",
            createdAt: "2026-03-31T18:00:00.000Z",
            summary: "AI summary",
          },
        ],
        activeOverlayKeys: ["zoning"],
      }),
    );

    await waitFor(() => {
      expect(result.current.trackedParcelsHydrated).toBe(true);
    });

    act(() => {
      result.current.saveTrackedSelection({
        note: "Frontage first",
        task: "Call broker",
        status: "active",
      });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.current.trackedParcels[0]?.parcelId).toBe("parcel-1");
    });

    const requestInit = fetchMock.mock.calls[1]?.[1];
    expect(requestInit).toBeDefined();

    const requestBody = JSON.parse(String(requestInit?.body)) as {
      selectedParcelIds: string[];
      trackedParcels: Array<{ parcelId: string }>;
      workspaceParcels: Array<{ parcelId: string }>;
      aiOutputs: Array<{ id?: string; title: string }>;
    };

    expect(requestBody.selectedParcelIds).toEqual(["parcel-1"]);
    expect(requestBody.trackedParcels[0]?.parcelId).toBe("parcel-1");
    expect(requestBody.workspaceParcels[0]?.parcelId).toBe("parcel-1");
    expect(requestBody.aiOutputs[0]).toEqual({
      title: "Assemblage summary",
      createdAt: "2026-03-31T18:00:00.000Z",
      summary: "AI summary",
      payload: {},
    });
  });
});
