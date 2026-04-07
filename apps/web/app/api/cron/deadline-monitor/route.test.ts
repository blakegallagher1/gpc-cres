import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runDeadlineMonitorCronMock,
  runWithCronMonitorMock,
} = vi.hoisted(() => ({
  runDeadlineMonitorCronMock: vi.fn(),
  runWithCronMonitorMock: vi.fn(async ({ handler }: { handler: () => Promise<Response> }) => handler()),
}));

vi.mock("@gpc/server/jobs/deadline-monitor-cron.service", () => ({
  runDeadlineMonitorCron: runDeadlineMonitorCronMock,
}));

vi.mock("@/lib/automation/sentry", () => ({
  runWithCronMonitor: runWithCronMonitorMock,
}));

describe("GET /api/cron/deadline-monitor", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.resetModules();
    process.env.CRON_SECRET = "cron-secret";

    runDeadlineMonitorCronMock.mockReset();
    runWithCronMonitorMock.mockReset();
    runWithCronMonitorMock.mockImplementation(async ({ handler }: { handler: () => Promise<Response> }) => handler());

    runDeadlineMonitorCronMock.mockResolvedValue({
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

  it("returns the package job result", async () => {
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
    expect(runDeadlineMonitorCronMock).toHaveBeenCalledTimes(1);
    expect(runWithCronMonitorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "deadline-monitor",
        schedule: "0 * * * *",
      }),
    );
  });

  it("surfaces cron execution failures through the monitor wrapper", async () => {
    runDeadlineMonitorCronMock.mockRejectedValue(new Error("boom"));

    await expect(
      GET(
        new Request("http://localhost/api/cron/deadline-monitor", {
          headers: { authorization: "Bearer cron-secret" },
        }),
      ),
    ).rejects.toThrow("boom");
  });
});
