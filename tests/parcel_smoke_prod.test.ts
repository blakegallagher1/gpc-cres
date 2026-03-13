import { describe, expect, it } from "vitest";

import {
  extractCandidateParcelId,
  isParcelEnvelope,
} from "../scripts/parcels/smoke_map_parcel_prod.ts";

describe("parcel smoke helpers", () => {
  it("accepts an empty parcel envelope as a structurally valid prospect response", () => {
    expect(isParcelEnvelope({ parcels: [], total: 0 })).toBe(true);
  });

  it("extracts a candidate parcel id across mixed payload shapes", () => {
    const parcelId = extractCandidateParcelId([
      { parcels: [] },
      {
        parcels: [
          { propertyDbId: "" },
          { parcelUid: "007-3904-9" },
        ],
      },
      {
        parcels: [{ id: "fallback-id" }],
      },
    ]);

    expect(parcelId).toBe("007-3904-9");
  });
});
