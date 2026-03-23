import { describe, expect, it } from "vitest";

import {
  extractNlQueryFinalText,
  extractNlQueryRows,
  extractNlQueryTextDelta,
} from "./nlQueryStream";

describe("nlQueryStream", () => {
  it("reads text_delta events from the emitted content field", () => {
    expect(
      extractNlQueryTextDelta({
        type: "text_delta",
        content: "There are ",
      }),
    ).toBe("There are ");
  });

  it("reads finalized assistant text events", () => {
    expect(
      extractNlQueryFinalText({
        type: "response_text_done",
        text: "There are 11,936 C2 parcels.",
      }),
    ).toBe("There are 11,936 C2 parcels.");
  });

  it("extracts rows from SQL tool payloads", () => {
    expect(
      extractNlQueryRows({
        type: "tool_end",
        result: JSON.stringify({
          rowCount: 1,
          rows: [{ zoning_type: "C2", cnt: 11936 }],
        }),
      }),
    ).toEqual({
      rowCount: 1,
      rows: [{ zoning_type: "C2", cnt: 11936 }],
    });
  });

  it("extracts rows from wrapped structured-tool payloads", () => {
    expect(
      extractNlQueryRows({
        type: "tool_end",
        result: JSON.stringify({
          text: JSON.stringify([
            { parcel_id: "001", address: "123 Main St", acres: 5.2 },
          ]),
          __mapFeatures: [{ parcelId: "001", address: "123 Main St" }],
        }),
      }),
    ).toEqual({
      rowCount: 1,
      rows: [{ parcel_id: "001", address: "123 Main St", acres: 5.2 }],
    });
  });
});
