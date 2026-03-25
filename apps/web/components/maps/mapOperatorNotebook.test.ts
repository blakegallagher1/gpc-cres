import { describe, expect, it } from "vitest";
import {
  summarizeTrackedParcels,
  syncTrackedParcelsWithVisible,
  upsertTrackedParcels,
  updateTrackedParcel,
  type MapTrackedParcel,
} from "./mapOperatorNotebook";
import type { MapParcel } from "./types";

const baseParcel: MapParcel = {
  id: "parcel-1",
  address: "123 Main St",
  lat: 30.45,
  lng: -91.18,
  acreage: 1.25,
  currentZoning: "C2",
  floodZone: "X",
};

const trackedEntry: MapTrackedParcel = {
  parcelId: "parcel-1",
  address: "123 Main St",
  lat: 30.45,
  lng: -91.18,
  acreage: 1.25,
  currentZoning: "C2",
  floodZone: "X",
  note: "Verify frontage.",
  task: "Call broker",
  status: "active",
  createdAt: "2026-03-25T20:00:00.000Z",
  updatedAt: "2026-03-25T20:00:00.000Z",
};

describe("mapOperatorNotebook", () => {
  it("upserts tracked parcels while preserving prior note content when the new draft omits it", () => {
    const created = upsertTrackedParcels(
      [],
      [baseParcel],
      {
        note: "Initial note",
        task: "Open county GIS",
        status: "to_analyze",
      },
      new Date("2026-03-25T21:00:00.000Z"),
    );

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      parcelId: "parcel-1",
      note: "Initial note",
      task: "Open county GIS",
      status: "to_analyze",
    });

    const updated = upsertTrackedParcels(
      created,
      [{ ...baseParcel, address: "123 Main Street" }],
      {
        note: "",
        task: "",
        status: "active",
      },
      new Date("2026-03-25T22:00:00.000Z"),
    );

    expect(updated[0]).toMatchObject({
      address: "123 Main Street",
      note: "Initial note",
      task: "Open county GIS",
      status: "active",
    });
  });

  it("syncs visible parcel metadata and summarizes task counts", () => {
    const synced = syncTrackedParcelsWithVisible(
      [
        trackedEntry,
        {
          ...trackedEntry,
          parcelId: "parcel-2",
          address: "456 River Rd",
          task: "Screen parcel",
          note: "",
          status: "blocked",
        },
        {
          ...trackedEntry,
          parcelId: "parcel-3",
          address: "789 Elm St",
          task: "Archive",
          note: "",
          status: "complete",
        },
      ],
      [{ ...baseParcel, address: "123 Main Street", acreage: 2.5 }],
    );

    expect(synced[0]).toMatchObject({
      address: "123 Main Street",
      acreage: 2.5,
    });

    const reopened = updateTrackedParcel(
      synced,
      "parcel-3",
      { status: "active" },
      new Date("2026-03-25T23:00:00.000Z"),
    );

    expect(summarizeTrackedParcels(reopened)).toEqual({
      totalCount: 3,
      openCount: 3,
      blockedCount: 1,
      activeCount: 2,
      completeCount: 0,
    });
  });
});
