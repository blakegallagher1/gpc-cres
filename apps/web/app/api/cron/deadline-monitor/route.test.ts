import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  orgFindFirstMock,
  runCreateMock,
  runUpdateMock,
  executeMock,
  runWithCronMonitorMock,
  DeadlineMonitorJobMock,
} = vi.hoisted(() => ({
  orgFindFirstMock: vi.fn(),
  runCreateMock: vi.fn(),
  runUpdateMock: vi.fn(),
  executeMock: vi.fn(),
  runWithCronMonitorMock: vi.fn(async ({ handler }: { handler: () => Promise<Response> }) => handler()),
  DeadlineMonitorJobMock: vi.fn(function DeadlineMonitorJob() {
    return {
      execute: executeMock,
    };
  }),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    org: {
      findFirst: orgFindFirstMock,
    },
    run: {
      create: runCreateMock,
      update: runUpdateMock,
    },
  },
}));

vi.mock("@/lib/jobs/deadline-monitor.job", () => ({
  DeadlineMonitorJob: DeadlineMonitorJobMock,
}));

vi.mock("@/lib/automation/sentry", () => ({
  runWithCronMonitor: runWithCronMonitorMock,
}));

describe("GET /api/cron/deadline-monitor", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.resetModules();
    process.env.CRON_SECRET = "cron-secret";

    orgFindFirstMock.mockReset();
    runCreateMock.mockReset();
    runUpdateMock.mockReset();
    executeMock.mockReset();
    runWithCronMonitorMock.mockReset();
    DeadlineMonitorJobMock.mockClear();
    runWithCronMonitorMock.mockImplementation(async ({ handler }: { handler: () => Promise<Response> }) => handler());

    orgFindFirstMock.mockResolvedValue({ id: "org-1" });
    runCreateMock.mockResolvedValue({ id: "run-1" });
    runUpdateMock.mockResolvedValue({});
    executeMock.mockResolvedValue({
      success: true,
      tasksScanned: 4,
      notificationsCreated: 2,
      errors: [],
      duration_ms: 1200,
    });

    ({ GET } = await import("./route"));
  });

  it("returns 401 when cron secret is invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/cron/deadline-monitor", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(runWithCronMonitorMock).not.toHaveBeenCalled();
  });

  it("continues when run audit creation hits schema drift", async () => {
    runCreateMock.mockRejectedValue(new Error('column "memory_promotion_status" does not exist'));

    const res = await GET(
      new Request("http://localhost/api/cron/deadline-monitor", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      tasksScanned: 4,
      notificationsCreated: 2,
      errors: [],
      duration_ms: 1200,
    });
    expect(runUpdateMock).not.toHaveBeenCalled();
    expect(runWithCronMonitorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "deadline-monitor",
        schedule: "0 * * * *",
      }),
    );
  });

  it("continues when run audit update hits schema drift", async () => {
    runUpdateMock.mockRejectedValue(new Error('column "memory_promotion_status" does not exist'));

    const res = await GET(
      new Request("http://localhost/api/cron/deadline-monitor", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(runCreateMock).toHaveBeenCalledTimes(1);
    expect(runUpdateMock).toHaveBeenCalledTimes(1);
  });
});
