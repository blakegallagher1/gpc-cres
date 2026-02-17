const { dbMock, knowledgeMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      deal: { findFirst: vi.fn() },
      run: { findFirst: vi.fn() },
      entitlementPredictionSnapshot: { findFirst: vi.fn() },
    },
  },
  knowledgeMock: {
    deleteKnowledge: vi.fn(),
    ingestKnowledge: vi.fn(),
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);
vi.mock("@/lib/services/knowledgeBase.service", () => knowledgeMock);

import { handleKnowledgeCapture } from "../knowledgeCapture";

describe("handleKnowledgeCapture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores non deal.statusChanged events", async () => {
    await handleKnowledgeCapture({
      type: "task.completed",
      dealId: "deal-1",
      taskId: "task-1",
      orgId: "org-1",
    });

    expect(dbMock.prisma.deal.findFirst).not.toHaveBeenCalled();
    expect(knowledgeMock.ingestKnowledge).not.toHaveBeenCalled();
  });

  it("ignores non-terminal status changes", async () => {
    await handleKnowledgeCapture({
      type: "deal.statusChanged",
      dealId: "deal-1",
      from: "TRIAGE_DONE",
      to: "PREAPP",
      orgId: "org-1",
    });

    expect(dbMock.prisma.deal.findFirst).not.toHaveBeenCalled();
    expect(knowledgeMock.ingestKnowledge).not.toHaveBeenCalled();
  });

  it("returns when deal cannot be loaded", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(null);

    await handleKnowledgeCapture({
      type: "deal.statusChanged",
      dealId: "deal-1",
      from: "EXIT_MARKETED",
      to: "EXITED",
      orgId: "org-1",
    });

    expect(knowledgeMock.deleteKnowledge).not.toHaveBeenCalled();
    expect(knowledgeMock.ingestKnowledge).not.toHaveBeenCalled();
  });

  it("captures EXITED outcomes with variance analysis", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      id: "deal-1",
      orgId: "org-1",
      name: "Test Deal",
      sku: "OUTDOOR_STORAGE",
      status: "EXITED",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      jurisdiction: { name: "East Baton Rouge" },
      entitlementPath: { recommendedStrategy: "CUP" },
      outcome: {
        actualIrr: 0.22,
        actualEquityMultiple: 1.9,
        actualHoldPeriodMonths: 14,
        exitDate: new Date("2025-10-15T00:00:00.000Z"),
        killReason: null,
        killWasCorrect: null,
      },
      risks: [
        {
          category: "market",
          title: "Cap rate expansion",
          description: "Cap rates drifted higher",
          severity: "high",
          status: "monitoring",
        },
      ],
    });
    dbMock.prisma.run.findFirst.mockResolvedValue({
      outputJson: {
        predicted_irr: 0.18,
        predicted_timeline_days: 180,
      },
    });
    dbMock.prisma.entitlementPredictionSnapshot.findFirst.mockResolvedValue({
      expectedDaysP50: 165,
    });

    await handleKnowledgeCapture({
      type: "deal.statusChanged",
      dealId: "deal-1",
      from: "EXIT_MARKETED",
      to: "EXITED",
      orgId: "org-1",
    });

    expect(knowledgeMock.deleteKnowledge).toHaveBeenCalledWith(
      "deal-outcome:deal-1:exited",
    );
    expect(knowledgeMock.ingestKnowledge).toHaveBeenCalledTimes(1);
    expect(knowledgeMock.ingestKnowledge.mock.calls[0][0]).toBe("outcome_record");
    expect(knowledgeMock.ingestKnowledge.mock.calls[0][1]).toBe(
      "deal-outcome:deal-1:exited",
    );
    const content = knowledgeMock.ingestKnowledge.mock.calls[0][2] as string;
    expect(content).toContain("Predicted vs Actual");
    expect(content).toContain("Predicted IRR");
    expect(content).toContain("Actual IRR");
    expect(content).toContain("Risk Materializations");
  });

  it("captures KILLED outcomes even when outcome record is missing", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      id: "deal-2",
      orgId: "org-1",
      name: "Killed Deal",
      sku: "TRUCK_PARKING",
      status: "KILLED",
      createdAt: new Date("2025-05-01T00:00:00.000Z"),
      updatedAt: new Date("2025-08-15T00:00:00.000Z"),
      jurisdiction: { name: "Ascension" },
      entitlementPath: { recommendedStrategy: null },
      outcome: null,
      risks: [],
    });
    dbMock.prisma.run.findFirst.mockResolvedValue({
      outputJson: {
        predictedIrr: 0.16,
        timelineDays: 120,
      },
    });
    dbMock.prisma.entitlementPredictionSnapshot.findFirst.mockResolvedValue(null);

    await handleKnowledgeCapture({
      type: "deal.statusChanged",
      dealId: "deal-2",
      from: "HEARING",
      to: "KILLED",
      orgId: "org-1",
    });

    expect(knowledgeMock.ingestKnowledge).toHaveBeenCalledTimes(1);
    expect(knowledgeMock.ingestKnowledge.mock.calls[0][1]).toBe(
      "deal-outcome:deal-2:killed",
    );
  });
});
