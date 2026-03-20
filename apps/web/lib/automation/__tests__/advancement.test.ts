const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      task: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    },
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);

const {
  getAutomationDealContextMock,
  getCurrentWorkflowStageMock,
  getNextWorkflowStageMock,
  getWorkflowPipelineStepMock,
  isEntitlementStrategyMock,
} = vi.hoisted(() => ({
  getAutomationDealContextMock: vi.fn(),
  getCurrentWorkflowStageMock: vi.fn(),
  getNextWorkflowStageMock: vi.fn(),
  getWorkflowPipelineStepMock: vi.fn(),
  isEntitlementStrategyMock: vi.fn(),
}));

vi.mock("../context", () => ({
  getAutomationDealContext: getAutomationDealContextMock,
  getCurrentWorkflowStage: getCurrentWorkflowStageMock,
  getNextWorkflowStage: getNextWorkflowStageMock,
  getWorkflowPipelineStep: getWorkflowPipelineStepMock,
  isEntitlementStrategy: isEntitlementStrategyMock,
}));

import { getNextTransition, handleAdvancement, handleStatusChangeReminder } from "../advancement";

function buildEntitlementContext(overrides: Record<string, unknown> = {}) {
  return {
    dealId: "d",
    orgId: "o",
    name: "Test Deal",
    sku: "SMALL_BAY_FLEX",
    jurisdictionId: "jur-1",
    status: "TRIAGE_DONE",
    strategy: "ENTITLEMENT",
    workflowTemplateKey: "ENTITLEMENT_LAND",
    currentStageKey: "SCREENING",
    templateStages: [],
    ...overrides,
  };
}

function buildStage(key: string, name: string, ordinal: number) {
  return {
    key,
    name,
    ordinal,
    description: null,
    requiredGate: null,
  };
}

describe("getNextTransition", () => {
  it("returns PREAPP transition for TRIAGE_DONE", () => {
    const t = getNextTransition("TRIAGE_DONE");
    expect(t).not.toBeNull();
    expect(t!.to).toBe("PREAPP");
    expect(t!.pipelineStep).toBe(2);
  });

  it("returns CONCEPT transition for PREAPP", () => {
    const t = getNextTransition("PREAPP");
    expect(t).not.toBeNull();
    expect(t!.to).toBe("CONCEPT");
  });

  it("returns null for EXITED", () => {
    expect(getNextTransition("EXITED")).toBeNull();
  });

  it("returns null for KILLED", () => {
    expect(getNextTransition("KILLED")).toBeNull();
  });

  it("returns null for INTAKE (handled by triage route)", () => {
    expect(getNextTransition("INTAKE")).toBeNull();
  });

  it("returns EXIT_MARKETED transition for APPROVED", () => {
    const t = getNextTransition("APPROVED");
    expect(t).not.toBeNull();
    expect(t!.to).toBe("EXIT_MARKETED");
    expect(t!.pipelineStep).toBe(8);
  });
});

describe("handleAdvancement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAutomationDealContextMock.mockResolvedValue(buildEntitlementContext());
    getCurrentWorkflowStageMock.mockReturnValue(buildStage("SCREENING", "Screening", 2));
    getNextWorkflowStageMock.mockReturnValue(
      buildStage("UNDERWRITING", "Underwriting", 3),
    );
    getWorkflowPipelineStepMock.mockReturnValue(2);
    isEntitlementStrategyMock.mockReturnValue(true);
    dbMock.prisma.task.count.mockResolvedValue(0);
  });

  it("ignores non task.completed events", async () => {
    await handleAdvancement({ type: "task.created", dealId: "d", taskId: "t", orgId: "o" });
    expect(getAutomationDealContextMock).not.toHaveBeenCalled();
  });

  it("returns if deal not found", async () => {
    getAutomationDealContextMock.mockResolvedValue(null);
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips ORIGINATION stage deals (handled by screen/triage)", async () => {
    getCurrentWorkflowStageMock.mockReturnValue(buildStage("ORIGINATION", "Origination", 1));
    getNextWorkflowStageMock.mockReturnValue(buildStage("SCREENING", "Screening", 2));
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips CLOSED_LOST stage deals", async () => {
    getCurrentWorkflowStageMock.mockReturnValue(buildStage("CLOSED_LOST", "Closed Lost", 9));
    getNextWorkflowStageMock.mockReturnValue(buildStage("CLOSED_WON", "Closed Won", 8));
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips CLOSED_WON stage deals", async () => {
    getCurrentWorkflowStageMock.mockReturnValue(buildStage("CLOSED_WON", "Closed Won", 8));
    getNextWorkflowStageMock.mockReturnValue(buildStage("DISPOSITION", "Disposition", 7));
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips DISPOSITION stage deals", async () => {
    getCurrentWorkflowStageMock.mockReturnValue(buildStage("DISPOSITION", "Disposition", 7));
    getNextWorkflowStageMock.mockReturnValue(buildStage("CLOSED_WON", "Closed Won", 8));
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("does not suggest advancement if not all step tasks are done", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([
      { status: "DONE" },
      { status: "TODO" },
    ]);
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).toHaveBeenCalledWith({
      where: { dealId: "d", deal: { orgId: "o" }, pipelineStep: 2 },
      select: { status: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does not suggest advancement when the 500-task cap indicates there may be more tasks", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue(
      Array.from({ length: 500 }, () => ({ status: "DONE" })),
    );
    dbMock.prisma.task.count.mockResolvedValue(501);

    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });

    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does not suggest if no tasks exist for step", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([]);
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does not create duplicate advancement notification", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([{ status: "DONE" }]);
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "existing-task" }); // existing notification
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates advancement notification when all step tasks done", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([{ status: "DONE" }, { status: "DONE" }]);
    dbMock.prisma.task.findFirst.mockResolvedValue(null); // no existing notification
    dbMock.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("[AUTO]");
    expect(arg.data.title).toContain("advance to Underwriting");
    expect(arg.data.pipelineStep).toBe(2);
  });

  it("creates workflow-stage advancement notification for non-entitlement deals", async () => {
    getAutomationDealContextMock.mockResolvedValue(
      buildEntitlementContext({
        name: "Acquisition Deal",
        strategy: "VALUE_ADD_ACQUISITION",
        workflowTemplateKey: "ACQUISITION",
        currentStageKey: "UNDERWRITING",
      }),
    );
    isEntitlementStrategyMock.mockReturnValue(false);
    getCurrentWorkflowStageMock.mockReturnValue({
      key: "UNDERWRITING",
      name: "Underwriting",
      ordinal: 3,
      description: null,
      requiredGate: null,
    });
    getNextWorkflowStageMock.mockReturnValue({
      key: "DUE_DILIGENCE",
      name: "Due Diligence",
      ordinal: 4,
      description: null,
      requiredGate: null,
    });
    getWorkflowPipelineStepMock.mockReturnValue(3);
    dbMock.prisma.task.findMany.mockResolvedValue([{ status: "DONE" }]);
    dbMock.prisma.task.findFirst.mockResolvedValue(null);
    dbMock.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("advance to Due Diligence");
    expect(arg.data.pipelineStep).toBe(3);
  });
});

