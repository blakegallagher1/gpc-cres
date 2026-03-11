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
      selectedParcelIds: ["parcel-1"],
      viewportLabel: "Downtown Baton Rouge",
      referencedFeatures: [
        {
          parcelId: "parcel-1",
          address: "123 Main St",
          zoningType: "C2",
        },
      ],
    });

    expect(input).toEqual({
      center: { lat: 30.4515, lng: -91.1871 },
      zoom: 14.25,
      selectedParcelIds: ["parcel-1"],
      viewportLabel: "Downtown Baton Rouge",
      referencedFeatures: [
        {
          parcelId: "parcel-1",
          address: "123 Main St",
          zoning: "C2",
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
