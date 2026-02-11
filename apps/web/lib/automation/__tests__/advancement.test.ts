const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      deal: { findFirst: vi.fn() },
      task: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    },
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);

import { getNextTransition, handleAdvancement, handleStatusChangeReminder } from "../advancement";

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
  beforeEach(() => vi.clearAllMocks());

  it("ignores non task.completed events", async () => {
    await handleAdvancement({ type: "task.created", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("returns if deal not found", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(null);
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips INTAKE deals (handled by triage)", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test", status: "INTAKE" });
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips KILLED deals", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test", status: "KILLED" });
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips EXITED deals", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test", status: "EXITED" });
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips EXIT_MARKETED (EXITED transition is funds-received)", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test", status: "EXIT_MARKETED" });
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("does not suggest advancement if not all step tasks are done", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test Deal", status: "TRIAGE_DONE" });
    dbMock.prisma.task.findMany.mockResolvedValue([
      { status: "DONE" },
      { status: "TODO" },
    ]);
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does not suggest if no tasks exist for step", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test Deal", status: "TRIAGE_DONE" });
    dbMock.prisma.task.findMany.mockResolvedValue([]);
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does not create duplicate advancement notification", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test", status: "TRIAGE_DONE" });
    dbMock.prisma.task.findMany.mockResolvedValue([{ status: "DONE" }]);
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "existing-task" }); // existing notification
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates advancement notification when all step tasks done", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test Deal", status: "TRIAGE_DONE" });
    dbMock.prisma.task.findMany.mockResolvedValue([{ status: "DONE" }, { status: "DONE" }]);
    dbMock.prisma.task.findFirst.mockResolvedValue(null); // no existing notification
    dbMock.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("[AUTO]");
    expect(arg.data.title).toContain("advance to PREAPP");
    expect(arg.data.pipelineStep).toBe(2);
  });
});

describe("handleStatusChangeReminder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores non deal.statusChanged events", async () => {
    await handleStatusChangeReminder({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.count).not.toHaveBeenCalled();
  });

  it("does nothing for KILLED deals", async () => {
    await handleStatusChangeReminder({
      type: "deal.statusChanged", dealId: "d", from: "HEARING", to: "KILLED", orgId: "o",
    });
    expect(dbMock.prisma.task.count).not.toHaveBeenCalled();
  });

  it("suggests creating tasks when no tasks exist for new stage", async () => {
    dbMock.prisma.task.count.mockResolvedValue(0);
    dbMock.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleStatusChangeReminder({
      type: "deal.statusChanged", dealId: "d", from: "TRIAGE_DONE", to: "PREAPP", orgId: "o",
    });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("[AUTO]");
    expect(arg.data.title).toContain("Create tasks for PREAPP");
  });

  it("does nothing when tasks already exist for new stage", async () => {
    dbMock.prisma.task.count.mockResolvedValue(3);

    await handleStatusChangeReminder({
      type: "deal.statusChanged", dealId: "d", from: "TRIAGE_DONE", to: "PREAPP", orgId: "o",
    });

    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does nothing for terminal statuses with no next transition", async () => {
    await handleStatusChangeReminder({
      type: "deal.statusChanged", dealId: "d", from: "EXIT_MARKETED", to: "EXITED", orgId: "o",
    });

    expect(dbMock.prisma.task.count).not.toHaveBeenCalled();
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });
});
