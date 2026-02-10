jest.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: { findFirst: jest.fn() },
    task: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), count: jest.fn() },
  },
}));

const db = jest.requireMock("@entitlement-os/db") as {
  prisma: {
    deal: { findFirst: jest.Mock };
    task: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; count: jest.Mock };
  };
};

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
  beforeEach(() => jest.clearAllMocks());

  it("ignores non task.completed events", async () => {
    await handleAdvancement({ type: "task.created", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("returns if deal not found", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(null);
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips INTAKE deals (handled by triage)", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test", status: "INTAKE" });
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips KILLED deals", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test", status: "KILLED" });
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips EXITED deals", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test", status: "EXITED" });
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("skips EXIT_MARKETED (EXITED transition is funds-received)", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test", status: "EXIT_MARKETED" });
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("does not suggest advancement if not all step tasks are done", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test Deal", status: "TRIAGE_DONE" });
    db.prisma.task.findMany.mockResolvedValue([
      { status: "DONE" },
      { status: "TODO" },
    ]);
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does not suggest if no tasks exist for step", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test Deal", status: "TRIAGE_DONE" });
    db.prisma.task.findMany.mockResolvedValue([]);
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does not create duplicate advancement notification", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test", status: "TRIAGE_DONE" });
    db.prisma.task.findMany.mockResolvedValue([{ status: "DONE" }]);
    db.prisma.task.findFirst.mockResolvedValue({ id: "existing-task" }); // existing notification
    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates advancement notification when all step tasks done", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({ id: "d", name: "Test Deal", status: "TRIAGE_DONE" });
    db.prisma.task.findMany.mockResolvedValue([{ status: "DONE" }, { status: "DONE" }]);
    db.prisma.task.findFirst.mockResolvedValue(null); // no existing notification
    db.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });

    expect(db.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = db.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("[AUTO]");
    expect(arg.data.title).toContain("advance to PREAPP");
    expect(arg.data.pipelineStep).toBe(2);
  });
});

describe("handleStatusChangeReminder", () => {
  beforeEach(() => jest.clearAllMocks());

  it("ignores non deal.statusChanged events", async () => {
    await handleStatusChangeReminder({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.task.count).not.toHaveBeenCalled();
  });

  it("does nothing for KILLED deals", async () => {
    await handleStatusChangeReminder({
      type: "deal.statusChanged", dealId: "d", from: "HEARING", to: "KILLED", orgId: "o",
    });
    expect(db.prisma.task.count).not.toHaveBeenCalled();
  });

  it("suggests creating tasks when no tasks exist for new stage", async () => {
    db.prisma.task.count.mockResolvedValue(0);
    db.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleStatusChangeReminder({
      type: "deal.statusChanged", dealId: "d", from: "TRIAGE_DONE", to: "PREAPP", orgId: "o",
    });

    expect(db.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = db.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("[AUTO]");
    expect(arg.data.title).toContain("Create tasks for PREAPP");
  });

  it("does nothing when tasks already exist for new stage", async () => {
    db.prisma.task.count.mockResolvedValue(3);

    await handleStatusChangeReminder({
      type: "deal.statusChanged", dealId: "d", from: "TRIAGE_DONE", to: "PREAPP", orgId: "o",
    });

    expect(db.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does nothing for terminal statuses with no next transition", async () => {
    await handleStatusChangeReminder({
      type: "deal.statusChanged", dealId: "d", from: "EXIT_MARKETED", to: "EXITED", orgId: "o",
    });

    expect(db.prisma.task.count).not.toHaveBeenCalled();
    expect(db.prisma.task.create).not.toHaveBeenCalled();
  });
});
