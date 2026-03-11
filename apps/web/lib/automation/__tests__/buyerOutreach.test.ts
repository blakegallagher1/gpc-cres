const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      deal: { findFirst: vi.fn() },
      buyer: { findMany: vi.fn() },
      outreach: { count: vi.fn(), findFirst: vi.fn() },
      task: { findFirst: vi.fn(), create: vi.fn() },
    },
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);

const {
  getAutomationDealContextMock,
  getCurrentWorkflowStageMock,
  getWorkflowPipelineStepMock,
  isEntitlementStrategyMock,
} = vi.hoisted(() => ({
  getAutomationDealContextMock: vi.fn(),
  getCurrentWorkflowStageMock: vi.fn(),
  getWorkflowPipelineStepMock: vi.fn(),
  isEntitlementStrategyMock: vi.fn(),
}));

vi.mock("../context", () => ({
  getAutomationDealContext: getAutomationDealContextMock,
  getCurrentWorkflowStage: getCurrentWorkflowStageMock,
  getWorkflowPipelineStep: getWorkflowPipelineStepMock,
  isEntitlementStrategy: isEntitlementStrategyMock,
}));

import { findMatchingBuyers, handleBuyerOutreach, handleTriageBuyerMatch } from "../buyerOutreach";

function buildEntitlementContext(overrides: Record<string, unknown> = {}) {
  return {
    dealId: "d",
    orgId: "o",
    name: "Test Deal",
    sku: "TRUCK_PARKING",
    jurisdictionId: "j1",
    status: "EXIT_MARKETED",
    strategy: "ENTITLEMENT",
    workflowTemplateKey: "ENTITLEMENT_LAND",
    currentStageKey: "DISPOSITION",
    templateStages: [],
    ...overrides,
  };
}

describe("findMatchingBuyers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries buyers by SKU and jurisdiction", async () => {
    dbMock.prisma.buyer.findMany.mockResolvedValue([]);
    await findMatchingBuyers("org-1", "OUTDOOR_STORAGE", "jur-1");

    expect(dbMock.prisma.buyer.findMany).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.buyer.findMany.mock.calls[0][0];
    expect(arg.where.orgId).toBe("org-1");
    expect(arg.where.skuInterests).toEqual({ has: "OUTDOOR_STORAGE" });
    expect(arg.where.jurisdictionInterests).toEqual({ has: "jur-1" });
  });

  it("returns matched buyers", async () => {
    dbMock.prisma.buyer.findMany.mockResolvedValue([
      { id: "b1", name: "Buyer A", company: "Co A", email: "a@test.com", buyerType: "operator" },
    ]);

    const result = await findMatchingBuyers("org-1", "TRUCK_PARKING", "jur-1");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Buyer A");
  });
});

