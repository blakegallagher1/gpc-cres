import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("queryBuildingPermits.execute", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      SOCRATA_BASE_URL: "https://data.example.com/resource",
      SOCRATA_APP_TOKEN: "test-token",
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses the default dataset id when none is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

      const { queryBuildingPermits } = await import("./socrataTools");

      await queryBuildingPermits.execute({
        zipCode: "70810",
        monthsBack: 12,
        permitTypes: null,
      });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/7fq7-8j7r.json");
  });

  it("uses the configured dataset id override when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.SOCRATA_DATASET_ID = "abcd-1234";

      const { queryBuildingPermits } = await import("./socrataTools");

      await queryBuildingPermits.execute({
        zipCode: "70810",
        monthsBack: 12,
        permitTypes: null,
      });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/abcd-1234.json");
  });
});
