import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetBuildingPermitsFeedCacheForTests,
  getEbrBuildingPermitsFeed,
  type BuildingPermitsFeedOptions,
} from "./buildingPermits.service";

describe("buildingPermits.service", () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.SOCRATA_BASE_URL;
  const originalDatasetId = process.env.SOCRATA_EBR_PERMITS_DATASET_ID;
  const originalAppToken = process.env.SOCRATA_APP_TOKEN;

  function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  }

  function buildSuccessfulResponses() {
    return [
      jsonResponse([
        {
          permit_count: "5",
          total_project_value: "250000",
          average_project_value: "50000",
          total_permit_fees: "5000",
          latest_issued_date: "2026-03-12T00:00:00.000",
        },
      ]),
      jsonResponse([
        {
          issued_day: "2026-03-10T00:00:00.000",
          permit_count: "2",
          total_project_value: "120000",
        },
      ]),
      jsonResponse([
        {
          designation_label: "Commercial",
          permit_count: "4",
          total_project_value: "220000",
        },
      ]),
      jsonResponse([
        {
          permit_type_label: "Occupancy Permit (C)",
          permit_count: "3",
          total_project_value: "100000",
        },
      ]),
      jsonResponse([
        {
          zip: "70811",
          permit_count: "3",
          total_project_value: "100000",
        },
      ]),
      jsonResponse([
        {
          permitnumber: "17473",
          permittype: "Occupancy Permit (C)",
          designation: "Commercial",
          projectdescription: "Auto repair",
          projectvalue: "100000",
          permitfee: "115",
          issueddate: "2026-03-12T00:00:00.000",
          address: "6883 AIRLINE HWY BATON ROUGE LA 70811",
          zip: "70811",
          ownername: "Owner",
          applicantname: "Applicant",
          contractorname: "Contractor",
        },
      ]),
    ];
  }

  beforeEach(() => {
    vi.useRealTimers();
    process.env.SOCRATA_BASE_URL = "https://data.brla.gov/resource";
    process.env.SOCRATA_EBR_PERMITS_DATASET_ID = "7fq7-8j7r";
    process.env.SOCRATA_APP_TOKEN = "test-socrata-token";
    __resetBuildingPermitsFeedCacheForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.SOCRATA_BASE_URL;
    } else {
      process.env.SOCRATA_BASE_URL = originalBaseUrl;
    }
    if (originalDatasetId === undefined) {
      delete process.env.SOCRATA_EBR_PERMITS_DATASET_ID;
    } else {
      process.env.SOCRATA_EBR_PERMITS_DATASET_ID = originalDatasetId;
    }
    if (originalAppToken === undefined) {
      delete process.env.SOCRATA_APP_TOKEN;
    } else {
      process.env.SOCRATA_APP_TOKEN = originalAppToken;
    }
    vi.restoreAllMocks();
  });

  it("returns parsed live permit aggregates from Socrata", async () => {
    const fetchMock = vi.fn();
    for (const response of buildSuccessfulResponses()) {
      fetchMock.mockResolvedValueOnce(response);
    }

    global.fetch = fetchMock as typeof fetch;

    const options: BuildingPermitsFeedOptions = {
      days: 90,
      designation: "commercial",
      limit: 25,
      permitType: "Occupancy Permit (C)",
      zipCode: "70811",
    };

    const result = await getEbrBuildingPermitsFeed(options);

    expect(result.filters).toEqual(options);
    expect(result.totals).toEqual({
      permitCount: 5,
      totalProjectValue: 250000,
      averageProjectValue: 50000,
      totalPermitFees: 5000,
      latestIssuedDate: "2026-03-12T00:00:00.000",
    });
    expect(result.issuedTrend).toEqual([
      {
        issuedDay: "2026-03-10T00:00:00.000",
        permitCount: 2,
        totalProjectValue: 120000,
      },
    ]);
    expect(result.recentPermits[0]).toEqual({
      permitNumber: "17473",
      permitType: "Occupancy Permit (C)",
      designation: "Commercial",
      projectDescription: "Auto repair",
      projectValue: 100000,
      permitFee: 115,
      issuedDate: "2026-03-12T00:00:00.000",
      address: "6883 AIRLINE HWY BATON ROUGE LA 70811",
      zip: "70811",
      ownerName: "Owner",
      applicantName: "Applicant",
      contractorName: "Contractor",
    });
    expect(result.warnings).toEqual([]);
    expect(result.partial).toBe(false);
    expect(result.fallbackUsed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/7fq7-8j7r.json?");
    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(firstUrl.searchParams.get("$where")).toContain("permittype = 'Occupancy Permit (C)'");
    expect(firstUrl.searchParams.get("$where")).toContain("zip = '70811'");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      next: { revalidate: 0 },
      headers: expect.objectContaining({
        Accept: "application/json",
        "X-App-Token": "test-socrata-token",
      }),
    });
  });

  it("returns partial data with warnings when a secondary Socrata query fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    const successfulResponses = buildSuccessfulResponses();

    fetchMock.mockResolvedValueOnce(successfulResponses[0]);
    fetchMock.mockResolvedValueOnce(successfulResponses[1]);
    fetchMock.mockResolvedValueOnce(
      new Response("designation query unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );
    fetchMock.mockResolvedValueOnce(successfulResponses[3]);
    fetchMock.mockResolvedValueOnce(successfulResponses[4]);
    fetchMock.mockResolvedValueOnce(successfulResponses[5]);

    global.fetch = fetchMock as typeof fetch;

    const result = await getEbrBuildingPermitsFeed({
      days: 30,
      designation: "all",
      limit: 20,
    });

    expect(result.partial).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.warnings).toEqual([
      "designation breakdown data is temporarily unavailable (503 Service Unavailable).",
    ]);
    expect(result.designationBreakdown).toEqual([]);
    expect(result.recentPermits).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[building-permits] upstream query failed",
      expect.objectContaining({
        queryName: "designationBreakdown",
        required: false,
        status: 503,
        statusText: "Service Unavailable",
        snippet: "designation query unavailable",
      }),
    );
  });

  it("serves the last-good payload when a required Socrata query fails after a successful fetch", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    const options: BuildingPermitsFeedOptions = {
      days: 30,
      designation: "all",
      limit: 20,
    };

    for (const response of buildSuccessfulResponses()) {
      fetchMock.mockResolvedValueOnce(response);
    }

    fetchMock.mockResolvedValueOnce(
      new Response("totals unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );
    for (const response of buildSuccessfulResponses().slice(1)) {
      fetchMock.mockResolvedValueOnce(response);
    }

    global.fetch = fetchMock as typeof fetch;

    const initialResult = await getEbrBuildingPermitsFeed(options);
    const fallbackResult = await getEbrBuildingPermitsFeed(options);

    expect(initialResult.fallbackUsed).toBe(false);
    expect(fallbackResult.totals).toEqual(initialResult.totals);
    expect(fallbackResult.recentPermits).toEqual(initialResult.recentPermits);
    expect(fallbackResult.partial).toBe(false);
    expect(fallbackResult.fallbackUsed).toBe(true);
    expect(fallbackResult.warnings).toEqual([
      "Serving the last successful building permits snapshot because a required Socrata query failed.",
      "permit totals data is temporarily unavailable (503 Service Unavailable).",
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[building-permits] serving cached last-good payload",
      expect.objectContaining({
        warnings: fallbackResult.warnings,
        refreshedAt: initialResult.dataset.refreshedAt,
      }),
    );
  });

  it("throws when a required Socrata query fails and no last-good payload is cached", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("upstream error", {
          status: 503,
          statusText: "Service Unavailable",
        }),
      ) as typeof fetch;

    await expect(
      getEbrBuildingPermitsFeed({
        days: 30,
        designation: "all",
        limit: 20,
      }),
    ).rejects.toThrow(
      "Building permits feed unavailable because a required Socrata query failed",
    );
  });
});
