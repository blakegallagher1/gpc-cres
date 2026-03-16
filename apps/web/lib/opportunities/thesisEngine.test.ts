import { describe, expect, it } from "vitest";
import {
  buildOpportunityFeedbackProfile,
  deriveOpportunityFeedbackSignal,
  enrichOpportunityMatch,
} from "@/lib/opportunities/thesisEngine";

describe("opportunity thesis engine", () => {
  it("learns positive parish preference from pursued history", () => {
    const history = [
      {
        id: "hist-1",
        parcelId: "parcel-h1",
        matchScore: 78,
        matchedCriteria: { parish: true, acreageInRange: true },
        parcelData: {
          parish: "East Baton Rouge",
          address: "10 River Rd",
          ownerName: "Owner A",
          acreage: 2.4,
          lat: 30.45,
          lng: -91.19,
        },
        savedSearch: { id: "search-1", name: "Industrial Baton Rouge" },
        createdAt: "2026-03-01T00:00:00.000Z",
        pursuedAt: "2026-03-02T00:00:00.000Z",
        seenAt: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "hist-2",
        parcelId: "parcel-h2",
        matchScore: 72,
        matchedCriteria: { parish: true },
        parcelData: {
          parish: "Ascension",
          address: "11 River Rd",
          ownerName: "Owner B",
          acreage: 1.1,
          lat: 30.45,
          lng: -91.19,
        },
        savedSearch: { id: "search-1", name: "Industrial Baton Rouge" },
        createdAt: "2026-03-01T00:00:00.000Z",
        dismissedAt: "2026-03-03T00:00:00.000Z",
      },
    ];

    const profile = buildOpportunityFeedbackProfile(history);
    const enriched = enrichOpportunityMatch(
      {
        id: "match-1",
        parcelId: "parcel-1",
        matchScore: 79,
        matchedCriteria: { parish: true, acreageInRange: true },
        parcelData: {
          parish: "East Baton Rouge",
          address: "123 Main St",
          ownerName: "Owner C",
          acreage: 2.5,
          lat: 30.44,
          lng: -91.18,
        },
        savedSearch: { id: "search-1", name: "Industrial Baton Rouge" },
        createdAt: "2026-03-10T00:00:00.000Z",
      },
      profile,
    );

    expect(profile.parishWeights["east baton rouge"]).toBeGreaterThan(0);
    expect(enriched.priorityScore).toBeGreaterThan(79);
    expect(enriched.thesis.signals).toContain(
      "Operator history is positive in East Baton Rouge",
    );
    expect(enriched.thesis.whyNow).toContain("recent pursued opportunities cluster");
  });

  it("surfaces structural risks when parcel data is incomplete", () => {
    const profile = buildOpportunityFeedbackProfile([]);
    const enriched = enrichOpportunityMatch(
      {
        id: "match-2",
        parcelId: "parcel-2",
        matchScore: 68,
        matchedCriteria: {},
        parcelData: {
          parish: "Livingston",
          address: "456 Rural Route",
          ownerName: "Owner D",
          acreage: null,
          lat: null,
          lng: null,
        },
        savedSearch: { id: "search-2", name: "Rural Assemblage" },
        createdAt: "2026-03-10T00:00:00.000Z",
      },
      profile,
    );

    expect(enriched.thesis.keyRisks[0]).toContain("acreage");
    expect(enriched.thesis.keyRisks[1]).toContain("coordinates");
    expect(enriched.thesis.nextBestAction).toContain("Verify parcel geometry");
  });

  it("derives pursued feedback and upgrades next action", () => {
    const signal = deriveOpportunityFeedbackSignal({
      seenAt: "2026-03-01T00:00:00.000Z",
      pursuedAt: "2026-03-02T00:00:00.000Z",
      dismissedAt: null,
    });

    const profile = buildOpportunityFeedbackProfile([]);
    const enriched = enrichOpportunityMatch(
      {
        id: "match-3",
        parcelId: "parcel-3",
        matchScore: 70,
        matchedCriteria: { parish: true },
        parcelData: {
          parish: "East Baton Rouge",
          address: "789 Market St",
          ownerName: "Owner E",
          acreage: 1.8,
          lat: 30.45,
          lng: -91.18,
        },
        savedSearch: { id: "search-3", name: "Infill Sites" },
        createdAt: "2026-03-10T00:00:00.000Z",
        pursuedAt: "2026-03-11T00:00:00.000Z",
      },
      profile,
    );

    expect(signal).toBe("pursued");
    expect(enriched.feedbackSignal).toBe("pursued");
    expect(enriched.priorityScore).toBeGreaterThanOrEqual(95);
    expect(enriched.thesis.nextBestAction).toContain("Create or continue the deal record");
  });
});