describe("handleBuyerOutreach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAutomationDealContextMock.mockResolvedValue(buildEntitlementContext());
    getCurrentWorkflowStageMock.mockReturnValue(null);
    getWorkflowPipelineStepMock.mockReturnValue(7);
    isEntitlementStrategyMock.mockReturnValue(true);
  });

  it("ignores non deal.statusChanged events", async () => {
    await handleBuyerOutreach({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(getAutomationDealContextMock).not.toHaveBeenCalled();
  });

  it("ignores status changes that are not EXIT_MARKETED", async () => {
    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "TRIAGE_DONE", to: "PREAPP", orgId: "o",
    });
    expect(getAutomationDealContextMock).toHaveBeenCalledTimes(1);
    expect(dbMock.prisma.buyer.findMany).not.toHaveBeenCalled();
  });

  it("returns if deal not found", async () => {
    getAutomationDealContextMock.mockResolvedValue(null);
    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "APPROVED", to: "EXIT_MARKETED", orgId: "o",
    });
    expect(dbMock.prisma.buyer.findMany).not.toHaveBeenCalled();
  });

  it("returns when weekly outreach limit reached", async () => {
    getAutomationDealContextMock.mockResolvedValue(
      buildEntitlementContext({
        name: "Test",
        sku: "OUTDOOR_STORAGE",
      }),
    );
    dbMock.prisma.outreach.count.mockResolvedValue(20); // >= max (20)

    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "APPROVED", to: "EXIT_MARKETED", orgId: "o",
    });

    expect(dbMock.prisma.buyer.findMany).not.toHaveBeenCalled();
  });

  it("creates 'no matching buyers' task when none match", async () => {
    getAutomationDealContextMock.mockResolvedValue(
      buildEntitlementContext({
        sku: "SMALL_BAY_FLEX",
      }),
    );
    dbMock.prisma.outreach.count.mockResolvedValue(0);
    dbMock.prisma.buyer.findMany.mockResolvedValue([]);
    dbMock.prisma.task.create.mockResolvedValue({ id: "t1" });

    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "APPROVED", to: "EXIT_MARKETED", orgId: "o",
    });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("No matching buyers");
  });

  it("creates outreach review task with eligible buyers", async () => {
    dbMock.prisma.outreach.count.mockResolvedValue(0);
    dbMock.prisma.buyer.findMany.mockResolvedValue([
      { id: "b1", name: "Buyer A", company: "Co A", email: "a@test.com", buyerType: "operator" },
      { id: "b2", name: "Buyer B", company: null, email: "b@test.com", buyerType: "investor" },
    ]);
    // Not in cool-off, not already contacted
    dbMock.prisma.outreach.findFirst.mockResolvedValue(null);
    dbMock.prisma.task.create.mockResolvedValue({ id: "t1" });

    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "APPROVED", to: "EXIT_MARKETED", orgId: "o",
    });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("2 buyer outreach");
    expect(arg.data.description).toContain("Buyer A");
    expect(arg.data.description).toContain("Buyer B");
    expect(arg.data.pipelineStep).toBe(7);
  });

  it("filters out buyers already contacted for this deal", async () => {
    getAutomationDealContextMock.mockResolvedValue(
      buildEntitlementContext({
        name: "Test",
        sku: "OUTDOOR_STORAGE",
      }),
    );
    dbMock.prisma.outreach.count.mockResolvedValue(0);
    dbMock.prisma.buyer.findMany.mockResolvedValue([
      { id: "b1", name: "Buyer A", company: null, email: "a@test.com", buyerType: "operator" },
    ]);
    // b1 already contacted (findFirst returns a result for alreadyContacted check)
    // The handler calls both isInCoolOff and alreadyContacted with findFirst
    // First call: isInCoolOff → null, Second call: alreadyContacted → existing outreach
    dbMock.prisma.outreach.findFirst
      .mockResolvedValueOnce(null) // isInCoolOff → not in cool-off
      .mockResolvedValueOnce({ id: "existing" }); // alreadyContacted → yes

    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "APPROVED", to: "EXIT_MARKETED", orgId: "o",
    });

    // All buyers filtered out, so no outreach task
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("supports workflow-stage outreach for non-entitlement disposition stages", async () => {
    getAutomationDealContextMock.mockResolvedValue(
      buildEntitlementContext({
        strategy: "DISPOSITION",
        workflowTemplateKey: "DISPOSITION",
        currentStageKey: "DISPOSITION",
      }),
    );
    isEntitlementStrategyMock.mockReturnValue(false);
    getCurrentWorkflowStageMock.mockReturnValue({
      key: "DISPOSITION",
      name: "Disposition",
      ordinal: 7,
      description: null,
      requiredGate: null,
    });
    getWorkflowPipelineStepMock.mockReturnValue(7);
    dbMock.prisma.outreach.count.mockResolvedValue(0);
    dbMock.prisma.buyer.findMany.mockResolvedValue([
      { id: "b1", name: "Buyer A", company: "Co A", email: "a@test.com", buyerType: "operator" },
    ]);
    dbMock.prisma.outreach.findFirst.mockResolvedValue(null);
    dbMock.prisma.task.create.mockResolvedValue({ id: "t1" });

    await handleBuyerOutreach({
      type: "deal.stageChanged",
      dealId: "d",
      from: "EXECUTION",
      to: "DISPOSITION",
      orgId: "o",
    });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.description).toContain("now in Disposition");
    expect(arg.data.pipelineStep).toBe(7);
  });
});

describe("handleTriageBuyerMatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores non triage.completed events", async () => {
    await handleTriageBuyerMatch({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("ignores non-ADVANCE decisions", async () => {
    await handleTriageBuyerMatch({
      type: "triage.completed", dealId: "d", runId: "r", decision: "KILL", orgId: "o",
    });
    expect(dbMock.prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("creates buyer interest task when matching buyers found", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      id: "d", name: "Test Deal", sku: "TRUCK_PARKING", jurisdictionId: "j1",
    });
    dbMock.prisma.buyer.findMany.mockResolvedValue([
      { id: "b1", name: "Buyer A", company: null, email: null, buyerType: "operator" },
    ]);
    dbMock.prisma.task.findFirst.mockResolvedValue(null);
    dbMock.prisma.task.create.mockResolvedValue({ id: "t1" });

    await handleTriageBuyerMatch({
      type: "triage.completed", dealId: "d", runId: "r", decision: "ADVANCE", orgId: "o",
    });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("1 potential buyer");
    expect(arg.data.pipelineStep).toBe(1);
  });

  it("does not duplicate buyer interest tasks", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      id: "d", name: "Test", sku: "OUTDOOR_STORAGE", jurisdictionId: "j1",
    });
    dbMock.prisma.buyer.findMany.mockResolvedValue([{ id: "b1", name: "Buyer", company: null, email: null, buyerType: "investor" }]);
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "existing-task" });

    await handleTriageBuyerMatch({
      type: "triage.completed", dealId: "d", runId: "r", decision: "ADVANCE", orgId: "o",
    });

    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does nothing when no matching buyers", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      id: "d", name: "Test", sku: "SMALL_BAY_FLEX", jurisdictionId: "j1",
    });
    dbMock.prisma.buyer.findMany.mockResolvedValue([]);

    await handleTriageBuyerMatch({
      type: "triage.completed", dealId: "d", runId: "r", decision: "ADVANCE", orgId: "o",
    });

    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });
});
