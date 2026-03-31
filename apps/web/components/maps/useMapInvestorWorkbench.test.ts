import { describe, expect, it } from "vitest";
import type { MapTrackedParcel } from "./mapOperatorNotebook";
import type { MapParcel } from "./types";
import {
  buildEmptyAssemblageSnapshot,
  buildEmptyWorkspaceSnapshot,
  buildFallbackAssemblageSnapshot,
  buildFallbackWorkspaceSnapshot,
} from "./useMapInvestorWorkbench";

const parcels: MapParcel[] = [
  {
    id: "parcel-1",
    parcelId: "parcel-1",
    address: "123 Main St",
    lat: 30.45,
    lng: -91.18,
    acreage: 1.4,
    currentZoning: "C2",
    owner: "Riverfront Holdings LLC",
  },
  {
    id: "parcel-2",
    parcelId: "parcel-2",
    address: "127 Main St",
    lat: 30.4504,
    lng: -91.1802,
    acreage: 2.1,
    currentZoning: "C2",
    owner: "Riverfront Holdings LLC",
  },
];

const trackedParcels: MapTrackedParcel[] = [
  {
    parcelId: "parcel-1",
    address: "123 Main St",
    lat: 30.45,
    lng: -91.18,
    acreage: 1.4,
    currentZoning: "C2",
    floodZone: "X",
    note: "Frontage appears strong.",
    task: "Call broker",
    status: "active",
    createdAt: "2026-03-30T10:00:00.000Z",
    updatedAt: "2026-03-30T11:00:00.000Z",
  },
];

describe("useMapInvestorWorkbench builders", () => {
  it("builds a fallback workspace summary from tracked and selected context", () => {
    const snapshot = buildFallbackWorkspaceSnapshot({
      trackedParcels,
      selectedParcels: [parcels[0]],
      polygon: [[[-91.18, 30.45]]],
      resultCount: 3,
    });

    expect(snapshot.status.kind).toBe("fallback");
    expect(snapshot.selectedCount).toBe(1);
    expect(snapshot.trackedCount).toBe(1);
    expect(snapshot.geofenceCount).toBe(1);
    expect(snapshot.aiInsightCount).toBe(3);
  });

  it("scores owner concentration in the fallback assemblage view", () => {
    const snapshot = buildFallbackAssemblageSnapshot(parcels);

    expect(snapshot.status.kind).toBe("fallback");
    expect(snapshot.adjacencyEdgeCount).toBeGreaterThan(0);
    expect(snapshot.bestCandidate?.label).toBe("Riverfront Holdings LLC");
    expect(snapshot.bestCandidate?.parcelCount).toBe(2);
  });

  it("returns empty resource states when no map context exists", () => {
    expect(buildEmptyWorkspaceSnapshot().status.kind).toBe("empty");
    expect(buildEmptyAssemblageSnapshot().status.kind).toBe("empty");
  });
});
