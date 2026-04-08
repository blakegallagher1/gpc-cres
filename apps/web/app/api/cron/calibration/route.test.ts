import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runCalibrationForAllOrgsSafelyMock } = vi.hoisted(() => ({
  runCalibrationForAllOrgsSafelyMock: vi.fn(),
}));

vi.mock("@gpc/server/jobs/calibration-cron.service", () => ({
  runCalibrationForAllOrgsSafely: runCalibrationForAllOrgsSafelyMock,
}));

import { GET } from "./route";

describe("GET /api/cron/calibration", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    runCalibrationForAllOrgsSafelyMock.mockReset();
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/calibration", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(runCalibrationForAllOrgsSafelyMock).not.toHaveBeenCalled();
  });

  it("returns the successful calibration payload when the service succeeds", async () => {
    runCalibrationForAllOrgsSafelyMock.mockResolvedValue({
      ok: true,
      result: {
        success: true,
        orgsProcessed: 2,
        errors: [],
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/cron/calibration", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      orgsProcessed: 2,
      errors: [],
    });
    expect(runCalibrationForAllOrgsSafelyMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when the service reports a failed outcome", async () => {
    runCalibrationForAllOrgsSafelyMock.mockResolvedValue({ ok: false });

    const response = await GET(
      new NextRequest("http://localhost/api/cron/calibration", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});