describe("handleStatusChangeReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAutomationDealContextMock.mockResolvedValue(buildEntitlementContext());
    getCurrentWorkflowStageMock.mockReturnValue(buildStage("SCREENING", "Screening", 2));
    getWorkflowPipelineStepMock.mockReturnValue(2);
    isEntitlementStrategyMock.mockReturnValue(true);
  });

  it("ignores non deal.stageChanged events", async () => {
    await handleStatusChangeReminder({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.count).not.toHaveBeenCalled();
  });

  it("does nothing for CLOSED_LOST stages", async () => {
    getCurrentWorkflowStageMock.mockReturnValue(buildStage("CLOSED_LOST", "Closed Lost", 9));
    await handleStatusChangeReminder({
      type: "deal.stageChanged", dealId: "d", from: "EXECUTION", to: "CLOSED_LOST", orgId: "o",
    });
    expect(dbMock.prisma.task.count).not.toHaveBeenCalled();
  });

  it("suggests creating tasks when no tasks exist for new stage", async () => {
    dbMock.prisma.task.count.mockResolvedValue(0);
    dbMock.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleStatusChangeReminder({
      type: "deal.stageChanged", dealId: "d", from: "ORIGINATION", to: "SCREENING", orgId: "o",
    });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("[AUTO]");
    expect(arg.data.title).toContain("Create tasks for Screening");
  });

  it("does nothing when tasks already exist for new stage", async () => {
    dbMock.prisma.task.count.mockResolvedValue(3);

    await handleStatusChangeReminder({
      type: "deal.stageChanged", dealId: "d", from: "ORIGINATION", to: "SCREENING", orgId: "o",
    });

    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does nothing for CLOSED_WON stages", async () => {
    getCurrentWorkflowStageMock.mockReturnValue(buildStage("CLOSED_WON", "Closed Won", 8));
    await handleStatusChangeReminder({
      type: "deal.stageChanged", dealId: "d", from: "DISPOSITION", to: "CLOSED_WON", orgId: "o",
    });

    expect(dbMock.prisma.task.count).not.toHaveBeenCalled();
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates stage-scoped task reminders for non-entitlement workflows", async () => {
    getAutomationDealContextMock.mockResolvedValue(
      buildEntitlementContext({
        strategy: "VALUE_ADD_ACQUISITION",
        workflowTemplateKey: "ACQUISITION",
        currentStageKey: "UNDERWRITING",
      }),
    );
    isEntitlementStrategyMock.mockReturnValue(false);
    getCurrentWorkflowStageMock.mockReturnValue(buildStage("UNDERWRITING", "Underwriting", 3));
    getWorkflowPipelineStepMock.mockReturnValue(3);
    dbMock.prisma.task.count.mockResolvedValue(0);
    dbMock.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleStatusChangeReminder({
      type: "deal.stageChanged",
      dealId: "d",
      from: "SCREENING",
      to: "UNDERWRITING",
      orgId: "o",
    });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("Create tasks for Underwriting");
    expect(arg.data.pipelineStep).toBe(3);
  });
});
