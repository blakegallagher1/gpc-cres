import { describe, expect, it } from "vitest";

import { __testables } from "@/lib/services/entitlementPrecedentBackfill.service";

describe("entitlement precedent backfill connector detection", () => {
  it("detects rss connector", () => {
    expect(__testables.detectConnectorType("https://city.gov/planning/rss.xml")).toBe("rss");
  });

  it("detects socrata connector", () => {
    expect(
      __testables.detectConnectorType("https://data.brla.gov/resource/abcd-1234.json"),
    ).toBe("socrata");
  });

  it("detects arcgis connector", () => {
    expect(
      __testables.detectConnectorType(
        "https://services.arcgis.com/x/ArcGIS/rest/services/zoning_cases/FeatureServer/0/query",
      ),
    ).toBe("arcgis");
  });
});

describe("entitlement precedent row normalization", () => {
  it("extracts decision and strategy from structured record", () => {
    const candidate = __testables.buildCandidateFromRow(
      "jurisdiction-1",
      "https://data.example.gov/resource/zoning.json",
      "socrata",
      {
        case_id: "A-2025-100",
        application_type: "Conditional Use Permit",
        hearing_body: "Planning Commission",
        decision_status: "Approved with conditions",
        decision_date: "2025-07-10",
        filed_date: "2025-06-01",
        title: "Truck Parking Conditional Use",
        document_url: "https://data.example.gov/docs/case-a-2025-100.pdf",
      },
      null,
    );

    expect(candidate).not.toBeNull();
    expect(candidate?.decision).toBe("approved_with_conditions");
    expect(candidate?.strategyKey).toBe("conditional_use_permit");
    expect(candidate?.applicationType).toBe("Conditional Use Permit");
    expect(candidate?.hearingBody).toBe("Planning Commission");
    expect(candidate?.timelineDays).toBeGreaterThan(0);
    expect(candidate?.sourceUrls).toContain("https://data.example.gov/docs/case-a-2025-100.pdf");
  });

  it("returns null for records with no clear decision", () => {
    const candidate = __testables.buildCandidateFromRow(
      "jurisdiction-1",
      "https://example.gov/feed.xml",
      "rss",
      {
        title: "Agenda for next meeting",
        summary: "No case outcome in this notice.",
      },
      "2025-07-10",
    );

    expect(candidate).toBeNull();
  });
});

describe("endpoint normalization", () => {
  it("adds .json to socrata resource endpoint", () => {
    const value = __testables.normalizeSocrataEndpoint(
      "https://data.example.gov/resource/abcd-1234",
    );
    expect(value).toBe("https://data.example.gov/resource/abcd-1234.json");
  });

  it("adds query path to arcgis layer endpoint", () => {
    const value = __testables.normalizeArcGisEndpoint(
      "https://services.arcgis.com/x/ArcGIS/rest/services/zoning_cases/FeatureServer/0",
    );
    expect(value).toBe(
      "https://services.arcgis.com/x/ArcGIS/rest/services/zoning_cases/FeatureServer/0/query",
    );
  });
});

describe("baton rouge connector presets", () => {
  it("maps Socrata coded decision and strategy hints with confidence uplift", () => {
    const candidate = __testables.buildCandidateFromRow(
      "jurisdiction-1",
      "https://data.brla.gov/resource/abcd-1234",
      "socrata",
      {
        case_number: "A-2025-224",
        request_type: "Conditional Use Permit",
        status: "A",
        hearing_body: "Planning Commission",
        filed_date: "2025-02-01",
        decision_date: "2025-03-10",
        title: "Truck parking CUP request",
        document_url: "https://data.brla.gov/documents/case-a-2025-224.pdf",
      },
      null,
    );

    expect(candidate).not.toBeNull();
    expect(candidate?.decision).toBe("approved");
    expect(candidate?.strategyKey).toBe("conditional_use_permit");
    expect(candidate?.confidence).toBeGreaterThan(0.9);
    expect(candidate?.sourceUrls).toContain("https://data.brla.gov/documents/case-a-2025-224.pdf");
  });

  it("maps ArcGIS uppercase fields and status shorthand", () => {
    const candidate = __testables.buildCandidateFromRow(
      "jurisdiction-1",
      "https://services.arcgis.com/x/ArcGIS/rest/services/zoning_cases/FeatureServer/0/query",
      "arcgis",
      {
        CASE_NO: "Z-2025-18",
        REQUEST_TYPE: "Rezoning",
        ACTION: "D",
        HEARING_BODY: "Metro Council",
        FILED_DATE: "2025-01-05",
        DECISION_DATE: "2025-02-20",
        PROJECT_NAME: "Industrial rezoning case",
        DOC_URL: "https://example.org/docs/z-2025-18.pdf",
      },
      null,
    );

    expect(candidate).not.toBeNull();
    expect(candidate?.decision).toBe("denied");
    expect(candidate?.strategyKey).toBe("rezoning");
    expect(candidate?.decisionAt).toBe("2025-02-20");
    expect(candidate?.sourceUrls).toContain("https://example.org/docs/z-2025-18.pdf");
  });
});
