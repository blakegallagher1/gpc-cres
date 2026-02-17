const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      deal: { findFirst: vi.fn(), update: vi.fn() },
      run: { findFirst: vi.fn() },
      marketDataPoint: { findMany: vi.fn() },
    },
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);

import { handleFinancialInit } from "../financialInit";

describe("handleFinancialInit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.prisma.deal.update.mockResolvedValue({});
    dbMock.prisma.marketDataPoint.findMany.mockResolvedValue([]);
    dbMock.prisma.run.findFirst.mockResolvedValue(null);
  });

  it("ignores non triage.completed events", async () => {
    await handleFinancialInit({
      type: "task.completed",
      dealId: "deal-1",
      taskId: "task-1",
      orgId: "org-1",
    });

    expect(dbMock.prisma.deal.findFirst).not.toHaveBeenCalled();
    expect(dbMock.prisma.deal.update).not.toHaveBeenCalled();
  });

  it("returns when deal cannot be loaded", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(null);

    await handleFinancialInit({
      type: "triage.completed",
      dealId: "deal-1",
      runId: "run-1",
      decision: "ADVANCE",
      orgId: "org-1",
    });

    expect(dbMock.prisma.deal.update).not.toHaveBeenCalled();
  });

  it("does not overwrite existing assumptions", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      id: "deal-1",
      orgId: "org-1",
      sku: "OUTDOOR_STORAGE",
      financialModelAssumptions: { buildableSf: 10000 },
      jurisdiction: { name: "East Baton Rouge" },
      parcels: [{ acreage: { toString: () => "2.0" } }],
      terms: { offerPrice: { toString: () => "1200000" } },
    });

    await handleFinancialInit({
      type: "triage.completed",
      dealId: "deal-1",
      runId: "run-1",
      decision: "ADVANCE",
      orgId: "org-1",
    });

    expect(dbMock.prisma.deal.update).not.toHaveBeenCalled();
  });

  it("initializes assumptions with buildable SF and defaults", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      id: "deal-1",
      orgId: "org-1",
      sku: "SMALL_BAY_FLEX",
      financialModelAssumptions: null,
      jurisdiction: { name: "East Baton Rouge" },
      parcels: [{ acreage: { toString: () => "3.0" } }],
      terms: { offerPrice: { toString: () => "1500000" } },
    });

    await handleFinancialInit({
      type: "triage.completed",
      dealId: "deal-1",
      runId: "run-1",
      decision: "ADVANCE",
      orgId: "org-1",
    });

    expect(dbMock.prisma.deal.update).toHaveBeenCalledTimes(1);
    const payload = dbMock.prisma.deal.update.mock.calls[0][0].data
      .financialModelAssumptions as Record<string, unknown>;
    expect(payload.buildableSf).toBe(45738);
    expect((payload.exit as { holdYears: number }).holdYears).toBe(5);
    expect((payload.acquisition as { purchasePrice: number }).purchasePrice).toBe(1500000);
  });

  it("uses market cap rate and target IRR from triage run output", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      id: "deal-1",
      orgId: "org-1",
      sku: "OUTDOOR_STORAGE",
      financialModelAssumptions: null,
      jurisdiction: { name: "Ascension" },
      parcels: [{ acreage: { toString: () => "1.0" } }],
      terms: { offerPrice: null },
    });
    dbMock.prisma.marketDataPoint.findMany.mockResolvedValue([
      { data: { cap_rate: 0.0825 } },
      { data: { cap_rate: 8.35 } },
    ]);
    dbMock.prisma.run.findFirst.mockResolvedValue({
      outputJson: {
        triage: {
          financial_summary: { target_irr: 0.19 },
        },
      },
    });

    await handleFinancialInit({
      type: "triage.completed",
      dealId: "deal-1",
      runId: "run-1",
      decision: "ADVANCE",
      orgId: "org-1",
    });

    const payload = dbMock.prisma.deal.update.mock.calls[0][0].data
      .financialModelAssumptions as Record<string, unknown>;
    expect((payload.exit as { exitCapRate: number }).exitCapRate).toBe(8.3);
    expect(payload.targetIrrPct).toBe(19);
  });
});
