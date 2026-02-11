const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      task: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    },
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);

import { handleTaskCreated, handleTaskCompleted } from "../taskExecution";

describe("handleTaskCreated", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores non task.created events", async () => {
    await handleTaskCreated({ type: "parcel.created", dealId: "d", parcelId: "p", orgId: "o" });
    expect(dbMock.prisma.task.findFirst).not.toHaveBeenCalled();
  });

  it("returns if task not found", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue(null);
    await handleTaskCreated({ type: "task.created", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.count).not.toHaveBeenCalled();
  });

  it("returns if task status is not TODO", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "t", title: "Check flood zone", status: "IN_PROGRESS" });
    await handleTaskCreated({ type: "task.created", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.count).not.toHaveBeenCalled();
  });

  it("skips [AUTO] tasks", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "t", title: "[AUTO] Ready for triage", status: "TODO" });
    await handleTaskCreated({ type: "task.created", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.count).not.toHaveBeenCalled();
  });

  it("returns for human-only tasks (e.g. 'call the city')", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "t", title: "Call the city planner", status: "TODO" });
    await handleTaskCreated({ type: "task.created", dealId: "d", taskId: "t", orgId: "o" });
    // Human-only tasks log but don't check concurrent limit
    expect(dbMock.prisma.task.count).not.toHaveBeenCalled();
  });

  it("returns when concurrent task limit reached", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "t", title: "Check flood zone data", status: "TODO" });
    dbMock.prisma.task.count.mockResolvedValue(5); // >= maxConcurrentPerDeal (5)
    await handleTaskCreated({ type: "task.created", dealId: "d", taskId: "t", orgId: "o" });
    // Should log but not fail
    expect(dbMock.prisma.task.count).toHaveBeenCalled();
  });

  it("identifies agent-executable task under concurrent limit", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "t", title: "Check flood zone data", status: "TODO" });
    dbMock.prisma.task.count.mockResolvedValue(2); // < maxConcurrentPerDeal (5)

    const consoleSpy = vi.spyOn(console, "log").mockImplementation();
    await handleTaskCreated({ type: "task.created", dealId: "d", taskId: "t", orgId: "o" });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("agent-executable")
    );
    consoleSpy.mockRestore();
  });
});

describe("handleTaskCompleted", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores non task.completed events", async () => {
    await handleTaskCompleted({ type: "task.created", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.findFirst).not.toHaveBeenCalled();
  });

  it("returns if task not found", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue(null);
    await handleTaskCompleted({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("skips quality check if task is not DONE", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "t", status: "TODO", description: "Short" });
    await handleTaskCompleted({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("skips quality check if no description", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "t", status: "DONE", description: null });
    await handleTaskCompleted({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("skips quality check if no Agent Findings section", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue({
      id: "t", status: "DONE", title: "Research task", description: "Some content without findings marker",
    });
    await handleTaskCompleted({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates review task when agent findings too short", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue({
      id: "t", status: "DONE", title: "Check flood",
      description: "Some intro\n\nAgent Findings\nShort.",
      pipelineStep: 2,
    });
    dbMock.prisma.task.create.mockResolvedValue({ id: "review-task" });

    await handleTaskCompleted({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("[AUTO]");
    expect(arg.data.title).toContain("Review agent output");
    expect(arg.data.pipelineStep).toBe(2);
  });

  it("does not flag when agent findings are long enough", async () => {
    const longFindings = "Agent Findings\n" + "x".repeat(200);
    dbMock.prisma.task.findFirst.mockResolvedValue({
      id: "t", status: "DONE", title: "Check flood",
      description: `Intro\n\n${longFindings}`,
      pipelineStep: 2,
    });

    await handleTaskCompleted({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });
});
