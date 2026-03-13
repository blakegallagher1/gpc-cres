import { describe, expect, it } from "vitest";

import {
  assessStorePropertyFindingPayload,
  assessSemanticRecallPayload,
  extractParcelIds,
  extractSmokeParcels,
  unwrapToolExecuteResult,
} from "../scripts/smoke_endpoints.ts";

describe("smoke_endpoints semantic recall parsing", () => {
  it("extracts semantic seed parcels from route payloads", () => {
    const parcels = extractSmokeParcels({
      parcels: [
        {
          propertyDbId: "308-4646-1",
          address: "9001 CORTANA PLACE",
          parish: "EBR",
          zoning: "CW3",
          acreage: 97.13,
        },
        {
          id: "",
          address: "Missing Parcel Id",
          parish: "EBR",
        },
      ],
    });

    expect(parcels).toEqual([
      {
        parcelId: "308-4646-1",
        address: "9001 CORTANA PLACE",
        parish: "EBR",
        zoning: "CW3",
        acreage: 97.13,
      },
    ]);
  });

  it("extracts generic parcel ids even when parish metadata is absent", () => {
    const parcelIds = extractParcelIds({
      parcels: [
        { propertyDbId: "ext-1", address: "4416 HEATH DR" },
        { id: "row-2" },
        { parcelUid: "" },
      ],
    });

    expect(parcelIds).toEqual(["ext-1", "row-2"]);
  });

  it("unwraps the route result envelope", () => {
    const payload = {
      result: {
        results: [{ parcelId: "1" }],
        count: 1,
      },
      metadata: {
        toolName: "recall_property_intelligence",
      },
    };

    expect(unwrapToolExecuteResult(payload)).toEqual(payload.result);
  });

  it("treats wrapped semantic hits as success", () => {
    const assessment = assessSemanticRecallPayload({
      result: {
        results: [{ parcelId: "1", score: 0.82 }],
        count: 1,
      },
    });

    expect(assessment.ok).toBe(true);
    expect(assessment.hits).toHaveLength(1);
    expect(assessment.error).toBeUndefined();
  });

  it("reports wrapped tool execution errors instead of misclassifying them as zero hits", () => {
    const assessment = assessSemanticRecallPayload({
      result: "An error occurred while running the tool. Please try again. Error: $: Invalid JSON input for tool",
      metadata: {
        toolName: "recall_property_intelligence",
      },
    });

    expect(assessment.ok).toBe(false);
    expect(assessment.hits).toEqual([]);
    expect(assessment.error).toContain("Invalid JSON input for tool");
  });

  it("surfaces memory-disabled responses explicitly", () => {
    const assessment = assessSemanticRecallPayload({
      result: {
        results: [],
        count: 0,
        memory_disabled: true,
        note: "Property intelligence memory is not enabled.",
      },
    });

    expect(assessment.ok).toBe(false);
    expect(assessment.memoryDisabled).toBe(true);
    expect(assessment.error).toContain("Property intelligence memory is not enabled");
  });

  it("treats wrapped property-memory store success as a valid seed", () => {
    const assessment = assessStorePropertyFindingPayload({
      result: {
        stored: true,
        parcelId: "308-4646-1",
      },
    });

    expect(assessment).toEqual({ ok: true });
  });

  it("surfaces wrapped property-memory store errors", () => {
    const assessment = assessStorePropertyFindingPayload({
      result: {
        stored: false,
        error: "Qdrant upsert failed: 503",
      },
    });

    expect(assessment.ok).toBe(false);
    expect(assessment.error).toContain("Qdrant upsert failed");
  });
});
