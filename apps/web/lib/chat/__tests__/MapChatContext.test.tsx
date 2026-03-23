import { describe, expect, it } from "vitest";

import {
  buildMapContextInput,
  initialMapChatState,
  mapChatReducer,
} from "../MapChatContext";

describe("MapChatContext", () => {
  it("serializes shared map state into API-safe map context input", () => {
    const input = buildMapContextInput({
      ...initialMapChatState,
      center: [-91.1871, 30.4515],
      zoom: 14.25,
      viewportBounds: {
        west: -91.21,
        south: 30.43,
        east: -91.16,
        north: 30.47,
      },
      selectedParcelIds: ["parcel-1"],
      selectedParcelFeatures: [
        {
          parcelId: "parcel-1",
          address: "123 Main St",
          zoningType: "C2",
          acres: 2.5,
          center: { lat: 30.4515, lng: -91.1871 },
        },
      ],
      viewportLabel: "Downtown Baton Rouge",
      spatialSelection: {
        kind: "polygon",
        coordinates: [[
          [-91.2, 30.44],
          [-91.18, 30.44],
          [-91.18, 30.46],
          [-91.2, 30.46],
          [-91.2, 30.44],
        ]],
        parcelIds: ["parcel-1"],
        label: "Polygon search extent",
      },
      referencedFeatures: [
        {
          parcelId: "parcel-1",
          address: "123 Main St",
          zoningType: "C2",
          owner: "Owner",
          acres: 2.5,
          center: { lat: 30.4515, lng: -91.1871 },
        },
      ],
    });

    expect(input).toEqual({
      center: { lat: 30.4515, lng: -91.1871 },
      zoom: 14.25,
      viewportBounds: {
        west: -91.21,
        south: 30.43,
        east: -91.16,
        north: 30.47,
      },
      selectedParcelIds: ["parcel-1"],
      selectedParcels: [
        {
          parcelId: "parcel-1",
          address: "123 Main St",
          zoning: "C2",
          acres: 2.5,
          center: { lat: 30.4515, lng: -91.1871 },
        },
      ],
      viewportLabel: "Downtown Baton Rouge",
      spatialSelection: {
        kind: "polygon",
        coordinates: [[
          [-91.2, 30.44],
          [-91.18, 30.44],
          [-91.18, 30.46],
          [-91.2, 30.46],
          [-91.2, 30.44],
        ]],
        parcelIds: ["parcel-1"],
        label: "Polygon search extent",
        bbox: {
          west: -91.2,
          south: 30.44,
          east: -91.18,
          north: 30.46,
        },
      },
      referencedFeatures: [
        {
          parcelId: "parcel-1",
          address: "123 Main St",
          zoning: "C2",
          owner: "Owner",
          acres: 2.5,
          center: { lat: 30.4515, lng: -91.1871 },
        },
      ],
    });
  });

  it("returns undefined when the shared map state is empty", () => {
    expect(buildMapContextInput(initialMapChatState)).toBeUndefined();
  });

  it("deduplicates referenced features by parcel id when merging", () => {
    const nextState = mapChatReducer(initialMapChatState, {
      type: "ADD_REFERENCED_FEATURES",
      features: [
        { parcelId: "parcel-1", label: "Parcel One" },
        { parcelId: "parcel-1", label: "Parcel One Duplicate" },
        { parcelId: "parcel-2", label: "Parcel Two" },
      ],
    });

    expect(nextState.referencedFeatures).toEqual([
      { parcelId: "parcel-1", label: "Parcel One" },
      { parcelId: "parcel-2", label: "Parcel Two" },
    ]);
  });
});
