import { prisma } from "@entitlement-os/db";
import * as Sentry from "@sentry/nextjs";
import { recomputeAllSegments } from "../../../../apps/web/lib/jobs/calibrationRecompute";
import { logger, serializeErrorForLogs } from "../../../../apps/web/lib/logger";

export interface CalibrationCronResult {
  success: boolean;
  orgsProcessed: number;
  errors: Array<{ orgId: string; error: string }>;
}

/**
 * Iterates over every org in the workspace and recomputes calibration segments
 * for each. Continues on per-org failure and returns a structured report.
 */
export async function runCalibrationForAllOrgs(): Promise<CalibrationCronResult> {
  const orgs = await prisma.org.findMany({ select: { id: true } });
  const errors: Array<{ orgId: string; error: string }> = [];

  for (const org of orgs) {
    try {
      await recomputeAllSegments(org.id);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: "api.cron.calibration", method: "GET" },
      });
      errors.push({
        orgId: org.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    success: errors.length === 0,
    orgsProcessed: orgs.length,
    errors,
  };
}

/**
 * Top-level error handler used by the cron route. Returns a `CalibrationCronResult`
 * plus any top-level error so the route can choose the appropriate HTTP status.
 */
export async function runCalibrationForAllOrgsSafely(): Promise<
  | { ok: true; result: CalibrationCronResult }
  | { ok: false; error: Error }
> {
  try {
    const result = await runCalibrationForAllOrgs();
    return { ok: true, result };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    Sentry.captureException(error, {
      tags: { route: "api.cron.calibration", method: "GET" },
    });
    logger.error("Cron calibration failed", serializeErrorForLogs(error));
    return { ok: false, error };
  }
}
