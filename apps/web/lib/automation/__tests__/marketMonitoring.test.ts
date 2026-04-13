const mockedMarketMonitoring = vi.hoisted(() => ({
  runMarketMonitoring: vi.fn(),
}));

vi.mock("@gpc/server/automation/marketMonitoring", () => mockedMarketMonitoring);

import { runMarketMonitoring } from "../marketMonitoring";

describe("automation market monitoring facade", () => {
  it("re-exports market monitoring helpers from @gpc/server", async () => {
    mockedMarketMonitoring.runMarketMonitoring.mockResolvedValue({
      parishesScanned: 1,
      activeDealsScanned: 2,
      capRateAlertsCreated: 1,
      dscrAlertsCreated: 1,
      portfolioRateShiftBps: 120,
      parishResults: [],
    });

    expect(runMarketMonitoring).toBe(mockedMarketMonitoring.runMarketMonitoring);

    const result = await runMarketMonitoring(new Date("2026-02-17T12:00:00.000Z"));

    expect(mockedMarketMonitoring.runMarketMonitoring).toHaveBeenCalledWith(
      new Date("2026-02-17T12:00:00.000Z"),
    );
    expect(result.portfolioRateShiftBps).toBe(120);
  });
});
