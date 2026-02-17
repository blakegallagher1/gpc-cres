const { dbMock, notificationServiceMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      task: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    },
  },
  notificationServiceMock: {
    create: vi.fn(),
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);
vi.mock("@/lib/services/notification.service", () => ({
  getNotificationService: () => notificationServiceMock,
}));

import { runDeadlineMonitoring } from "../deadlineMonitoring";

const NOW = new Date("2026-02-17T12:00:00.000Z");

function overdueTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    orgId: "org-1",
    dealId: "deal-1",
    title: "Submit revised site plan",
    status: "TODO",
    dueAt: new Date("2026-02-10T12:00:00.000Z"),
    createdAt: new Date("2026-01-10T12:00:00.000Z"),
    ownerUserId: "owner-1",
    deal: {
      id: "deal-1",
      name: "Test Deal",
      createdBy: "creator-1",
    },
    ...overrides,
  };
}

describe("runDeadlineMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.prisma.task.findMany.mockResolvedValue([]);
    dbMock.prisma.task.findFirst.mockResolvedValue(null);
    dbMock.prisma.task.create.mockResolvedValue({ id: "auto-task-1" });
    notificationServiceMock.create.mockResolvedValue({ id: "note-1" });
  });

  it("returns zero summary when no overdue tasks exist", async () => {
    const result = await runDeadlineMonitoring(NOW);

    expect(result.tasksScanned).toBe(0);
    expect(result.notificationTasksCreated).toBe(0);
    expect(result.notificationsCreated).toBe(0);
  });

  it("creates a follow-up task and notification for owner", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([overdueTask()]);

    const result = await runDeadlineMonitoring(NOW);

    expect(result.tasksScanned).toBe(1);
    expect(result.notificationTasksCreated).toBe(1);
    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    expect(notificationServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("assigns follow-up to deal creator when task owner is null", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([
      overdueTask({ ownerUserId: null }),
    ]);

    await runDeadlineMonitoring(NOW);

    expect(dbMock.prisma.task.create.mock.calls[0][0].data.ownerUserId).toBe(
      "creator-1",
    );
    expect(notificationServiceMock.create.mock.calls[0][0].userId).toBe(
      "creator-1",
    );
  });

  it("escalates priority to HIGH when task age is greater than 30 days", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([
      overdueTask({
        createdAt: new Date("2025-12-01T12:00:00.000Z"),
      }),
    ]);

    const result = await runDeadlineMonitoring(NOW);

    expect(result.escalatedHighPriority).toBe(1);
    expect(dbMock.prisma.task.create.mock.calls[0][0].data.title).toContain(
      "[HIGH]",
    );
    expect(notificationServiceMock.create.mock.calls[0][0].priority).toBe(
      "HIGH",
    );
  });

  it("does not escalate at exactly 30 days", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([
      overdueTask({
        createdAt: new Date("2026-01-18T12:00:00.000Z"),
      }),
    ]);

    const result = await runDeadlineMonitoring(NOW);

    expect(result.escalatedHighPriority).toBe(0);
    expect(notificationServiceMock.create.mock.calls[0][0].priority).toBe(
      "MEDIUM",
    );
  });

  it("skips when dedupe finds a recent follow-up task", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([overdueTask()]);
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "existing-auto" });

    const result = await runDeadlineMonitoring(NOW);

    expect(result.notificationTasksCreated).toBe(0);
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
    expect(notificationServiceMock.create).not.toHaveBeenCalled();
  });

  it("captures source task marker in description", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([overdueTask()]);

    await runDeadlineMonitoring(NOW);

    expect(dbMock.prisma.task.create.mock.calls[0][0].data.description).toContain(
      "sourceTaskId=task-1",
    );
  });

  it("uses configured dueAt offset for generated follow-up task", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([overdueTask()]);

    await runDeadlineMonitoring(NOW);

    const dueAt = dbMock.prisma.task.create.mock.calls[0][0].data.dueAt as Date;
    expect(dueAt.toISOString()).toBe("2026-02-18T12:00:00.000Z");
  });

  it("handles multiple overdue tasks", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([
      overdueTask({ id: "task-1", dealId: "deal-1" }),
      overdueTask({ id: "task-2", dealId: "deal-2", title: "Finalize checklist" }),
    ]);

    const result = await runDeadlineMonitoring(NOW);

    expect(result.tasksScanned).toBe(2);
    expect(result.notificationTasksCreated).toBe(2);
    expect(result.notificationsCreated).toBe(2);
  });

  it("includes overdue days in notification body", async () => {
    dbMock.prisma.task.findMany.mockResolvedValue([
      overdueTask({
        dueAt: new Date("2026-02-01T12:00:00.000Z"),
      }),
    ]);

    await runDeadlineMonitoring(NOW);

    expect(notificationServiceMock.create.mock.calls[0][0].body).toContain(
      "overdue by 16 day(s)",
    );
  });
});
