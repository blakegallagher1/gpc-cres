import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

import { queryBuildingPermits } from "./socrataTools.js";

const queryBuildingPermitsExecute = (
  queryBuildingPermits as unknown as {
    execute: (input: {
      zipCode: string;
      monthsBack?: number | null;
      designation?: "Commercial" | "Residential" | "All" | null;
      permitTypes?: string[] | null;
      limit?: number | null;
    }) => Promise<string>;
  }
).execute;

describe("socrataTools", () => {
  const originalBaseUrl = process.env.SOCRATA_BASE_URL;
  const originalDatasetId = process.env.SOCRATA_EBR_PERMITS_DATASET_ID;
  const originalAppToken = process.env.SOCRATA_APP_TOKEN;

  beforeEach(() => {
    process.env.SOCRATA_BASE_URL = "https://data.brla.gov/resource";
    process.env.SOCRATA_EBR_PERMITS_DATASET_ID = "7fq7-8j7r";
    process.env.SOCRATA_APP_TOKEN = "test-socrata-token";
    vi.unstubAllGlobals();
  });

  afterEach(() => {
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

  it("queries the live BRLA building permits dataset with real field names", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            permitnumber: "17473",
            permittype: "Occupancy Permit (C)",
            designation: "Commercial",
            projectdescription: "Auto repair",
            projectvalue: "100000",
            issueddate: "2026-03-12T00:00:00.000",
            address: "6883 AIRLINE HWY BATON ROUGE LA 70811",
            zip: "70811",
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(
      await queryBuildingPermitsExecute({
        zipCode: "70811",
        monthsBack: 6,
        designation: "Commercial",
        permitTypes: ["Occupancy Permit (C)"],
        limit: 25,
      }),
    ) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      zipCode: "70811",
      timeframeMonths: 6,
      designation: "Commercial",
      permitCount: 1,
      permitTypeCounts: {
        "Occupancy Permit (C)": 1,
      },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/7fq7-8j7r.json?");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("issueddate");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("permittype");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Accept: "application/json",
        "X-App-Token": "test-socrata-token",
      }),
    });
  });

  it("returns a structured error when Socrata fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502, statusText: "Bad Gateway" })),
    );

    const result = JSON.parse(
      await queryBuildingPermitsExecute({
        zipCode: "70811",
      }),
    ) as Record<string, unknown>;

    expect(result).toEqual({
      error: "Socrata returned 502: Bad Gateway",
    });
  });
});
