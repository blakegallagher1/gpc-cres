import { describe, expect, it } from "vitest";

import { buildMapActionEventsFromToolResult } from "./mapActionEvents";

describe("buildMapActionEventsFromToolResult", () => {
  it("emits explicit __mapAction payloads even when no map features are present", () => {
    expect(
      buildMapActionEventsFromToolResult(
        "compute_drive_time_area",
        JSON.stringify({
          text: "Generated drive-time polygon",
          __mapAction: {
            action: "addLayer",
            layerId: "isochrone-1",
            geojson: { type: "FeatureCollection", features: [] },
            label: "10-minute drive time",
          },
        }),
        "call-1",
      ),
    ).toEqual([
      {
        type: "map_action",
        payload: {
          action: "addLayer",
          layerId: "isochrone-1",
          geojson: { type: "FeatureCollection", features: [] },
          label: "10-minute drive time",
        },
        toolCallId: "call-1",
      },
    ]);
  });

  it("emits highlight and flyTo actions from parcel features", () => {
    expect(
      buildMapActionEventsFromToolResult(
        "query_property_db_sql",
        JSON.stringify({
          text: "Found 1 parcel",
          __mapFeatures: [
            {
              parcelId: "001",
              address: "123 Main St",
              center: { lat: 30.45, lng: -91.18 },
            },
          ],
        }),
        "call-2",
      ),
    ).toEqual([
      {
        type: "map_action",
        payload: {
          action: "highlight",
          parcelIds: ["001"],
          style: "pulse",
          durationMs: 0,
        },
        toolCallId: "call-2",
      },
      {
        type: "map_action",
        payload: {
          action: "flyTo",
          center: [-91.18, 30.45],
          zoom: 17,
          parcelId: "001",
        },
        toolCallId: "call-2",
      },
    ]);
  });
});
