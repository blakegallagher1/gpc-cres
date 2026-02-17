const { dbMock, createAutomationTaskMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      deal: { findMany: vi.fn() },
      marketDataPoint: { findMany: vi.fn() },
      task: { findFirst: vi.fn() },
    },
  },
  createAutomationTaskMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => dbMock);
vi.mock("../notifications", () => ({
  createAutomationTask: createAutomationTaskMock,
}));

import { runMarketMonitoring } from "../marketMonitoring";

describe("runMarketMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.prisma.task.findFirst.mockResolvedValue(null);
  });

  it("returns empty summary when there are no active deals", async () => {
    dbMock.prisma.deal.findMany.mockResolvedValue([]);

    const result = await runMarketMonitoring(new Date("2026-02-17T12:00:00.000Z"));

    expect(result.parishesScanned).toBe(0);
    expect(result.activeDealsScanned).toBe(0);
    expect(result.capRateAlertsCreated).toBe(0);
    expect(result.dscrAlertsCreated).toBe(0);
    expect(createAutomationTaskMock).not.toHaveBeenCalled();
  });

  it("creates parish-level re-underwrite tasks when cap rate moves > 50bps", async () => {
    dbMock.prisma.deal.findMany.mockResolvedValue([
      {
        id: "deal-1",
        orgId: "org-1",
        name: "Deal 1",
        jurisdiction: { name: "East Baton Rouge" },
      },
      {
        id: "deal-2",
        orgId: "org-1",
        name: "Deal 2",
        jurisdiction: { name: "East Baton Rouge" },
      },
    ]);

    dbMock.prisma.marketDataPoint.findMany
      .mockResolvedValueOnce([{ data: { cap_rate: 0.08 } }]) // current 30d
      .mockResolvedValueOnce([{ data: { cap_rate: 0.074 } }]); // previous 30d

    const result = await runMarketMonitoring(new Date("2026-02-17T12:00:00.000Z"));

    expect(result.parishesScanned).toBe(1);
    expect(result.capRateAlertsCreated).toBe(2);
    expect(result.dscrAlertsCreated).toBe(0);
    expect(createAutomationTaskMock).toHaveBeenCalledTimes(2);
    expect(createAutomationTaskMock.mock.calls[0][0].title).toContain("Market cap rate moved");
  });

  it("creates DSCR recalc tasks when portfolio shift is >= 100bps", async () => {
    dbMock.prisma.deal.findMany.mockResolvedValue([
      {
        id: "deal-1",
        orgId: "org-1",
        name: "Deal 1",
        jurisdiction: { name: "East Baton Rouge" },
      },
      {
        id: "deal-2",
        orgId: "org-1",
        name: "Deal 2",
        jurisdiction: { name: "East Baton Rouge" },
      },
    ]);

    dbMock.prisma.marketDataPoint.findMany
      .mockResolvedValueOnce([{ data: { cap_rate: 0.09 } }]) // current 30d
      .mockResolvedValueOnce([{ data: { cap_rate: 0.078 } }]); // previous 30d (+120 bps)

    const result = await runMarketMonitoring(new Date("2026-02-17T12:00:00.000Z"));

    expect(result.capRateAlertsCreated).toBe(2);
    expect(result.dscrAlertsCreated).toBe(2);
    expect(createAutomationTaskMock).toHaveBeenCalledTimes(4);
    const titles = createAutomationTaskMock.mock.calls.map((call) => call[0].title);
    expect(titles.some((title) => title.includes("DSCR recalculation required"))).toBe(true);
  });

  it("skips creating duplicate tasks inside dedupe window", async () => {
    dbMock.prisma.deal.findMany.mockResolvedValue([
      {
        id: "deal-1",
        orgId: "org-1",
        name: "Deal 1",
        jurisdiction: { name: "East Baton Rouge" },
      },
    ]);
    dbMock.prisma.marketDataPoint.findMany
      .mockResolvedValueOnce([{ data: { cap_rate: 0.085 } }])
      .mockResolvedValueOnce([{ data: { cap_rate: 0.075 } }]);
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "existing-task" });

    const result = await runMarketMonitoring(new Date("2026-02-17T12:00:00.000Z"));

    expect(result.capRateAlertsCreated).toBe(0);
    expect(result.dscrAlertsCreated).toBe(0);
    expect(createAutomationTaskMock).not.toHaveBeenCalled();
  });
});
